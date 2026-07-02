import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import axios from "axios";
import { ApiClient } from "../../services/ApiClient";
import { TokenManager } from "../../services/TokenManager";

describe("ApiClient Test Suite", () => {
  let mockContext: vscode.ExtensionContext;
  let apiClient: ApiClient;
  let getAccessTokenStub: sinon.SinonStub;
  let axiosPostStub: sinon.SinonStub;

  beforeEach(() => {
    // 1. Structural dummy context setup
    mockContext = {} as unknown as vscode.ExtensionContext;

    // 2. 🛡️ Network Safety Layer: Intercept background calls during interceptor parsing
    axiosPostStub = sinon
      .stub(axios, "post")
      .resolves({ data: { success: true } });

    getAccessTokenStub = sinon.stub(TokenManager, "getAccessToken");
    apiClient = new ApiClient(mockContext);
  });

  afterEach(() => {
    // Clean up stubs cleanly so hooks don't throw done() exceptions
    sinon.restore();
  });

  it("Should automatically attach Authorization header when a token is active", async () => {
    getAccessTokenStub.resolves("valid-session-jwt-token");

    // Grab the request interceptor function manually from axios
    const interceptor = (apiClient["client"].interceptors.request as any)
      .handlers[0].fulfilled;

    const initialConfig = { headers: {} };
    const modifiedConfig = await interceptor(initialConfig);

    assert.strictEqual(
      modifiedConfig.headers.Authorization,
      "Bearer valid-session-jwt-token",
    );
  });

  it("Should skip injection if x-skip-auth header flag is active", async () => {
    const interceptor = (apiClient["client"].interceptors.request as any)
      .handlers[0].fulfilled;

    const initialConfig = { headers: { "x-skip-auth": "true" } };
    const modifiedConfig = await interceptor(initialConfig);

    assert.strictEqual(modifiedConfig.headers.Authorization, undefined);
    assert.strictEqual(
      modifiedConfig.headers["x-skip-auth"],
      undefined,
      "Interceptor should prune safety flags",
    );
  });
});
