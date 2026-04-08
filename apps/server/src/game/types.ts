import type { Point, PlayerState, ResultEntry, RoomState } from "@snake/shared";

export interface RuntimePlayerState extends PlayerState {
  socketId?: string;
  ready: boolean;
  lastSequence: number;
  growthPending: number;
  moveCarryMs: number;
  maxLength: number;
  joinedAt: number;
  disconnectedAt?: number;
  disconnected?: boolean;
  revivedAt?: number;
}

export interface RuntimeRoomState extends RoomState {
  createdAt: number;
  updatedAt: number;
  countdownEndsAt: number;
  matchEndsAt: number;
  lastTickAt: number;
  resultEntries: ResultEntry[];
  announcedResult: boolean;
  startedAt: number;
  seed: number;
}

export interface GameSnapshot {
  room: RoomState;
  results?: ResultEntry[];
}

export interface MoveOutcome {
  nextHead: Point;
  ateFood: boolean;
  consumedFoodIndex: number;
}
