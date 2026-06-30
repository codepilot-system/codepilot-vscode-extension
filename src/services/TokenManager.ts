import * as vscode from "vscode";

export class TokenManager {
  private static readonly AUTH_ACCESS_TOKEN_KEY = "codepilot_access_token";
  private static readonly AUTH_REFRESH_TOKEN_KEY = "codepilot_refresh_token";

  public static async storeTokens(
    context: vscode.ExtensionContext,
    accessToken: string,
    refreshToken: string,
  ): Promise<void> {
    await Promise.all([
      context.secrets.store(TokenManager.AUTH_ACCESS_TOKEN_KEY, accessToken),
      context.secrets.store(TokenManager.AUTH_REFRESH_TOKEN_KEY, refreshToken),
    ]);
  }

  public static async getAccessToken(
    context: vscode.ExtensionContext,
  ): Promise<string | undefined> {
    return await context.secrets.get(TokenManager.AUTH_ACCESS_TOKEN_KEY);
  }

  public static async getRefreshToken(
    context: vscode.ExtensionContext,
  ): Promise<string | undefined> {
    return await context.secrets.get(TokenManager.AUTH_REFRESH_TOKEN_KEY);
  }

  public static async deleteTokens(
    context: vscode.ExtensionContext,
  ): Promise<void> {
    await Promise.all([
      context.secrets.delete(TokenManager.AUTH_ACCESS_TOKEN_KEY),
      context.secrets.delete(TokenManager.AUTH_REFRESH_TOKEN_KEY),
    ]);
  }
}
