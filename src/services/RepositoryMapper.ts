import * as vscode from "vscode";

export class RepositoryMapper {
  public static getRemoteUrlForActiveFile(): string | undefined {
    const gitExtension = vscode.extensions.getExtension("vscode.git");

    // 1. Ensure extension is found
    if (!gitExtension) {
      console.warn("Git extension not found.");
      return undefined;
    }

    // 2. Ensure extension is active before accessing exports
    if (!gitExtension.isActive) {
      console.warn("Git extension is not active.");
      return undefined;
    }

    try {
      const gitApi = gitExtension.exports.getAPI(1);
      const activeEditor = vscode.window.activeTextEditor;

      if (!activeEditor) {
        console.warn("No active text editor found.");
        return undefined;
      }

      const activeFileUri = activeEditor.document.uri;

      // 3. Find matching repository
      const matchingRepo = gitApi.repositories.find((repo: any) => {
        return activeFileUri.fsPath.startsWith(repo.rootUri.fsPath);
      });

      const targetRepo = matchingRepo || gitApi.repositories[0];
      if (!targetRepo || !targetRepo.state.remotes.length) return undefined;

      const remote =
        targetRepo.state.remotes.find((r: any) => r.name === "origin") ||
        targetRepo.state.remotes[0];

      return remote.fetchUrl || undefined;
    } catch (error) {
      console.error("CodePilot Context Mapping Failure:", error);
      return undefined;
    }
  }
}
