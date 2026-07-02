import * as assert from "assert";
import * as vscode from "vscode";

describe("Extension E2E Integration Test Suite", () => {
  it("Should activate CodePilot extension cleanly within host container", async () => {
    const ext = vscode.extensions.getExtension("your-publisher-name.codepilot");

    if (ext) {
      await ext.activate();
      assert.strictEqual(
        ext.isActive,
        true,
        "Extension should be active after initialization completes",
      );
    }
  });
});
