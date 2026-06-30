import axios, { AxiosInstance } from "axios";
import * as vscode from "vscode";
import { TokenManager } from "./TokenManager";
import { MapRepoResponse, ScanPayload } from "../types/ApiTypes";

export class ApiClient {
  private client: AxiosInstance;

  constructor(private context: vscode.ExtensionContext) {
    this.client = axios.create({
      baseURL: "http://localhost:5000/api",
      timeout: 12000,
    });

    this.client.interceptors.request.use(async (config) => {
      if (config.headers && config.headers["x-skip-auth"]) {
        delete config.headers["x-skip-auth"];
        return config;
      }

      const token = await this.getValidAccessToken();
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config as any;
        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest.__retry
        ) {
          originalRequest.__retry = true;
          const refreshed = await this.refreshAccessToken();
          if (refreshed) {
            return this.client(originalRequest);
          }
        }
        return Promise.reject(error);
      },
    );
  }

  private async getValidAccessToken(): Promise<string | undefined> {
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

  private async loginWithGithubToken(
    githubToken: string,
  ): Promise<boolean> {
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
    try {
      const response = await this.client.post<any>("/repos/map", {
        url: remoteUrl,
      });
      // ✅ تعديل: قراءة الـ mapping بذكاء حسب كود الـ controller
      return response.data?.data || response.data;
    } catch (err) {
      vscode.window.showErrorMessage(
        "CodePilot Gateway communication breakdown.",
      );
      return null;
    }
  }

  public async sendScanPayload(
    repoId: string,
    payload: ScanPayload,
  ): Promise<any> {
    try {
      const response = await this.client.post(`/repos/${repoId}/scan`, payload);
      return response.data?.data || response.data;
    } catch (err) {
      throw err;
    }
  }

  public async getSuggestions(repoId?: string): Promise<any[] | null> {
    try {
      // ⬇️ التعديل هنا: غيرنا اسم المفتاح في الـ URL ليصبح projectId ⬇️
      const qs = repoId ? `?projectId=${encodeURIComponent(repoId)}` : "";
      const response = await this.client.get(`/suggestions${qs}`);
      
      console.log("[ApiClient] Suggestions response received:", response.data);

      const resData = response.data?.data || response.data;
      return resData?.suggestions || resData || [];
    } catch (err) {
      console.warn("Failed to fetch suggestions", err);
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
    const response = await this.client.get(`/suggestions/${encodeURIComponent(id)}`);
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
}