import { DiagnosticService } from "../diagnostics/DiagnosticService";
import { ApiClient } from "./ApiClient";

export const ServiceRegistry = {
  diagnosticService: null as unknown as DiagnosticService,
  apiClient: null as unknown as ApiClient,
};
