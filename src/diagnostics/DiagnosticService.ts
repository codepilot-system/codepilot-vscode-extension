import * as vscode from "vscode";
import { BackendIssuePayload } from "../types/ApiTypes";
import { CodePilotDiagnosticMapping } from "../types/DiagnosticTypes";

export class DiagnosticService {
  private collection: vscode.DiagnosticCollection;

  private payloadRegistry = new Map<string, CodePilotDiagnosticMapping>();

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(
      "codepilot-analysis-issues",
    );
  }

  /**
   * Highlights visual red/yellow markers inside active code editor areas safely.
   */
  public applyIssuesToDocument(
    document: vscode.TextDocument,
    issues: BackendIssuePayload[],
  ): void {
    const diagnosticsArray: vscode.Diagnostic[] = [];

    // Clear previous state tracking keys for this document before computing updates
    this.clearDocumentCache(document.uri.toString());

    issues.forEach((issue) => {
      // Note: VS Code tracks lines starting from 0, backend is 1-indexed
      const adjustedStart = Math.max(0, issue.startLine - 1);
      const adjustedEnd = Math.max(0, issue.endLine - 1);

      // SAFE LINE BOUNDS: Dynamically compute the exact string character length of the last line
      const safeEndLineIndex = Math.min(adjustedEnd, document.lineCount - 1);
      const targetLineInfo = document.lineAt(safeEndLineIndex);

      const activeRange = new vscode.Range(
        new vscode.Position(adjustedStart, 0),
        new vscode.Position(adjustedEnd, targetLineInfo.text.length),
      );

      const diagnostic = new vscode.Diagnostic(
        activeRange,
        `[CodePilot] ${issue.description}`,
        issue.severity === "error"
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning,
      );
      diagnostic.source = "CodePilot Engine";

      // Create a compound unique lookup registry key
      const uniqueKey = `${document.uri.toString()}_${issue.id}_${adjustedStart}`;

      // Map the native diagnostic instance to its raw backend data safely
      this.payloadRegistry.set(uniqueKey, {
        diagnostic,
        issueId: issue.id,
        rawPayload: issue,
      });

      diagnosticsArray.push(diagnostic);
    });

    this.collection.set(document.uri, diagnosticsArray);
  }

  /**
   * Bridge method for Member 3 to look up full issue details when a user interacts with the UI
   */
  public getPayloadByKey(key: string): CodePilotDiagnosticMapping | undefined {
    return this.payloadRegistry.get(key);
  }

  private clearDocumentCache(uriStr: string): void {
    for (const key of this.payloadRegistry.keys()) {
      if (key.startsWith(uriStr)) {
        this.payloadRegistry.delete(key);
      }
    }
  }

  public clearAllDiagnostics(): void {
    this.collection.clear();
    this.payloadRegistry.clear();
  }

  public getCollection(): vscode.DiagnosticCollection {
    return this.collection;
  }
}
