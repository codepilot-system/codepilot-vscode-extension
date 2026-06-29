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
      const token = await TokenManager.getToken(this.context);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
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
      const response = await this.client.post<MapRepoResponse>("/repos/map", {
        url: remoteUrl,
      });
      return response.data;
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
      return response.data;
    } catch (err) {
      throw err;
    }
  }

  // --- AI suggestions API helpers (client-side) ---
  public async getSuggestions(repoId?: string): Promise<any[] | null> {
    try {
      const qs = repoId ? `?repoId=${encodeURIComponent(repoId)}` : "";
      const response = await this.client.get(`/ai/suggestions${qs}`);
      return response.data?.suggestions || response.data || [];
    } catch (err) {
      console.warn("Failed to fetch suggestions", err);
      return null;
    }
  }

  public async getSuggestion(id: string): Promise<any | null> {
    try {
      const response = await this.client.get(
        `/ai/suggestions/${encodeURIComponent(id)}`,
      );
      return response.data;
    } catch (err) {
      console.warn("Failed to fetch suggestion", err);
      return null;
    }
  }

  public async getSuggestionPatch(id: string): Promise<any | null> {
    try {
      const response = await this.client.get(
        `/ai/suggestions/${encodeURIComponent(id)}/patch`,
      );
      return response.data;
    } catch (err) {
      console.warn("Failed to fetch suggestion patch", err);
      return null;
    }
  }

  public async applySuggestion(id: string): Promise<any | null> {
    try {
      const response = await this.client.post(
        `/ai/suggestions/${encodeURIComponent(id)}/apply`,
      );
      return response.data;
    } catch (err) {
      console.warn("Failed to apply suggestion", err);
      return null;
    }
  }

  public async revertSuggestion(id: string): Promise<any | null> {
    try {
      const response = await this.client.post(
        `/ai/suggestions/${encodeURIComponent(id)}/revert`,
      );
      return response.data;
    } catch (err) {
      console.warn("Failed to revert suggestion", err);
      return null;
    }
  }
}
