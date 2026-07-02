import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import WebSocket from "ws";
import { TokenManager } from "../../services/TokenManager";
import { WebSocketClient } from "../../services/WebSocketClient";

describe("TokenManager Test Suite", () => {
  let mockExtensionContext: vscode.ExtensionContext;
  let mockSecretStorage: Record<string, string>;

  beforeEach(() => {
    mockSecretStorage = {};

    // 1. Create structural mock object to simulate ExtensionContext secrets container
    mockExtensionContext = {
      secrets: {
        store: sinon.spy(async (key: string, value: string) => {
          mockSecretStorage[key] = value;
        }),
        get: sinon.spy(async (key: string) => mockSecretStorage[key]),
        delete: sinon.spy(async (key: string) => {
          delete mockSecretStorage[key];
        }),
        onDidChange: undefined as any,
      },
    } as unknown as vscode.ExtensionContext;

    // 2. 🛡️ Absolute Native WebSocket Hook Stub
    // Intercepts event subscription methods to capture fire-and-forget background threads
    sinon.stub(WebSocket.prototype, "on");
    sinon.stub(WebSocket.prototype, "addEventListener");
    sinon.stub(WebSocket.prototype, "send");

    // 3. 🛡️ Custom Extension WebSocket Client Subversions
    if (
      WebSocketClient.prototype &&
      typeof WebSocketClient.prototype.connect === "function"
    ) {
      sinon.stub(WebSocketClient.prototype, "connect").resolves();
    }
    if (
      WebSocketClient &&
      typeof (WebSocketClient as any).getInstance === "function"
    ) {
      // If using a Singleton structure, stub the instance methods
      const mockInstance = {
        connect: sinon.stub().resolves(),
        send: sinon.stub(),
      };
      sinon.stub(WebSocketClient, "getInstance" as any).returns(mockInstance);
    }
    if (typeof (TokenManager as any).announceConnection === "function") {
      sinon.stub(TokenManager, "announceConnection" as any).resolves();
    }
  });

  afterEach(() => {
    // Clean up stubs completely so they do not leak or run multiple times
    sinon.restore();
  });

  it("Should store and retrieve access and refresh tokens properly", async () => {
    await TokenManager.storeTokens(
      mockExtensionContext,
      "access-123",
      "refresh-456",
    );

    const accessToken = await TokenManager.getAccessToken(mockExtensionContext);
    const refreshToken =
      await TokenManager.getRefreshToken(mockExtensionContext);

    assert.strictEqual(accessToken, "access-123");
    assert.strictEqual(refreshToken, "refresh-456");
  });

  it("Should clean up credentials cleanly upon deletion request", async () => {
    await TokenManager.storeTokens(
      mockExtensionContext,
      "access-123",
      "refresh-456",
    );
    await TokenManager.deleteTokens(mockExtensionContext);

    const accessToken = await TokenManager.getAccessToken(mockExtensionContext);
    assert.strictEqual(accessToken, undefined);
  });
});
