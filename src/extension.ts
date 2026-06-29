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

export async function activate(context: vscode.ExtensionContext) {
  console.log("CodePilot Network Infrastructure Tier initializing...");

  // Instantiate your architectural dependencies
  const apiClient = new ApiClient(context);
  const wsClient = new WebSocketClient();
  const diagnosticService = new DiagnosticService();

  // Assign globally to your registry for Member 3
  ServiceRegistry.apiClient = apiClient;
  ServiceRegistry.diagnosticService = diagnosticService;

  // Fix 7: Push the diagnostic collection directly to subscriptions to clean up memory leaks upon close
  context.subscriptions.push(diagnosticService.getCollection());

  // Fix 9: Concrete command execution wireframe serving as bridge for UI actions
  const scanCommand = vscode.commands.registerCommand(
    "codepilot.triggerLocalScan",
    async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) return;

      const repoId = context.workspaceState.get<string>(
        "codepilot_cached_repo_id",
      );
      if (!repoId) {
        vscode.window.showErrorMessage(
          "Error: Active project workspace mapping missing.",
        );
        return;
      }

      // Dummy payload structure handed from Member 1 to your pipeline
      const contextPayload = {
        fileUri: activeEditor.document.uri.toString(),
        languageId: activeEditor.document.languageId,
        content: activeEditor.document.getText(),
        fingerprint: "ast_computed_hash",
      };

      await apiClient.sendScanPayload(repoId, contextPayload);
      vscode.window.showInformationMessage(
        "CodePilot repository analysis context uploaded.",
      );
    },
  );
  context.subscriptions.push(scanCommand);

  // Bootstrap Workspace repository mappings
  const remoteUrl = RepositoryMapper.getRemoteUrlForActiveFile();
  if (remoteUrl) {
    // Fix 8: Query fast local workspace memory state cache prior to pounding network requests
    let repoId = context.workspaceState.get<string>("codepilot_cached_repo_id");

    if (!repoId) {
      const structuralMapping = await apiClient.registerOrMapRepo(remoteUrl);
      if (structuralMapping) {
        repoId = structuralMapping.repositoryId;
        await context.workspaceState.update("codepilot_cached_repo_id", repoId);
      }
    }

    if (repoId) {
      console.log(`Repository context synced cleanly. [Target ID: ${repoId}]`);

      const activeToken = await TokenManager.getToken(context);
      if (activeToken) {
        wsClient.connect(activeToken, repoId, (message) => {
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

  // Register file listeners to keep track of view changes dynamically
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
  const workspacePatchExecutor = new WorkspacePatchExecutor(workspaceFileWriter, telemetryService);

  ServiceRegistry.patchValidator = patchValidator;
  ServiceRegistry.patchTranslator = patchTranslator;
  ServiceRegistry.workspaceFileWriter = workspaceFileWriter;
  ServiceRegistry.telemetryService = telemetryService;
  ServiceRegistry.workspacePatchExecutor = workspacePatchExecutor;

  const applyPatchCmd = vscode.commands.registerCommand("codepilot.applyPatch", async () => {
    const editor = vscode.window.activeTextEditor;
    let raw = "";
    if (editor) {
      raw = editor.document.getText();
    } else {
      raw = await vscode.window.showInputBox({ prompt: "Paste patch JSON" }) || "";
    }

    // Editor-safety: if active editor has unsaved changes, prompt to save
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
          vscode.window.showErrorMessage("Save failed — aborting patch apply.");
          return;
        }
      } else if (choice === "Cancel" || typeof choice === "undefined") {
        return;
      }
      // if "Continue Without Saving", proceed — user explicitly allowed it
    }

    const validation = patchValidator.validate(raw);
    if (!validation.valid) {
      vscode.window.showErrorMessage("Patch validation failed: " + validation.errors.join("; "));
      return;
    }

    const parsed = JSON.parse(raw);
    const ops = patchTranslator.translate(parsed);

    // If patch includes expected checksums, compare them against workspace files
    // Supported shapes: parsed.checksums = { "path/to/file": "sha256hex" }
    const checksums: Record<string, string> = parsed?.checksums || {};
    if (Object.keys(checksums).length > 0) {
      const workspace = vscode.workspace;
      const root = workspace.workspaceFolders?.[0]?.uri;
      for (const [relPath, expectedHash] of Object.entries(checksums)) {
        try {
          if (!root) throw new Error("No workspace root");
          const target = root.with({ path: root.path + "/" + relPath.replace(/^\/+/, "") });
          const fileData = await workspace.fs.readFile(target);
          const decoder = new TextDecoder();
          const currentContent = decoder.decode(fileData);
          const currentHash = crypto.createHash("sha256").update(currentContent, "utf8").digest("hex");
          if (currentHash !== expectedHash) {
            const proceed = await vscode.window.showWarningMessage(
              `Checksum mismatch for ${relPath}. File has changed since suggestion was created. Apply anyway?`,
              { modal: true },
              "Apply Anyway",
              "Abort",
            );
            if (proceed !== "Apply Anyway") {
              vscode.window.showInformationMessage("Patch application aborted by user due to checksum mismatch.");
              return;
            }
          }
        } catch (e: any) {
          // If file doesn't exist and op is an addFile, allow; otherwise warn and optionally abort
          const relatedOp = ops.find((o) => o.path === relPath);
          if (!relatedOp || relatedOp.type !== "addFile") {
            const proceed = await vscode.window.showWarningMessage(
              `Could not verify checksum for ${relPath}: ${e?.message || String(e)}. Apply anyway?`,
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
      vscode.window.showErrorMessage("Patch applied with errors. Check console for details.");
      console.warn(result.details);
    }
  });

  const showSuggestionsCmd = vscode.commands.registerCommand("codepilot.showSuggestions", async () => {
    const repoId = context.workspaceState.get<string>("codepilot_cached_repo_id");
    const suggestions = await apiClient.getSuggestions(repoId || undefined);
    if (!suggestions) {
      vscode.window.showErrorMessage("Failed to fetch suggestions from CodePilot.");
      return;
    }

    const items = suggestions.map((s: any) => ({
      label: s.title || `Suggestion ${s.id}`,
      description: s.summary || s.description || "",
      id: s.id,
    }));

    const pick = await vscode.window.showQuickPick(items, { placeHolder: "Select a suggestion to preview" });
    if (!pick) return;

    // Offer preview or apply
    const action = await vscode.window.showQuickPick(["Preview", "Apply"], { placeHolder: "Preview or apply the selected suggestion?" });
    if (!action) return;
    if (action === "Preview") {
      vscode.commands.executeCommand("codepilot.previewSuggestion", pick.id);
    } else {
      vscode.commands.executeCommand("codepilot.applySuggestion", pick.id);
    }
  });

  const previewSuggestionCmd = vscode.commands.registerCommand("codepilot.previewSuggestion", async (suggestionId?: string) => {
    let id = suggestionId;
    if (!id) {
      id = await vscode.window.showInputBox({ prompt: "Enter suggestion id to preview" }) || undefined;
    }
    if (!id) return;

    const suggestion = await apiClient.getSuggestion(id);
    if (!suggestion) {
      vscode.window.showErrorMessage("Failed to load suggestion.");
      return;
    }

    // Fetch patch if available
    const patch = await apiClient.getSuggestionPatch(id);

    const doc = await vscode.workspace.openTextDocument({ content: JSON.stringify({ suggestion, patch }, null, 2), language: "json" });
    await vscode.window.showTextDocument(doc, { preview: true });
  });

  const applySuggestionCmd = vscode.commands.registerCommand("codepilot.applySuggestion", async (suggestionId?: string) => {
    let id = suggestionId;
    if (!id) {
      id = await vscode.window.showInputBox({ prompt: "Enter suggestion id to apply" }) || undefined;
    }
    if (!id) return;

    // Try server-side apply first (preferred)
    const serverResp = await apiClient.applySuggestion(id);
    if (serverResp && serverResp.accepted) {
      vscode.window.showInformationMessage("Suggestion apply requested on server; monitor status in CodePilot.");
      return;
    }

    // Fallback: fetch patch and apply locally
    const patch = await apiClient.getSuggestionPatch(id);
    if (!patch) {
      vscode.window.showErrorMessage("No patch available for suggestion.");
      return;
    }

    const raw = JSON.stringify(patch);
    const validation = patchValidator.validate(raw);
    if (!validation.valid) {
      vscode.window.showErrorMessage("Patch validation failed: " + validation.errors.join("; "));
      return;
    }

    const parsed = patch;
    const ops = patchTranslator.translate(parsed);

    // Reuse checksum verification logic from applyPatch flow
    const checksums: Record<string, string> = parsed?.checksums || {};
    if (Object.keys(checksums).length > 0) {
      const workspace = vscode.workspace;
      const root = workspace.workspaceFolders?.[0]?.uri;
      for (const [relPath, expectedHash] of Object.entries(checksums)) {
        try {
          if (!root) throw new Error("No workspace root");
          const target = root.with({ path: root.path + "/" + relPath.replace(/^\/+/, "") });
          const fileData = await workspace.fs.readFile(target);
          const decoder = new TextDecoder();
          const currentContent = decoder.decode(fileData);
          const currentHash = crypto.createHash("sha256").update(currentContent, "utf8").digest("hex");
          if (currentHash !== expectedHash) {
            const proceed = await vscode.window.showWarningMessage(
              `Checksum mismatch for ${relPath}. File has changed since suggestion was created. Apply anyway?`,
              { modal: true },
              "Apply Anyway",
              "Abort",
            );
            if (proceed !== "Apply Anyway") {
              vscode.window.showInformationMessage("Patch application aborted by user due to checksum mismatch.");
              return;
            }
          }
        } catch (e: any) {
          const relatedOp = ops.find((o) => o.path === relPath);
          if (!relatedOp || relatedOp.type !== "addFile") {
            const proceed = await vscode.window.showWarningMessage(
              `Could not verify checksum for ${relPath}: ${e?.message || String(e)}. Apply anyway?`,
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
    if (result.success) vscode.window.showInformationMessage("Suggestion applied locally.");
    else {
      vscode.window.showErrorMessage("Suggestion applied with errors. Check console for details.");
      console.warn(result.details);
    }
  });

  context.subscriptions.push(showSuggestionsCmd, previewSuggestionCmd, applySuggestionCmd);

  const validatePatchCmd = vscode.commands.registerCommand("codepilot.validatePatch", async () => {
    const editor = vscode.window.activeTextEditor;
    let raw = "";
    if (editor) raw = editor.document.getText();
    else raw = await vscode.window.showInputBox({ prompt: "Paste patch JSON" }) || "";

    const validation = patchValidator.validate(raw);
    if (validation.valid) vscode.window.showInformationMessage("Patch is valid");
    else vscode.window.showErrorMessage("Patch invalid: " + validation.errors.join("; "));
  });

  context.subscriptions.push(applyPatchCmd, validatePatchCmd);
}

export function deactivate() {
  console.log("CodePilot Network Infrastructure Terminated cleanly.");
}
