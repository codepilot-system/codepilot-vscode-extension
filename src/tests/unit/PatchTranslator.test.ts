import * as assert from "assert";
import { PatchTranslator } from "../../services/PatchTranslator";

describe("PatchTranslator Unit Test Suite", () => {
  let translator: PatchTranslator;

  beforeEach(() => {
    translator = new PatchTranslator();
  });

  // ======= PASS PATHS =======
  it("Should normalize leading slashes in file paths", () => {
    const rawPatch = {
      operations: [
        {
          type: "addFile",
          path: "///src/components/Main.ts",
          content: "const x = 1;",
        },
      ],
    };
    const result = translator.translate(rawPatch);
    assert.strictEqual(
      result[0].path,
      "src/components/Main.ts",
      "Should cleanly strip multiple leading slashes.",
    );
  });

  it("Should fall back to 'edit' type if type is unknown", () => {
    const rawPatch = {
      operations: [
        { type: "magicRewriteOp", path: "utils.ts", content: "console.log();" },
      ],
    };
    const result = translator.translate(rawPatch);
    assert.strictEqual(
      result[0].type,
      "edit",
      "Should default an unrecognized type string to an 'edit' action.",
    );
  });

  it("Should cleanly parse all native supported action types down into structural items", () => {
    const mixedPatch = {
      operations: [
        { type: "addFile", path: "a.ts", content: "add" },
        { type: "updateFile", path: "b.ts", content: "update" },
        { type: "deleteFile", path: "c.ts" },
        { type: "edit", path: "d.ts", content: "edit" },
      ],
    };

    const result = translator.translate(mixedPatch);

    assert.strictEqual(result.length, 4);
    assert.strictEqual(result[0].type, "addFile");
    assert.strictEqual(result[1].type, "updateFile");
    assert.strictEqual(result[2].type, "deleteFile");
    assert.strictEqual(result[3].type, "edit");
  });

  // ======= FAIL / BOUNDARY PATHS =======
  it("Should safely return an empty array if parsedPatch input value is null or undefined", () => {
    const nullResult = translator.translate(null);
    const undefinedResult = translator.translate(undefined);

    assert.deepStrictEqual(nullResult, []);
    assert.deepStrictEqual(undefinedResult, []);
  });

  it("Should safely return an empty array if operations wrapper field is missing or not an array", () => {
    const invalidFormat = { operations: "NotAnArrayValue" };
    const missingField = { changes: [] };

    assert.deepStrictEqual(translator.translate(invalidFormat), []);
    assert.deepStrictEqual(translator.translate(missingField), []);
  });

  it("Should retain undefined values safely if path or content fields are missing inside the operation item", () => {
    const incompletePatch = {
      operations: [
        { type: "addFile" }, // Missing path and content entirely
      ],
    };
    const result = translator.translate(incompletePatch);

    assert.strictEqual(result[0].path, undefined);
    // Cast to any to bypass strict union property layout checks on deleteFile
    assert.strictEqual((result[0] as any).content, undefined);
  });
});
