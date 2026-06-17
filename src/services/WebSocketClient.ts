import { WebSocket } from "ws";
import * as vscode from "vscode";
import { WebSocketMessage } from "../types/ApiTypes";

export class WebSocketClient {
  private socket?: WebSocket;
  private isIntentionallyClosed = false;
  private retryCount = 0;
  private readonly MAX_RETRIES = 5;
  private readonly BASE_DELAY = 2000; // Start at 2 seconds

  constructor(
    private readonly baseUrl: string = "wss://api.codepilot.live/ws",
  ) {}

  public connect(
    token: string,
    repoId: string,
    messageCallback: (payload: WebSocketMessage) => void,
  ): void {
    this.isIntentionallyClosed = false;
    this.socket = new WebSocket(
      `${this.baseUrl}?token=${token}&repoId=${repoId}`,
    );

    this.socket.on("open", () => {
      console.log("CodePilot Link established.");
      this.retryCount = 0; // Reset backoff counter on success
    });

    this.socket.on("message", (buffer) => {
      try {
        const parsedMessage: WebSocketMessage = JSON.parse(buffer.toString());
        messageCallback(parsedMessage);
      } catch (err) {
        console.error("Dropped broken stream frames.");
      }
    });

    this.socket.on("close", () => {
      if (!this.isIntentionallyClosed) {
        this.attemptReconnection(token, repoId, messageCallback);
      }
    });

    this.socket.on("error", (err) =>
      console.error("CodePilot connection dropped:", err),
    );
  }

  private attemptReconnection(
    token: string,
    repoId: string,
    cb: (p: WebSocketMessage) => void,
  ) {
    if (this.retryCount >= this.MAX_RETRIES) {
      vscode.window.showErrorMessage(
        "CodePilot Sync Error: Live connection lost. Please reload window.",
      );
      return;
    }

    const backoffDelay = Math.pow(2, this.retryCount) * this.BASE_DELAY;
    this.retryCount++;
    console.warn(
      `Reconnecting in ${backoffDelay}ms (Attempt ${this.retryCount}/${this.MAX_RETRIES})`,
    );

    setTimeout(() => this.connect(token, repoId, cb), backoffDelay);
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true;
    this.socket?.close();
  }
}
