import axios, { AxiosInstance } from "axios";
import * as vscode from "vscode";
import { TokenManager } from "./TokenManager";
import { MapRepoResponse, ScanPayload } from "../types/ApiTypes";

export class ApiClient {
  private client: AxiosInstance;
  private csrfToken: string | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.client = axios.create({
      baseURL: "http://localhost:5000/api",
      timeout: 12000,
      withCredentials: true, // Required for cookie-based CSRF support
    });
    this.client.interceptors.request.use(
      async (config) => {
        if (config.headers?.["x-skip-auth"] === "true") {
          delete config.headers["x-skip-auth"];
          return config;
        }

        const token = await TokenManager.getAccessToken(this.context);
        if (token) {
          if (!config.headers) {
            config.headers = {} as any;
          }
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Inside ApiClient.ts constructor
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          const success = await this.refreshAccessToken();
          if (success) {
            const newToken = await TokenManager.getAccessToken(this.context);
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          }
        }
        return Promise.reject(error);
      },
    );
  }

  public async getValidAccessToken(): Promise<string | undefined> {
    let token = await TokenManager.getAccessToken(this.context);
    if (token) return token;

    const githubToken = await this.getGithubSessionToken();
    if (!githubToken) return undefined;

    const loggedIn = await this.loginWithGithubToken(githubToken);
    if (!loggedIn) return undefined;

    token = await TokenManager.getAccessToken(this.context);
    return token;
  }

  private async getGithubSessionToken(): Promise<string | undefined> {
    try {
      const session = await vscode.authentication.getSession(
        "github",
        ["repo", "read:user", "user:email"], // ✅ اضفنا السكوب ده هنا لحل مشكلة الإيميل
        { createIfNone: true },
      );
      return session.accessToken;
    } catch (err) {
      console.warn("Unable to retrieve GitHub session token", err);
      return undefined;
    }
  }

  private async loginWithGithubToken(githubToken: string): Promise<boolean> {
    try {
      const response = await this.client.post(
        "/auth/extension/login",
        // ✅ تعديل: تغيير المفتاح إلى githubAccessToken ليطابق الباكيند تماماً
        { githubAccessToken: githubToken },
        { headers: { "x-skip-auth": "true" } },
      );

      // ✅ تعديل: قراءة الكائن من داخل wrapper الـ data الخاص بـ Express
      const responseBody = response.data;
      const data = responseBody?.data;

      if (data?.accessToken && data?.refreshToken) {
        await TokenManager.storeTokens(
          this.context,
          data.accessToken,
          data.refreshToken,
        );
        return true;
      }
      return false;
    } catch (err) {
      console.warn("CodePilot login failed", err);
      return false;
    }
  }

  public async refreshAccessToken(): Promise<boolean> {
    const refreshToken = await TokenManager.getRefreshToken(this.context);
    if (!refreshToken) {
      return false;
    }

    try {
      const response = await this.client.post(
        "/auth/extension/refresh",
        { refreshToken },
        { headers: { "x-skip-auth": "true" } },
      );

      // ✅ تعديل: قراءة الكائن من داخل wrapper الـ data للـ Refresh أيضاً
      const responseBody = response.data;
      const data = responseBody?.data;

      if (data?.accessToken) {
        await TokenManager.storeTokens(
          this.context,
          data.accessToken,
          data.refreshToken || refreshToken,
        );
        return true;
      }
      await TokenManager.deleteTokens(this.context);
      return false;
    } catch (err) {
      console.warn("CodePilot refresh failed", err);
      await TokenManager.deleteTokens(this.context);
      return false;
    }
  }

  public async sendTelemetry(
    eventName: string,
    payload: Record<string, any>,
  ): Promise<void> {
    try {
      await this.client.post(`/telemetry`, { event: eventName, payload });
    } catch (err) {
      // swallow telemetry errors
    }
  }

public async registerOrMapRepo(
  remoteUrl: string,
): Promise<MapRepoResponse | null> {
  const parsed = this.parseGitRemoteUrl(remoteUrl);
  if (!parsed) {
    console.warn("Could not parse owner/repo from remote URL:", remoteUrl);
    return null;
  }

  try {
    const response = await this.client.post<any>("/projects", {
      owner: parsed.owner,
      repoName: parsed.repoName,
    });
    const project = response.data?.data || response.data;
    if (!project?.id) return null;
    return {
      repositoryId: String(project.id),
      name: project.name,
    };
  } catch (err: any) {
    const message =
      err.response?.data?.message || "CodePilot Gateway communication breakdown.";
    vscode.window.showErrorMessage(`CodePilot: ${message}`);
    return null;
  }
}

private parseGitRemoteUrl(
  remoteUrl: string,
): { owner: string; repoName: string } | null {
  const httpsMatch = remoteUrl.match(
    /github\.com[/:]([^/]+)\/([^/.]+?)(\.git)?$/,
  );
  if (httpsMatch) {
    return { owner: httpsMatch[1], repoName: httpsMatch[2] };
  }
  return null;
}
  public async sendScanPayload(
    projectId: string,
    payload: ScanPayload,
  ): Promise<any> {
    try {
      const response = await this.client.post(
        `/repos/${projectId}/scan`,
        payload,
      );
      return response.data?.data || response.data;
    } catch (err) {
      throw err;
    }
  }

  public async sendLocalScanPayload(
    projectId: string | undefined,
    files: Array<{
      path: string;
      content: string;
      selectedLines?: Array<{ start: number; end: number }>;
    }>,
    preferredModel?: string,
  ): Promise<any> {
    try {
      const response = await this.client.post("/scans/local-analysis", {
        projectId,
        files,
        preferredModel,
      });
      return response.data?.data || response.data;
    } catch (err) {
      throw err;
    }
  }

  private async refreshCsrfToken() {
    try {
      const response = await this.client.get("/auth/csrf-token", {
        headers: { "x-skip-auth": "true" },
      });
      this.csrfToken = response.data.csrfToken;
    } catch (e) {
      console.warn("Failed to acquire CSRF token");
    }
  }
  public async getSuggestions(projectId?: string): Promise<any[] | null> {
  console.trace("getSuggestions called with projectId:", projectId);
  try {
      const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const response = await this.client.get(`/suggestions${qs}`);
      return response.data?.data || response.data;
    } catch (err: any) {
      // Log the full response to see if it's 403 (CSRF) or 401 (Auth)
      console.error("DEBUG API ERROR:", err.response?.data || err.message);
      return null;
    }
  }

  public async getSuggestion(id: string): Promise<any | null> {
    try {
      const response = await this.client.get(
        `/suggestions/${encodeURIComponent(id)}`,
      );
      return response.data?.data || response.data;
    } catch (err) {
      console.warn("Failed to fetch suggestion", err);
      return null;
    }
  }

  public async getSuggestionPatch(id: string): Promise<any | null> {
    try {
      const response = await this.client.get(
        `/suggestions/${encodeURIComponent(id)}`,
      );
      return response.data?.data || response.data;
    } catch (err) {
      console.warn("Failed to fetch suggestion patch", err);
      return null;
    }
  }

  public async applySuggestion(id: string): Promise<any | null> {
    try {
      const response = await this.client.post(
        `/suggestions/${encodeURIComponent(id)}/apply`,
      );
      return response.data?.data || response.data;
    } catch (err) {
      console.warn("Failed to apply suggestion", err);
      return null;
    }
  }

  public async revertSuggestion(id: string): Promise<any | null> {
    try {
      const response = await this.client.post(
        `/suggestions/${encodeURIComponent(id)}/revert`,
      );
      return response.data?.data || response.data;
    } catch (err) {
      console.warn("Failed to revert suggestion", err);
      return null;
    }
  }
  public async dismissSuggestion(id: string): Promise<any | null> {
  try {
    const response = await this.client.post(
      `/suggestions/${encodeURIComponent(id)}/dismiss`,
    );
    return response.data?.data || response.data;
  } catch (err) {
    console.warn("Failed to dismiss suggestion", err);
    return null;
  }
}
  }

