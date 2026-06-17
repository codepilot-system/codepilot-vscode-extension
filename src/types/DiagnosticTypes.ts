import * as vscode from "vscode";
import { BackendIssuePayload } from "./ApiTypes";

export interface CodePilotDiagnosticMapping {
  diagnostic: vscode.Diagnostic;
  issueId: string;
  rawPayload: BackendIssuePayload;
}
