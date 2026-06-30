import { WebSocket } from "ws";
import * as vscode from "vscode";
import { WebSocketMessage } from "../types/ApiTypes";

export class WebSocketClient {
  private socket?: WebSocket;
  private isIntentionallyClosed = false;
  private retryCount = 0;
  private readonly MAX_RETRIES = 5;
  private readonly BASE_DELAY = 2000;

  constructor(private readonly baseUrl: string = "ws://localhost:5000") {}

public connect(
    token: string,
    repoId: string,
    messageCallback: (payload: WebSocketMessage) => void,
  ): void {
    this.isIntentionallyClosed = false;

    // 1️⃣ التوكن الصافي بدون Bearer للـ URL Query String
    const cleanToken = token.startsWith("Bearer ") ? token.split(" ")[1] : token;
    const connectionUrl = `${this.baseUrl}/ws?repoId=${encodeURIComponent(repoId)}&token=${encodeURIComponent(cleanToken)}`;
    
    console.log(`[WebSocket] Dispatching connection to: ${connectionUrl}`);

    this.socket = new WebSocket(connectionUrl, {
      headers: {
        // 2️⃣ الـ Header يجب ويشترط أن يحتوي على Bearer كاملة وإلا سيرفضها الباكيند!
        Authorization: `Bearer ${cleanToken}`
      }
    });

    this.socket.on("open", () => {
      console.log("CodePilot Link established.");
      this.retryCount = 0;
    });

    this.socket.on("message", (buffer) => {
      try {
        const parsedMessage: WebSocketMessage = JSON.parse(buffer.toString());
        messageCallback(parsedMessage);
      } catch (err) {
        console.error("Dropped broken stream frames.");
      }
    });

    this.socket.on("close", (code, reason) => {
      console.warn(`CodePilot Link Closed. Code: ${code}, Reason: ${reason.toString()}`);
      if (!this.isIntentionallyClosed) {
        this.attemptReconnection(token, repoId, messageCallback);
      }
    });

    this.socket.on("error", (err) => {
      console.error("CodePilot connection dropped:", err);
    });
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
