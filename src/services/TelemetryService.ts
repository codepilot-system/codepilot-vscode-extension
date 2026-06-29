import * as vscode from "vscode";
import { ApiClient } from "./ApiClient";

export class TelemetryService {
  private apiClient: ApiClient | null = null;

  constructor(apiClient?: ApiClient) {
    this.apiClient = apiClient ?? null;
  }

  sendEvent(eventName: string, payload: Record<string, any> = {}) {
    // Lightweight local logging for development
    console.log(`[Telemetry] ${eventName}`, payload);

    try {
      // Fire-and-forget to remote backend if available
      if (this.apiClient && typeof this.apiClient.sendTelemetry === "function") {
        this.apiClient.sendTelemetry(eventName, payload).catch((e: any) => console.warn("Telemetry post failed", e));
      }
    } catch (e) {
      // swallow telemetry errors
    }
  }
}

export default TelemetryService;
