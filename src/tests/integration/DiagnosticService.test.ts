import * as assert from "assert";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { DiagnosticService } from "../../diagnostics/DiagnosticService";
import { BackendIssuePayload } from "../../types/ApiTypes";

describe("DiagnosticService Integration Test Suite", () => {
  let diagnosticService: DiagnosticService;
  let mockDocument: vscode.TextDocument;

  beforeEach(() => {
    diagnosticService = new DiagnosticService();

    mockDocument = {
      uri: vscode.Uri.parse("file:///workspace/test.ts"),
      lineCount: 10,
      lineAt: sinon
        .stub()
        .returns({ text: "export function test() {}" } as any),
    } as unknown as vscode.TextDocument;
  });

  afterEach(() => {
    diagnosticService.clearAllDiagnostics();
    sinon.restore();
  });

  it("Should cleanly map backend issues to VS Code native diagnostics tracking maps", () => {
    const mockIssues: BackendIssuePayload[] = [
      {
        id: "issue-101",
        description: "Dead code pathway detected",
        severity: "warning",
        startLine: 2,
        endLine: 2,
        type: "static-analysis",
        filePath: "src/test.ts",
      },
    ];

    // Apply the tracking arrays
    diagnosticService.applyIssuesToDocument(mockDocument, mockIssues);

    // Look up the mapping inside the internal service payload tracker using its unique key structure
    const lookupKey = "file:///workspace/test.ts_issue-101_1";
    const savedMapping = diagnosticService.getPayloadByKey(lookupKey);

    assert.ok(
      savedMapping,
      "The service should register the issue context inside the registry map",
    );
    assert.strictEqual(savedMapping.issueId, "issue-101");
    assert.strictEqual(savedMapping.diagnostic.source, "CodePilot Engine");
  });
});
