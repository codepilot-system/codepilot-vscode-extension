import * as vscode from "vscode";

export class TokenManager {
  private static readonly AUTH_TOKEN_KEY = "codepilot_jwt_token";

  public static async storeToken(
    context: vscode.ExtensionContext,
    token: string,
  ): Promise<void> {
    await context.secrets.store(TokenManager.AUTH_TOKEN_KEY, token);
  }

  public static async getToken(
    context: vscode.ExtensionContext,
  ): Promise<string | undefined> {
    return await context.secrets.get(TokenManager.AUTH_TOKEN_KEY);
  }

  public static async deleteToken(
    context: vscode.ExtensionContext,
  ): Promise<void> {
    await context.secrets.delete(TokenManager.AUTH_TOKEN_KEY);
  }
}
