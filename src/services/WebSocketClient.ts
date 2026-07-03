import { io, Socket } from "socket.io-client";

export class WebSocketClient {
  private socket: Socket | null = null;

  public connect(
    token: string,
    repoId: string,
    csrfToken: string | null, // Added csrfToken parameter
    onMessage: (message: any) => void,
  ) {
    this.socket = io("http://localhost:5000", {
      auth: {
        token: `Bearer ${token}`,
        csrfToken: csrfToken,
      },
      query: { repoId },
      transports: ["websocket"],
    });

    this.socket.on("connect", () => {
      console.log("Successfully connected to CodePilot Backend!");
    });

    this.socket.on("issue_detected", (data) =>
      onMessage({ event: "issue_detected", data }),
    );
    this.socket.on("scan_complete", (data) =>
      onMessage({ event: "scan_complete", data }),
    );

    this.socket.on("connect_error", (err) => {
      console.error("Connection Error:", err.message);
    });
  }

  public disconnect() {
    this.socket?.disconnect();
  }
}
