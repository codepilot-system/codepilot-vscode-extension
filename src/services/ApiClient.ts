import axios, { AxiosInstance } from "axios";
import * as vscode from "vscode";
import { TokenManager } from "./TokenManager";
import { MapRepoResponse, ScanPayload } from "../types/ApiTypes";

export class ApiClient {
  private client: AxiosInstance;

  constructor(private context: vscode.ExtensionContext) {
    this.client = axios.create({
      baseURL: "https://api.codepilot.live/v1",
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
}
