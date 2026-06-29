import * as vscode from "vscode";

export class WorkspaceFileWriter {
  async writeFile(relativePath: string, content: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error("No workspace folder open");
    }

    const root = workspaceFolders[0].uri;
    const target = root.with({ path: root.path + "/" + relativePath.replace(/^\/+/, "") });

    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);

    // Ensure parent folder exists (best-effort)
    try {
      await vscode.workspace.fs.writeFile(target, bytes as Uint8Array);
    } catch (e) {
      throw e;
    }
  }
}

export default WorkspaceFileWriter;
