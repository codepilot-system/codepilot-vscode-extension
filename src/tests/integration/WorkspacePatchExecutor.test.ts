import * as assert from "assert";
import * as sinon from "sinon";
import { WorkspacePatchExecutor } from "../../services/WorkspacePatchExecutor";
import { WorkspaceFileWriter } from "../../services/WorkspaceFileWriter";

describe("WorkspacePatchExecutor Structural Mutation Test Suite", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("Should successfully trigger file writes for valid patch operations", async () => {
    const writer = new WorkspaceFileWriter();
    // Intercept the call safely to keep the test environment isolated
    const writeStub = sinon.stub(writer, "writeFile").resolves();

    const executor = new WorkspacePatchExecutor(writer);

    // Using "edit" to perfectly trigger your class's internal switch-case
    const patchInstructions = [
      {
        type: "edit",
        path: "dummy_path.ts",
        content: "export const target = 'mutated_by_codepilot';\n",
      },
    ];

    const result = await executor.execute(patchInstructions as any);

    // 1. Verify the pipeline returned a success outcome status
    assert.strictEqual(
      result.success,
      true,
      "The entire patch execution collection should mark successful.",
    );

    // 2. Prove that the writer was invoked with the exact arguments
    assert.ok(
      writeStub.calledOnce,
      "The patch executor failed to invoke the file writer.",
    );
    assert.ok(
      writeStub.calledWith(
        "dummy_path.ts",
        "export const target = 'mutated_by_codepilot';\n",
      ),
      "The file writer was not called with the correct parameters.",
    );
  });
});
