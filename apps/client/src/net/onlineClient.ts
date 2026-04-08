import type { Difficulty, Direction, GameMode, PlayType, RoomState } from "@snake/shared";
import { TypedEmitter } from "../lib/emitter";

export interface OnlineConnectionEvents {
  connected: { roomId: string };
  disconnected: { reason: string };
  snapshot: RoomState;
  room: RoomState;
  error: { message: string };
}

export interface CreateRoomRequest {
  name: string;
  skinId: string;
  mode: GameMode;
  playType: PlayType;
  difficulty: Difficulty;
  maxPlayers: number;
  timeLimitSec: number;
}

export interface JoinRoomRequest {
  roomId: string;
  name: string;
  skinId: string;
  playerId?: string;
}

export class OnlineClient extends TypedEmitter<OnlineConnectionEvents> {
  private socket?: import("socket.io-client").Socket;
  private roomId?: string;
  private playerId?: string;

  async connect(serverUrl: string): Promise<void> {
    try {
      const mod = await import("socket.io-client");
      const socket = mod.io(serverUrl, {
        autoConnect: false,
        transports: ["websocket"]
      });
      this.socket = socket;
      socket.on("connect", () => {
        this.emit("connected", { roomId: this.roomId ?? "" });
      });
      socket.on("disconnect", (reason: string) => {
        this.emit("disconnected", { reason });
      });
      socket.on("state:snapshot", (payload: { room: RoomState }) => {
        this.emit("snapshot", payload.room);
      });
      socket.on("room:state", (payload: { room: RoomState }) => {
        this.emit("room", payload.room);
      });
      socket.on("room:created", (payload: { roomId: string; playerId: string; room: RoomState }) => {
        this.roomId = payload.roomId;
        this.playerId = payload.playerId;
        this.emit("room", payload.room);
      });
      socket.on("room:joined", (payload: { roomId: string; playerId: string; room: RoomState }) => {
        this.roomId = payload.roomId;
        this.playerId = payload.playerId;
        this.emit("room", payload.room);
      });
      socket.on("match:result", (payload: { room: RoomState }) => {
        this.emit("snapshot", payload.room);
      });
      socket.on("connect_error", (error: Error) => {
        this.emit("error", { message: error.message });
      });
      await new Promise<void>((resolve, reject) => {
        socket.connect();
        socket.once("connect", () => resolve());
        socket.once("connect_error", reject);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to connect";
      this.emit("error", { message });
    }
  }

  async createRoom(request: CreateRoomRequest): Promise<void> {
    if (!this.socket) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.socket!.emit("room:create", request, (payload: { roomId?: string; playerId?: string; room?: RoomState; code?: string; message?: string }) => {
        if (payload.code || !payload.room || !payload.roomId || !payload.playerId) {
          this.emit("error", { message: payload.message ?? "Unable to create room" });
        } else {
          this.roomId = payload.roomId;
          this.playerId = payload.playerId;
          this.emit("room", payload.room);
        }
        resolve();
      });
    });
  }

  async joinRoom(request: JoinRoomRequest): Promise<void> {
    if (!this.socket) {
      return;
    }
    await new Promise<void>((resolve) => {
      this.socket!.emit("room:join", request, (payload: { roomId?: string; playerId?: string; room?: RoomState; code?: string; message?: string }) => {
        if (payload.code || !payload.room || !payload.roomId || !payload.playerId) {
          this.emit("error", { message: payload.message ?? "Unable to join room" });
        } else {
          this.roomId = payload.roomId;
          this.playerId = payload.playerId;
          this.emit("room", payload.room);
        }
        resolve();
      });
    });
  }

  sendDirection(direction: Direction, sequence: number): void {
    this.socket?.emit("input:direction", {
      roomId: this.roomId,
      playerId: this.playerId,
      direction,
      sequence,
      clientTime: Date.now()
    });
  }

  async setReady(ready: boolean): Promise<void> {
    this.socket?.emit("room:ready", { roomId: this.roomId, ready });
  }

  async startMatch(): Promise<void> {
    this.socket?.emit("match:start", { roomId: this.roomId });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = undefined;
  }
}
