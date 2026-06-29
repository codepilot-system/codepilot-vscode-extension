import * as path from "path";

export type PatchOperation =
  | { type: "addFile"; path: string; content: string }
  | { type: "updateFile"; path: string; content: string }
  | { type: "deleteFile"; path: string }
  | { type: "edit"; path: string; content: string };

export class PatchTranslator {
  translate(parsedPatch: any): PatchOperation[] {
    if (!parsedPatch || !Array.isArray(parsedPatch.operations)) return [];

    const ops: PatchOperation[] = parsedPatch.operations.map((op: any) => {
      const normalizedPath = op.path ? op.path.replace(/^\/+/, "") : op.path;
      switch (op.type) {
        case "addFile":
          return { type: "addFile", path: normalizedPath, content: op.content };
        case "updateFile":
          return { type: "updateFile", path: normalizedPath, content: op.content };
        case "deleteFile":
          return { type: "deleteFile", path: normalizedPath };
        case "edit":
          return { type: "edit", path: normalizedPath, content: op.content };
        default:
          return { type: "edit", path: normalizedPath, content: op.content };
      }
    });

    return ops;
  }
}

export default PatchTranslator;
