import * as vscode from "vscode";
import * as crypto from "crypto";
import { applyPatch } from "diff"; // NEW — needed to compute "after" content for diff preview
import { ApiClient } from "./services/ApiClient";
import { WebSocketClient } from "./services/WebSocketClient";
import { RepositoryMapper } from "./services/RepositoryMapper";
import { DiagnosticService } from "./diagnostics/DiagnosticService";
import { TokenManager } from "./services/TokenManager";
import { ServiceRegistry } from "./services/ServiceRegistry";
import { PatchValidator } from "./services/PatchValidator";
import { PatchTranslator } from "./services/PatchTranslator";
import { WorkspaceFileWriter } from "./services/WorkspaceFileWriter";
import { WorkspacePatchExecutor } from "./services/WorkspacePatchExecutor";
import { TelemetryService } from "./services/TelemetryService";
import { AstContextExtractor } from "./ast/AstContextExtractor";
process.removeAllListeners("warning");

// NEW — checks if a diffPatch string is a real unified diff before attempting to render/apply it
function isUnifiedDiffLike(patch: string | undefined | null): boolean {
  if (!patch) return false;
  return patch.includes("@@") && (patch.includes("---") || patch.includes("+++"));
}

// NEW — serves virtual "patched file" content so vscode.diff can compare it against the real file
class SuggestionPreviewContentProvider implements vscode.TextDocumentContentProvider {
  private content = new Map<string, string>();
  private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this.onDidChangeEmitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.content.get(uri.toString()) ?? "";
  }

  setContent(uri: vscode.Uri, content: string) {
    this.content.set(uri.toString(), content);
    this.onDidChangeEmitter.fire(uri);
  }
}

export async function activate(context: vscode.ExtensionContext) {
  console.log("CodePilot Network Infrastructure Tier initializing...");

  const apiClient = new ApiClient(context);
  const wsClient = new WebSocketClient();
  const diagnosticService = new DiagnosticService();

  ServiceRegistry.apiClient = apiClient;
  ServiceRegistry.diagnosticService = diagnosticService;

  context.subscriptions.push(diagnosticService.getCollection());

  // NEW — register the virtual content provider for diff previews
  const suggestionPreviewProvider = new SuggestionPreviewContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      "codepilot-preview",
      suggestionPreviewProvider,
    ),
  );

  // --- Production Bootstrap Sequence ---
  const remoteUrl = RepositoryMapper.getRemoteUrlForActiveFile();
  if (remoteUrl) {
    let repoId = context.workspaceState.get<string>("codepilot_cached_repo_id");

    if (!repoId) {
      const structuralMapping = await apiClient
        .registerOrMapRepo(remoteUrl)
        .catch(() => null);
      if (structuralMapping) {
        repoId = structuralMapping.repositoryId;
        await context.workspaceState.update("codepilot_cached_repo_id", repoId);
      }
    }

    if (repoId) {
      const activeToken = await TokenManager.getAccessToken(context);

      await apiClient["refreshCsrfToken"]();
      const csrfToken = apiClient["csrfToken"];
      if (activeToken) {
        wsClient.connect(activeToken, repoId, csrfToken, (message) => {
          if (
            message.event === "issue_detected" ||
            message.event === "scan_complete"
          ) {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && message.data.issues) {
              diagnosticService.applyIssuesToDocument(
                activeEditor.document,
                message.data.issues,
              );
            }
          }
        });
      }
    }
  }

  // Register file listeners
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) diagnosticService.clearAllDiagnostics();
    }),
    { dispose: () => wsClient.disconnect() },
  );

  // --- Patch system initialization ---
  const patchValidator = new PatchValidator();
  const patchTranslator = new PatchTranslator();
  const workspaceFileWriter = new WorkspaceFileWriter();
  const telemetryService = new TelemetryService(apiClient);
  const workspacePatchExecutor = new WorkspacePatchExecutor(
    workspaceFileWriter,
    telemetryService,
  );

  ServiceRegistry.patchValidator = patchValidator;
  ServiceRegistry.patchTranslator = patchTranslator;
  ServiceRegistry.workspaceFileWriter = workspaceFileWriter;
  ServiceRegistry.telemetryService = telemetryService;
  ServiceRegistry.workspacePatchExecutor = workspacePatchExecutor;

  // Apply Patch Command (unchanged)
  const applyPatchCmd = vscode.commands.registerCommand(
    "codepilot.applyPatch",
    async () => {
      const editor = vscode.window.activeTextEditor;
      let raw = "";
      if (editor) {
        raw = editor.document.getText();
      } else {
        raw =
          (await vscode.window.showInputBox({ prompt: "Paste patch JSON" })) ||
          "";
      }

      if (editor && editor.document.isDirty) {
        const choice = await vscode.window.showWarningMessage(
          "You have unsaved changes in the active editor. Save before applying patch?",
          { modal: true },
          "Save and Continue",
          "Continue Without Saving",
          "Cancel",
        );

        if (choice === "Save and Continue") {
          const saved = await editor.document.save();
          if (!saved) {
            vscode.window.showErrorMessage(
              "Save failed — aborting patch apply.",
            );
            return;
          }
        } else if (choice === "Cancel" || typeof choice === "undefined") {
          return;
        }
      }

      const validation = patchValidator.validate(raw);
      if (!validation.valid) {
        vscode.window.showErrorMessage(
          "Patch validation failed: " + validation.errors.join("; "),
        );
        return;
      }

      const parsed = JSON.parse(raw);
      const ops = patchTranslator.translate(parsed);
      const checksums: Record<string, string> = parsed?.checksums || {};

      if (Object.keys(checksums).length > 0) {
        const workspace = vscode.workspace;
        const root = workspace.workspaceFolders?.[0]?.uri;
        for (const [relPath, expectedHash] of Object.entries(checksums)) {
          try {
            if (!root) throw new Error("No workspace root");
            const target = root.with({
              path: root.path + "/" + relPath.replace(/^\/+/, ""),
            });
            const fileData = await workspace.fs.readFile(target);
            const decoder = new TextDecoder();
            const currentContent = decoder.decode(fileData);
            const currentHash = crypto
              .createHash("sha256")
              .update(currentContent, "utf8")
              .digest("hex");

            if (currentHash !== expectedHash) {
              const proceed = await vscode.window.showWarningMessage(
                `Checksum mismatch for ${relPath}. File has changed. Apply anyway?`,
                { modal: true },
                "Apply Anyway",
                "Abort",
              );
              if (proceed !== "Apply Anyway") return;
            }
          } catch (e: any) {
            const relatedOp = ops.find((o) => o.path === relPath);
            if (!relatedOp || relatedOp.type !== "addFile") {
              const proceed = await vscode.window.showWarningMessage(
                `Could not verify checksum for ${relPath}. Apply anyway?`,
                { modal: true },
                "Apply Anyway",
                "Abort",
              );
              if (proceed !== "Apply Anyway") return;
            }
          }
        }
      }

      const result = await workspacePatchExecutor.execute(ops);
      if (result.success) {
        vscode.window.showInformationMessage("Patch applied successfully.");
      } else {
        vscode.window.showErrorMessage("Patch applied with errors.");
      }
    },
  );

  // Show Suggestions Command (unchanged)
  const showSuggestionsCmd = vscode.commands.registerCommand(
    "codepilot.showSuggestions",
    async () => {
      const repoId =
        context.workspaceState.get<string>("codepilot_cached_repo_id") ||
        "mock-local-repo-id";

      const token = await apiClient.getValidAccessToken();
      if (!token) {
        vscode.window.showErrorMessage(
          "Not authenticated to CodePilot. Please log in first.",
        );
        return;
      }

      const suggestions = await apiClient.getSuggestions(repoId);
      if (!suggestions) {
        vscode.window.showErrorMessage(
          "Failed to fetch suggestions from CodePilot.",
        );
        return;
      }

      const items = suggestions.map((s: any) => ({
        label: s.title || `Suggestion ${s.id}`,
        description: s.summary || s.description || "",
        id: s.id,
      }));

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a suggestion to preview",
      });
      if (!pick) return;

      const action = await vscode.window.showQuickPick(["Preview", "Apply"], {
        placeHolder: "Action?",
      });
      if (!action) return;

      if (action === "Preview") {
        vscode.commands.executeCommand("codepilot.previewSuggestion", pick.id);
      } else {
        vscode.commands.executeCommand("codepilot.applySuggestion", pick.id);
      }
    },
  );

  // UPDATED — previewSuggestionCmd now renders a real diff view when possible
  const previewSuggestionCmd = vscode.commands.registerCommand(
    "codepilot.previewSuggestion",
    async (suggestionId?: string) => {
      let id =
        suggestionId ||
        (await vscode.window.showInputBox({ prompt: "Enter suggestion id" }));
      if (!id) return;

      const suggestion = await apiClient.getSuggestion(id);
      if (!suggestion) {
        vscode.window.showErrorMessage("Could not fetch suggestion details.");
        return;
      }

      const filePath = suggestion.filePath ?? suggestion.issue?.filePath;

      // Fallback: no valid diff or no known file path — show raw details instead
      if (!isUnifiedDiffLike(suggestion.diffPatch) || !filePath) {
        const doc = await vscode.workspace.openTextDocument({
          content: JSON.stringify(suggestion, null, 2),
          language: "json",
        });
        await vscode.window.showTextDocument(doc, { preview: true });
        return;
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder open.");
        return;
      }

      try {
        const originalUri = vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
        const originalBytes = await vscode.workspace.fs.readFile(originalUri);
        const originalContent = new TextDecoder().decode(originalBytes);

        const patchedContent = applyPatch(originalContent, suggestion.diffPatch);

        if (patchedContent === false) {
          vscode.window.showWarningMessage(
            "Could not apply this suggestion's diff to the current file content — showing details instead.",
          );
          const doc = await vscode.workspace.openTextDocument({
            content: JSON.stringify(suggestion, null, 2),
            language: "json",
          });
          await vscode.window.showTextDocument(doc, { preview: true });
          return;
        }

        const previewUri = originalUri.with({
          scheme: "codepilot-preview",
          path: originalUri.path + `.suggestion-${id}`,
        });
        suggestionPreviewProvider.setContent(previewUri, patchedContent as string);

        await vscode.commands.executeCommand(
          "vscode.diff",
          originalUri,
          previewUri,
          `${filePath} ↔ Suggested Fix: ${suggestion.summary}`,
        );
      } catch (err: any) {
        vscode.window.showErrorMessage(
          `Could not open diff preview: ${err.message || err}`,
        );
      }
    },
  );

  // UPDATED — checks the correct field name from the backend response
  const applySuggestionCmd = vscode.commands.registerCommand(
    "codepilot.applySuggestion",
    async (suggestionId?: string) => {
      let id =
        suggestionId ||
        (await vscode.window.showInputBox({ prompt: "Enter suggestion id" }));
      if (!id) return;

      const serverResp = await apiClient.applySuggestion(id);
      if (serverResp && serverResp.suggestionsApplyId) {
        vscode.window.showInformationMessage(
          `Suggestion apply requested on server (status: ${serverResp.status}).`,
        );
        return;
      }

      // Fallback only reached if the server call genuinely failed
      const patch = await apiClient.getSuggestionPatch(id);
      if (!patch) return;

      const ops = patchTranslator.translate(patch);
      const result = await workspacePatchExecutor.execute(ops);
      if (result.success)
        vscode.window.showInformationMessage(
          "Suggestion applied locally (server unavailable).",
        );
    },
  );

  const validatePatchCmd = vscode.commands.registerCommand(
    "codepilot.validatePatch",
    async () => {
      const editor = vscode.window.activeTextEditor;
      const raw = editor
        ? editor.document.getText()
        : (await vscode.window.showInputBox({ prompt: "Paste patch JSON" })) ||
          "";
      const validation = patchValidator.validate(raw);
      if (validation.valid)
        vscode.window.showInformationMessage("Patch is valid");
      else vscode.window.showErrorMessage("Patch invalid");
    },
  );

  const triggerLocalScanCmd = vscode.commands.registerCommand(
    "codepilot.triggerLocalScan",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active text editor found.");
        return;
      }

      const document = editor.document;
      const content = document.getText();
      const relativePath = vscode.workspace.asRelativePath(document.uri);

      const selection = editor.selection;
      let selectedLines: Array<{ start: number; end: number }> | undefined;
      if (selection && !selection.isEmpty) {
        selectedLines = [
          {
            start: selection.start.line + 1,
            end: selection.end.line + 1,
          },
        ];
      }

      const repoId = context.workspaceState.get<string>("codepilot_cached_repo_id");

      const token = await apiClient.getValidAccessToken();
      if (!token) {
        vscode.window.showErrorMessage("Not authenticated to CodePilot. Please log in first.");
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "CodePilot: Running local analysis...",
          cancellable: false,
        },
        async () => {
          try {
            const files = [
              {
                path: relativePath,
                content: content,
                selectedLines: selectedLines,
              },
            ];

            const result = await apiClient.sendLocalScanPayload(repoId, files);

            if (result && result.issues) {
              const backendIssues = result.issues.map((issue: any, index: number) => ({
                id: `local_${Date.now()}_${index}`,
                type: issue.category || "static-analysis",
                description: issue.summary || issue.explanation || "Analysis finding",
                severity: (issue.severity === "HIGH" || issue.severity === "CRITICAL") ? "error" : "warning",
                startLine: issue.lineNumber || 1,
                endLine: issue.lineNumber || 1,
                filePath: issue.filePath || relativePath,
                suggestedFix: issue.suggestions?.[0],
              }));

              diagnosticService.applyIssuesToDocument(document, backendIssues);

              if (backendIssues.length > 0) {
                vscode.window.showInformationMessage(
                  `CodePilot local analysis completed: ${backendIssues.length} issue(s) detected.`,
                );
              } else {
                vscode.window.showInformationMessage("CodePilot local analysis completed: No issues found.");
              }
            } else {
              vscode.window.showWarningMessage("CodePilot: Local scan returned no results.");
            }
          } catch (error: any) {
            vscode.window.showErrorMessage(
              `CodePilot local analysis failed: ${error.message || error}`,
            );
          }
        },
      );
    },
  );

  context.subscriptions.push(
    applyPatchCmd,
    validatePatchCmd,
    showSuggestionsCmd,
    previewSuggestionCmd,
    applySuggestionCmd,
    triggerLocalScanCmd,
  );
}

export function deactivate() {
  console.log("CodePilot Network Infrastructure Terminated cleanly.");
}