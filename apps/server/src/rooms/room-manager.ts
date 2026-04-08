import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, CreateRoomPayload, DirectionPayload, JoinRoomPayload, LeavePayload, MatchResultPayload, ReadyPayload, RoomCreatedPayload, RoomJoinedPayload, RoomStatePayload, ServerErrorPayload, ServerToClientEvents, SocketData, StartMatchPayload } from "../protocol.js";
import { DEFAULT_MAX_PLAYERS, DEFAULT_TIME_LIMIT_SEC, SERVER_TICK_MS, isSoloPlayType, resolveMatchConfig } from "../game/constants.js";
import { GameEngine } from "../game/engine.js";
import type { RuntimeRoomState } from "../game/types.js";
import type { RoomState } from "@snake/shared";

interface RoomActionContext {
  socket: Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;
  now: number;
}

export class RoomManager {
  private readonly io: Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;
  private readonly rooms = new Map<string, GameEngine>();
  private readonly tickHandle: NodeJS.Timeout;

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>) {
    this.io = io;
    this.tickHandle = setInterval(() => {
      this.tick(Date.now());
    }, SERVER_TICK_MS);
  }

  stop(): void {
    clearInterval(this.tickHandle);
  }

  createRoom(ctx: RoomActionContext, payload: CreateRoomPayload): RoomCreatedPayload | ServerErrorPayload {
    if (ctx.socket.data.roomId) {
      return this.error("ALREADY_IN_ROOM", "Socket is already attached to a room.");
    }

    const now = ctx.now;
    const roomId = this.createRoomId();
    const playerId = randomUUID();
    const matchConfig = resolveMatchConfig({
      mode: payload.mode ?? "competitive",
      playType: payload.playType ?? "solo",
      difficulty: payload.difficulty ?? "normal",
      maxPlayers: payload.maxPlayers ?? DEFAULT_MAX_PLAYERS,
      isOnline: !isSoloPlayType(payload.playType ?? "solo"),
      mapId: "default",
      timeLimitSec: payload.timeLimitSec ?? DEFAULT_TIME_LIMIT_SEC
    });
    const engine = new GameEngine(roomId, matchConfig, playerId, payload.name, payload.skinId ?? "default", now);
    this.rooms.set(roomId, engine);
    this.attachSocket(ctx.socket, roomId, playerId);
    ctx.socket.join(roomId);

    if (matchConfig.playType === "solo") {
      engine.startCountdown(now);
    }

    const room = engine.snapshot();
    this.broadcastState(roomId, room, room.status !== "lobby");
    return { roomId, playerId, room };
  }

  joinRoom(ctx: RoomActionContext, payload: JoinRoomPayload): RoomJoinedPayload | ServerErrorPayload {
    const engine = this.rooms.get(payload.roomId);
    if (!engine) {
      return this.error("ROOM_NOT_FOUND", "Room does not exist.");
    }
    if (ctx.socket.data.roomId && ctx.socket.data.roomId !== payload.roomId) {
      return this.error("ALREADY_IN_ROOM", "Socket is already attached to another room.");
    }

    const playerId = payload.playerId ?? randomUUID();
    const now = ctx.now;
    const existing = engine.state.players.find((player) => player.playerId === playerId);
    if (existing) {
      const reconnect = engine.reconnectPlayer(playerId, ctx.socket.id, now);
      if (!reconnect) {
        return this.error("PLAYER_NOT_FOUND", "Player cannot be reconnected.");
      }
      this.attachSocket(ctx.socket, payload.roomId, playerId);
      ctx.socket.join(payload.roomId);
      const room = engine.snapshot();
      this.broadcastState(payload.roomId, room, room.status !== "lobby");
      return { roomId: payload.roomId, playerId, room };
    }

    if (engine.status !== "lobby") {
      return this.error("MATCH_ALREADY_STARTED", "The match has already started.");
    }
    if (!engine.canJoin(engine.matchConfig.maxPlayers)) {
      return this.error("ROOM_FULL", "The room is full.");
    }

    engine.addPlayer(playerId, payload.name ?? "Player", payload.skinId ?? "default", now, ctx.socket.id);
    this.attachSocket(ctx.socket, payload.roomId, playerId);
    ctx.socket.join(payload.roomId);

    const room = engine.snapshot();
    this.broadcastState(payload.roomId, room, false);
    return { roomId: payload.roomId, playerId, room };
  }

  ready(ctx: RoomActionContext, payload: ReadyPayload): void {
    const engine = this.rooms.get(payload.roomId);
    const playerId = ctx.socket.data.playerId;
    if (!engine || !playerId) {
      return;
    }
    engine.markReady(playerId, payload.ready, ctx.now);
    const room = engine.snapshot();
    this.broadcastState(payload.roomId, room, false);

    if (payload.ready && engine.status === "lobby" && engine.canStart()) {
      engine.startCountdown(ctx.now);
      this.broadcastState(payload.roomId, engine.snapshot(), true);
    }
  }

  leave(ctx: RoomActionContext, payload: LeavePayload): void {
    const roomId = payload.roomId || ctx.socket.data.roomId;
    const playerId = ctx.socket.data.playerId;
    if (!roomId || !playerId) {
      return;
    }
    this.detachSocket(ctx.socket);
    this.removeOrDisconnect(roomId, playerId, ctx.now, true);
  }

  startMatch(ctx: RoomActionContext, payload: StartMatchPayload): void {
    const engine = this.rooms.get(payload.roomId);
    const playerId = ctx.socket.data.playerId;
    if (!engine || !playerId || engine.status !== "lobby") {
      return;
    }
    if (!engine.canStart()) {
      return;
    }
    engine.startCountdown(ctx.now);
    this.broadcastState(payload.roomId, engine.snapshot(), true);
  }

  direction(ctx: RoomActionContext, payload: DirectionPayload): void {
    const engine = this.rooms.get(payload.roomId);
    if (!engine) {
      return;
    }
    if (ctx.socket.data.playerId !== payload.playerId) {
      return;
    }
    engine.applyDirection(payload, ctx.now);
  }

  disconnect(socket: Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>): void {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId) {
      return;
    }
    this.detachSocket(socket);
    this.removeOrDisconnect(roomId, playerId, Date.now(), false);
  }

  private tick(now: number): void {
    for (const [roomId, engine] of this.rooms.entries()) {
      const previousStatus = engine.status;
      const state = engine.step(now, SERVER_TICK_MS);

      if (state.status === "countdown" || state.status === "in_game") {
        this.broadcastState(roomId, engine.snapshot(), true);
      } else if (previousStatus !== state.status) {
        this.broadcastState(roomId, engine.snapshot(), false);
      }

      if (state.status === "result" && !state.announcedResult) {
        state.announcedResult = true;
        const snapshot = engine.snapshot();
        const payload: MatchResultPayload = {
          roomId,
          room: snapshot,
          results: state.resultEntries
        };
        this.io.to(roomId).emit("match:result", payload);
        this.broadcastState(roomId, snapshot, false);
      }

      if (state.status === "lobby" && engine.playerCount === 0) {
        this.rooms.delete(roomId);
      }
    }
  }

  private removeOrDisconnect(roomId: string, playerId: string, now: number, immediate: boolean): void {
    const engine = this.rooms.get(roomId);
    if (!engine) {
      return;
    }

    if (immediate) {
      engine.removePlayer(playerId, now);
    } else {
      engine.markDisconnected(playerId, now);
    }

    const room = engine.snapshot();
    this.broadcastState(roomId, room, room.status !== "lobby");

    if (engine.status === "lobby" && engine.playerCount === 0) {
      this.rooms.delete(roomId);
    }
  }

  private attachSocket(socket: Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>, roomId: string, playerId: string): void {
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;
  }

  private detachSocket(socket: Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>): void {
    socket.data.roomId = undefined;
    socket.data.playerId = undefined;
  }

  private broadcastState(roomId: string, room: RoomState, snapshot = false): void {
    const payload: RoomStatePayload = { room };
    if (snapshot) {
      this.io.to(roomId).emit("state:snapshot", payload);
    }
    this.io.to(roomId).emit("room:state", payload);
  }

  private error(code: string, message: string): ServerErrorPayload {
    return { code, message };
  }

  private createRoomId(): string {
    return randomUUID().slice(0, 8).toUpperCase();
  }
}
