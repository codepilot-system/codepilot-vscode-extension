import * as assert from "assert";
import { WebSocketClient } from "../../services/WebSocketClient";

describe("WebSocketClient Test Suite", () => {
  it("Should instantiate successfully", () => {
    const client = new WebSocketClient();
    assert.ok(client);
  });

  it("Should allow disconnect before connect without throwing", () => {
    const client = new WebSocketClient();

    assert.doesNotThrow(() => {
      client.disconnect();
    });
  });

  it("Should allow calling connect without throwing synchronously", () => {
    const client = new WebSocketClient();

    assert.doesNotThrow(() => {
      client.connect("token", "repo-id", "csrf", () => {});
    });
  });

  it("Should allow null csrf token", () => {
    const client = new WebSocketClient();

    assert.doesNotThrow(() => {
      client.connect("token", "repo-id", null, () => {});
    });
  });
});
