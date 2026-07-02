import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { RepositoryMapper } from "../../services/RepositoryMapper";

describe("RepositoryMapper Integration Test Suite", () => {
  let getExtensionStub: sinon.SinonStub;

  afterEach(() => {
    sinon.restore();
  });

  it("Should return null safely if no text document editor is actively open", () => {
    // Stub activeTextEditor as undefined
    sinon.stub(vscode.window, "activeTextEditor").value(undefined);

    const url = RepositoryMapper.getRemoteUrlForActiveFile();
    assert.strictEqual(url, null);
  });

  it("Should successfully resolve target origin fetchUrl when matching repo is located", async () => {
    // 1. Create a dummy open file document context to act as active target
    const mockDoc = await vscode.workspace.openTextDocument({
      content: "test context",
    });
    sinon.stub(vscode.window, "activeTextEditor").value({ document: mockDoc });

    // 2. Mock the internal Git Extension structural contract layout
    const mockGitApi = {
      repositories: [
        {
          rootUri: vscode.Uri.file(mockDoc.uri.fsPath),
          state: {
            remotes: [
              {
                name: "origin",
                fetchUrl: "https://github.com/user/project-alpha.git",
              },
            ],
          },
        },
      ],
    };

    getExtensionStub = sinon.stub(vscode.extensions, "getExtension");
    getExtensionStub.withArgs("vscode.git").returns({
      exports: { getAPI: () => mockGitApi },
    });

    const resolvedUrl = RepositoryMapper.getRemoteUrlForActiveFile();
    assert.strictEqual(
      resolvedUrl,
      "https://github.com/user/project-alpha.git",
    );
  });
});
