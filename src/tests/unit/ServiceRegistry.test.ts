import * as assert from "assert";
import { ServiceRegistry } from "../../services/ServiceRegistry";

describe("ServiceRegistry Unit Test Suite", () => {
  beforeEach(() => {
    // Reset registry fields before each test execution block to keep state isolated
    ServiceRegistry.telemetryService = null as any;
    ServiceRegistry.patchTranslator = null as any;
    ServiceRegistry.apiClient = null as any;
  });

  // ======= PASS PATHS =======
  it("Should accept assignment and cleanly expose registered singletons", () => {
    const dummyTelemetry = { sendEvent: () => {} } as any;
    const dummyTranslator = { translate: () => {} } as any;

    ServiceRegistry.telemetryService = dummyTelemetry;
    ServiceRegistry.patchTranslator = dummyTranslator;

    assert.strictEqual(ServiceRegistry.telemetryService, dummyTelemetry);
    assert.strictEqual(ServiceRegistry.patchTranslator, dummyTranslator);
  });

  it("Should allow updating or overwriting an existing registered service module reference", () => {
    const initialClient = { mockUrl: "http://api.v1" } as any;
    const upgradedClient = { mockUrl: "http://api.v2" } as any;

    ServiceRegistry.apiClient = initialClient;
    // Cast to 'any' to bypass strict ApiClient instance property checks
    assert.strictEqual(
      (ServiceRegistry.apiClient as any).mockUrl,
      "http://api.v1",
    );

    // Perform overwrite mutation check
    ServiceRegistry.apiClient = upgradedClient;
    assert.strictEqual(
      (ServiceRegistry.apiClient as any).mockUrl,
      "http://api.v2",
    );
  });

  // ======= BOUNDARY / RESET PATHS =======
  it("Should return null natively if a service property has not been initialized yet", () => {
    assert.strictEqual(ServiceRegistry.apiClient, null);
    assert.strictEqual(ServiceRegistry.telemetryService, null);
  });

  it("Should cleanly allow clearing out service values by resetting them back to null", () => {
    const dummyClient = { id: "test" } as any;
    ServiceRegistry.apiClient = dummyClient;

    ServiceRegistry.apiClient = null as any;
    assert.strictEqual(ServiceRegistry.apiClient, null);
  });
});
