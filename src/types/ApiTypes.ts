export interface MapRepoRequest {
  url: string;
}

export interface MapRepoResponse {
  repositoryId: string;
  name: string;
}

export interface ScanPayload {
  fileUri: string;
  languageId: string;
  content: string;
  fingerprint: string;
}

export interface BackendIssuePayload {
  id: string;
  type: string; // e.g., 'Duplicate Code', 'SRP Violation', 'Long Function'
  description: string;
  severity: "error" | "warning";
  startLine: number; // 1-indexed from backend
  endLine: number; // 1-indexed from backend
  filePath: string;
  suggestedFix?: any; // Passed to Member 3 for patch execution
}

export interface WebSocketMessage {
  event: "scan_progress" | "scan_complete" | "issue_detected";
  repoId: string;
  data: any;
}
