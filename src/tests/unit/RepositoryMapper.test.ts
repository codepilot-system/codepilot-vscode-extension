import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { RepositoryMapper } from "../../services/RepositoryMapper";

describe("RepositoryMapper Integration Test Suite", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("Should return undefined safely if no text document editor is actively open", () => {
    sinon.stub(vscode.window, "activeTextEditor").value(undefined);

    sinon.stub(vscode.extensions, "getExtension").returns({
      isActive: true,
      exports: {
        getAPI: () => ({ repositories: [] }),
      },
    } as any);

    const url = RepositoryMapper.getRemoteUrlForActiveFile();

    assert.strictEqual(url, undefined);
  });

  it("Should return undefined if Git extension is unavailable", () => {
    sinon.stub(vscode.extensions, "getExtension").returns(undefined);

    const url = RepositoryMapper.getRemoteUrlForActiveFile();

    assert.strictEqual(url, undefined);
  });

  it("Should return undefined if Git extension is inactive", () => {
    sinon.stub(vscode.extensions, "getExtension").returns({
      isActive: false,
    } as any);

    const url = RepositoryMapper.getRemoteUrlForActiveFile();

    assert.strictEqual(url, undefined);
  });

  it("Should successfully resolve target origin fetchUrl when matching repo is located", async () => {
    const mockDoc = await vscode.workspace.openTextDocument({
      content: "test context",
    });

    sinon.stub(vscode.window, "activeTextEditor").value({
      document: mockDoc,
    } as any);

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

    sinon.stub(vscode.extensions, "getExtension").returns({
      isActive: true,
      exports: {
        getAPI: () => mockGitApi,
      },
    } as any);

    const resolvedUrl = RepositoryMapper.getRemoteUrlForActiveFile();

    assert.strictEqual(
      resolvedUrl,
      "https://github.com/user/project-alpha.git",
    );
  });

  it("Should fall back to the first repository when no repository matches the active file", async () => {
    const mockDoc = await vscode.workspace.openTextDocument({
      content: "test context",
    });

    sinon.stub(vscode.window, "activeTextEditor").value({
      document: mockDoc,
    } as any);

    const mockGitApi = {
      repositories: [
        {
          rootUri: vscode.Uri.file("C:\\another-repo"),
          state: {
            remotes: [
              {
                name: "origin",
                fetchUrl: "https://github.com/user/fallback.git",
              },
            ],
          },
        },
      ],
    };

    sinon.stub(vscode.extensions, "getExtension").returns({
      isActive: true,
      exports: {
        getAPI: () => mockGitApi,
      },
    } as any);

    const resolvedUrl = RepositoryMapper.getRemoteUrlForActiveFile();

    assert.strictEqual(resolvedUrl, "https://github.com/user/fallback.git");
  });

  it("Should fall back to the first remote when origin does not exist", async () => {
    const mockDoc = await vscode.workspace.openTextDocument({
      content: "test context",
    });

    sinon.stub(vscode.window, "activeTextEditor").value({
      document: mockDoc,
    } as any);

    const mockGitApi = {
      repositories: [
        {
          rootUri: vscode.Uri.file(mockDoc.uri.fsPath),
          state: {
            remotes: [
              {
                name: "upstream",
                fetchUrl: "https://github.com/user/upstream.git",
              },
            ],
          },
        },
      ],
    };

    sinon.stub(vscode.extensions, "getExtension").returns({
      isActive: true,
      exports: {
        getAPI: () => mockGitApi,
      },
    } as any);

    const resolvedUrl = RepositoryMapper.getRemoteUrlForActiveFile();

    assert.strictEqual(resolvedUrl, "https://github.com/user/upstream.git");
  });

  it("Should return undefined when repository has no remotes", async () => {
    const mockDoc = await vscode.workspace.openTextDocument({
      content: "test context",
    });

    sinon.stub(vscode.window, "activeTextEditor").value({
      document: mockDoc,
    } as any);

    const mockGitApi = {
      repositories: [
        {
          rootUri: vscode.Uri.file(mockDoc.uri.fsPath),
          state: {
            remotes: [],
          },
        },
      ],
    };

    sinon.stub(vscode.extensions, "getExtension").returns({
      isActive: true,
      exports: {
        getAPI: () => mockGitApi,
      },
    } as any);

    const resolvedUrl = RepositoryMapper.getRemoteUrlForActiveFile();

    assert.strictEqual(resolvedUrl, undefined);
  });

  it("Should return undefined if fetchUrl is missing", async () => {
    const mockDoc = await vscode.workspace.openTextDocument({
      content: "test context",
    });

    sinon.stub(vscode.window, "activeTextEditor").value({
      document: mockDoc,
    } as any);

    const mockGitApi = {
      repositories: [
        {
          rootUri: vscode.Uri.file(mockDoc.uri.fsPath),
          state: {
            remotes: [
              {
                name: "origin",
                fetchUrl: undefined,
              },
            ],
          },
        },
      ],
    };

    sinon.stub(vscode.extensions, "getExtension").returns({
      isActive: true,
      exports: {
        getAPI: () => mockGitApi,
      },
    } as any);

    const resolvedUrl = RepositoryMapper.getRemoteUrlForActiveFile();

    assert.strictEqual(resolvedUrl, undefined);
  });

  it("Should return undefined if Git API throws an exception", async () => {
    const mockDoc = await vscode.workspace.openTextDocument({
      content: "test context",
    });

    sinon.stub(vscode.window, "activeTextEditor").value({
      document: mockDoc,
    } as any);

    sinon.stub(vscode.extensions, "getExtension").returns({
      isActive: true,
      exports: {
        getAPI: () => {
          throw new Error("Git API failure");
        },
      },
    } as any);

    const resolvedUrl = RepositoryMapper.getRemoteUrlForActiveFile();

    assert.strictEqual(resolvedUrl, undefined);
  });
});
