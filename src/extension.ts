import * as vscode from "vscode";
import * as crypto from "crypto";
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
export async function activate(context: vscode.ExtensionContext) {
  console.log("CodePilot Network Infrastructure Tier initializing...");

  const apiClient = new ApiClient(context);
  const wsClient = new WebSocketClient();
  const diagnosticService = new DiagnosticService();

  ServiceRegistry.apiClient = apiClient;
  ServiceRegistry.diagnosticService = diagnosticService;

  context.subscriptions.push(diagnosticService.getCollection());

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

  // Apply Patch Command
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

  // Show Suggestions Command
  const showSuggestionsCmd = vscode.commands.registerCommand(
    "codepilot.showSuggestions",
    async () => {
      const repoId =
        context.workspaceState.get<string>("codepilot_cached_repo_id") ||
        "mock-local-repo-id";
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

  const previewSuggestionCmd = vscode.commands.registerCommand(
    "codepilot.previewSuggestion",
    async (suggestionId?: string) => {
      let id =
        suggestionId ||
        (await vscode.window.showInputBox({ prompt: "Enter suggestion id" }));
      if (!id) return;

      const suggestion = await apiClient.getSuggestion(id);
      const patch = await apiClient.getSuggestionPatch(id);
      if (!suggestion) return;

      const doc = await vscode.workspace.openTextDocument({
        content: JSON.stringify({ suggestion, patch }, null, 2),
        language: "json",
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    },
  );

  const applySuggestionCmd = vscode.commands.registerCommand(
    "codepilot.applySuggestion",
    async (suggestionId?: string) => {
      let id =
        suggestionId ||
        (await vscode.window.showInputBox({ prompt: "Enter suggestion id" }));
      if (!id) return;

      const serverResp = await apiClient.applySuggestion(id);
      if (serverResp && serverResp.accepted) {
        vscode.window.showInformationMessage(
          "Suggestion apply requested on server.",
        );
        return;
      }

      const patch = await apiClient.getSuggestionPatch(id);
      if (!patch) return;

      const ops = patchTranslator.translate(patch);
      const result = await workspacePatchExecutor.execute(ops);
      if (result.success)
        vscode.window.showInformationMessage("Suggestion applied locally.");
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

  context.subscriptions.push(
    applyPatchCmd,
    validatePatchCmd,
    showSuggestionsCmd,
    previewSuggestionCmd,
    applySuggestionCmd,
  );
}

export function deactivate() {
  console.log("CodePilot Network Infrastructure Terminated cleanly.");
}
