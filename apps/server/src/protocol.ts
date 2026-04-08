import type { Difficulty, Direction, GameMode, MatchConfig, PlayType, ResultEntry, RoomState } from "@snake/shared";

export interface CreateRoomPayload {
  name: string;
  skinId?: string;
  mode?: GameMode;
  playType?: PlayType;
  difficulty?: Difficulty;
  maxPlayers?: number;
  timeLimitSec?: number;
}

export interface JoinRoomPayload {
  roomId: string;
  name?: string;
  skinId?: string;
  playerId?: string;
}

export interface ReadyPayload {
  roomId: string;
  ready: boolean;
}

export interface LeavePayload {
  roomId: string;
}

export interface StartMatchPayload {
  roomId: string;
}

export interface DirectionPayload {
  roomId: string;
  playerId: string;
  sequence: number;
  direction: Direction;
  clientTime: number;
}

export interface RoomCreatedPayload {
  roomId: string;
  playerId: string;
  room: RoomState;
}

export interface RoomJoinedPayload {
  roomId: string;
  playerId: string;
  room: RoomState;
}

export interface RoomStatePayload {
  room: RoomState;
}

export interface MatchResultPayload {
  roomId: string;
  room: RoomState;
  results: ResultEntry[];
}

export interface ServerErrorPayload {
  message: string;
  code: string;
}

export interface ServerToClientEvents {
  "room:created": (payload: RoomCreatedPayload) => void;
  "room:joined": (payload: RoomJoinedPayload) => void;
  "room:state": (payload: RoomStatePayload) => void;
  "state:snapshot": (payload: RoomStatePayload) => void;
  "match:result": (payload: MatchResultPayload) => void;
  "server:error": (payload: ServerErrorPayload) => void;
}

export interface ClientToServerEvents {
  "room:create": (payload: CreateRoomPayload, ack?: (payload: RoomCreatedPayload | ServerErrorPayload) => void) => void;
  "room:join": (payload: JoinRoomPayload, ack?: (payload: RoomJoinedPayload | ServerErrorPayload) => void) => void;
  "room:ready": (payload: ReadyPayload) => void;
  "room:leave": (payload: LeavePayload) => void;
  "match:start": (payload: StartMatchPayload) => void;
  "input:direction": (payload: DirectionPayload) => void;
}

export interface InterServerEvents {}
export interface SocketData {
  playerId?: string;
  roomId?: string;
}

export interface RuntimeMatchConfig extends MatchConfig {
  maxPlayers: number;
}
