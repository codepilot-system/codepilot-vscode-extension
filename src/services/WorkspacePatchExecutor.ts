import { PatchOperation } from "./PatchTranslator";
import { WorkspaceFileWriter } from "./WorkspaceFileWriter";
import { TelemetryService } from "./TelemetryService";

export type ExecutionResult = {
  success: boolean;
  details: Array<{ op: PatchOperation; ok: boolean; error?: string }>;
};

export class WorkspacePatchExecutor {
  private writer: WorkspaceFileWriter;
  private telemetry: TelemetryService | null;

  constructor(writer: WorkspaceFileWriter, telemetry?: TelemetryService) {
    this.writer = writer;
    this.telemetry = telemetry ?? null;
  }

  async execute(ops: PatchOperation[]): Promise<ExecutionResult> {
    const details: ExecutionResult["details"] = [];

    for (const op of ops) {
      try {
        switch (op.type) {
          case "addFile":
          case "updateFile":
          case "edit":
            await this.writer.writeFile(op.path, op.content);
            details.push({ op, ok: true });
            break;
          case "deleteFile":
            // best-effort delete
            // eslint-disable-next-line no-case-declarations
            const workspace = (await import("vscode")).workspace;
            const root = workspace.workspaceFolders?.[0]?.uri;
            if (!root) throw new Error("No workspace root");
            const target = root.with({
              path: root.path + "/" + op.path.replace(/^\/+/, ""),
            });
            await workspace.fs.delete(target, {
              recursive: false,
              useTrash: false,
            });
            details.push({ op, ok: true });
            break;
          default:
            details.push({ op, ok: false, error: "Unknown op" });
        }

        this.telemetry?.sendEvent("patch.op.succeeded", {
          type: op.type,
          path: op.path,
        });
      } catch (e: any) {
        details.push({ op, ok: false, error: e?.message ?? String(e) });
        this.telemetry?.sendEvent("patch.op.failed", {
          type: op.type,
          path: op.path,
          error: e?.message ?? String(e),
        });
      }
    }

    const success = details.every((d) => d.ok);
    this.telemetry?.sendEvent("patch.execution.completed", { success });

    return { success, details };
  }
}

export default WorkspacePatchExecutor;
