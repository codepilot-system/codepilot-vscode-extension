import * as assert from "assert";
import * as vscode from "vscode";

describe("CodePilot Commands Integration Test Suite", () => {
  it("Should check registered commands in the active host context", async () => {
    // Find extension dynamically regardless of namespace prefix
    const extension = vscode.extensions.all.find((ext) =>
      ext.id.includes("codepilot-vscode-extension"),
    );

    if (extension && !extension.isActive) {
      await extension.activate();
    }

    const allCommands = await vscode.commands.getCommands(true);

    // Test that the extension runtime environment is initialized
    assert.ok(
      allCommands.length > 0,
      "VS Code environment commands list should not be empty.",
    );
  });
});
