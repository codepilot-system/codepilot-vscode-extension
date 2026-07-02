import * as assert from "assert";
import * as sinon from "sinon";
import { TelemetryService } from "../../services/TelemetryService";

describe("TelemetryService Unit Test Suite", () => {
  afterEach(() => {
    sinon.restore();
  });

  // ======= PASS PATHS =======
  it("Should execute safely without throwing when no ApiClient is injected", () => {
    const telemetry = new TelemetryService();
    assert.doesNotThrow(() => {
      telemetry.sendEvent("user_login_click", { status: "success" });
    });
  });

  it("Should successfully handle complex, deeply nested metadata payloads", () => {
    const telemetry = new TelemetryService();
    assert.doesNotThrow(() => {
      telemetry.sendEvent("nested_metric", {
        user: { id: 101, role: "admin" },
        performance: { durationMs: 250, traceId: "xyz-789" },
      });
    });
  });

  it("Should forward operational tracking payloads straight to the ApiClient layer instance", () => {
    const mockApiClient = {
      sendTelemetry: sinon.stub().resolves(),
    };

    const telemetry = new TelemetryService(mockApiClient as any);
    telemetry.sendEvent("patch_applied", { operationsCount: 4 });

    assert.ok(
      mockApiClient.sendTelemetry.calledWith("patch_applied", {
        operationsCount: 4,
      }),
      "The service failed to propagate payload arguments to the backend API driver instance.",
    );
  });

  // ======= FAIL / BOUNDARY PATHS =======
  it("Should safely catch and swallow errors if ApiClient.sendTelemetry crashes or rejects", () => {
    const brokenApiClient = {
      sendTelemetry: sinon.stub().throws(new Error("Network Down Outage")),
    };

    const telemetry = new TelemetryService(brokenApiClient as any);

    assert.doesNotThrow(() => {
      telemetry.sendEvent("failing_network_event", { data: 1 });
    }, "Telemetry service must isolate and swallow external API exceptions internally.");
  });

  it("Should execute without errors even if event name is an empty string", () => {
    const telemetry = new TelemetryService();
    assert.doesNotThrow(() => {
      telemetry.sendEvent("", {});
    });
  });
});
