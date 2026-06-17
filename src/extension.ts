import * as vscode from "vscode";
import { ApiClient } from "./services/ApiClient";
import { WebSocketClient } from "./services/WebSocketClient";
import { RepositoryMapper } from "./services/RepositoryMapper";
import { DiagnosticService } from "./diagnostics/DiagnosticService";
import { TokenManager } from "./services/TokenManager";
import { ServiceRegistry } from "./services/ServiceRegistry";

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
}

export function deactivate() {
  console.log("CodePilot Network Infrastructure Terminated cleanly.");
}
