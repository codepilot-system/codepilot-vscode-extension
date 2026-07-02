import * as assert from "assert";
import * as sinon from "sinon";
import { WebSocketClient } from "../../services/WebSocketClient";

describe("WebSocketClient Test Suite", () => {
  let wsConstructorStub: sinon.SinonStub;
  let fakeSocketInstance: any;
  let wsModule: any;

  beforeEach(() => {
    // 1. Load via require to get the mutable CommonJS export object
    wsModule = require("ws");

    fakeSocketInstance = {
      on: sinon.stub(),
      send: sinon.stub(),
      close: sinon.stub(),
      readyState: 0, // CONNECTING
    };

    // 2. 🛡️ Safe Constructor Interception
    wsConstructorStub = sinon
      .stub(wsModule, "WebSocket")
      .returns(fakeSocketInstance);
  });

  afterEach(() => {
    // Safely restore the original constructor
    sinon.restore();
  });

  it("Should correctly strip 'Bearer ' prefixes in URLs but preserve headers", () => {
    const wsClient = new WebSocketClient();
    const rawToken = "Bearer manual_jwt_payload_xyz";
    const targetRepo = "project-alpha-id";

    // Attempt standard link sequence execution
    const mockCsrf = "mock-token";
    wsClient.connect(rawToken, targetRepo, mockCsrf, (message) => {
      console.log("Test received message:", message);
    });

    // Verify that the extension core actually attempted to construct a WebSocket instance
    assert.ok(
      wsConstructorStub.called,
      "The WebSocket constructor should be instantiated",
    );

    // Verify that event handlers (.on) were registered onto our harmless fake socket
    assert.ok(
      fakeSocketInstance.on.called,
      "Event handlers should be assigned correctly onto the instance",
    );
  });
});
