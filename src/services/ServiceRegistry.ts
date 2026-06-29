import { DiagnosticService } from "../diagnostics/DiagnosticService";
import { ApiClient } from "./ApiClient";
import { WorkspacePatchExecutor } from "./WorkspacePatchExecutor";
import { PatchValidator } from "./PatchValidator";
import { PatchTranslator } from "./PatchTranslator";
import { WorkspaceFileWriter } from "./WorkspaceFileWriter";
import { TelemetryService } from "./TelemetryService";

export const ServiceRegistry = {
  diagnosticService: null as unknown as DiagnosticService,
  apiClient: null as unknown as ApiClient,
  // New services
  patchValidator: null as unknown as PatchValidator,
  patchTranslator: null as unknown as PatchTranslator,
  workspaceFileWriter: null as unknown as WorkspaceFileWriter,
  workspacePatchExecutor: null as unknown as WorkspacePatchExecutor,
  telemetryService: null as unknown as TelemetryService,
};
