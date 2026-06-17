import * as vscode from "vscode";

export class RepositoryMapper {
  /**
   * Resolves the exact remote fetch URL belonging to the active developer document scope
   */
  public static getRemoteUrlForActiveFile(): string | null {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) return null;

    try {
      const gitExtension =
        vscode.extensions.getExtension("vscode.git")?.exports;
      if (!gitExtension) return null;

      const gitApi = gitExtension.getAPI(1);
      const activeFileUri = activeEditor.document.uri;

      // Find the repository that contains the active file path
      const matchingRepo = gitApi.repositories.find((repo: any) => {
        return activeFileUri.fsPath.startsWith(repo.rootUri.fsPath);
      });

      const targetRepo = matchingRepo || gitApi.repositories[0];
      if (!targetRepo || !targetRepo.state.remotes.length) return null;

      const remote =
        targetRepo.state.remotes.find((r: any) => r.name === "origin") ||
        targetRepo.state.remotes[0];
      return remote.fetchUrl || null;
    } catch (error) {
      console.error("CodePilot Context Mapping Failure:", error);
      return null;
    }
  }
}
