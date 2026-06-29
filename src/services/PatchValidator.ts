export type PatchValidationResult = {
  valid: boolean;
  errors: string[];
};

export class PatchValidator {
  validate(raw: string): PatchValidationResult {
    if (!raw || raw.trim().length === 0) {
      return { valid: false, errors: ["Patch is empty"] };
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e: any) {
      return { valid: false, errors: ["Invalid JSON: " + e.message] };
    }

    const errors: string[] = [];

    if (!Array.isArray(parsed.operations)) {
      errors.push("Top-level 'operations' array is required.");
    } else {
      parsed.operations.forEach((op: any, idx: number) => {
        if (!op.type) errors.push(`op[${idx}]: missing 'type'`);
        if (!op.path) errors.push(`op[${idx}]: missing 'path'`);
        // For add/update ensure content exists
        if ((op.type === "addFile" || op.type === "updateFile" || op.type === "edit") && typeof op.content !== "string") {
          errors.push(`op[${idx}]: 'content' must be a string for type ${op.type}`);
        }
      });
    }

    return { valid: errors.length === 0, errors };
  }
}

export default PatchValidator;
