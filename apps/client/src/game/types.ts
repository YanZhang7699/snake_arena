import type { Direction, ItemState, MatchConfig, PlayerState, Point, ResultEntry, RoomState } from "@snake/shared";
import type { BoardConfig } from "../config/gameConfig";

export interface ControlBindings {
  up: string;
  down: string;
  left: string;
  right: string;
}

export interface PlayerSetup {
  playerId: string;
  name: string;
  skinId: string;
  color: string;
  controls: ControlBindings;
  slot: number;
  isHuman: boolean;
}

export interface MatchSetup {
  board: BoardConfig;
  config: MatchConfig;
  seed: number;
  players: PlayerSetup[];
  roomId: string;
  roomName: string;
  serverUrl?: string;
}

export interface SimulationSnapshot {
  timeMs: number;
  tick: number;
  status: "countdown" | "playing" | "result";
  countdownRemainingMs: number;
  remainingMs: number;
  players: PlayerState[];
  food: Point[];
  items: ItemState[];
  resultEntries: ResultEntry[];
  winnerId?: string;
  note: string;
}

export interface RuntimeEvents {
  snapshot: SimulationSnapshot;
  result: SimulationSnapshot;
  status: { status: "countdown" | "playing" | "result"; countdownRemainingMs: number; remainingMs: number };
}

export interface RuntimeHandle {
  snapshot: SimulationSnapshot;
  advance(deltaMs: number): void;
  queueDirection(playerId: string, direction: Direction): void;
  dispose(): void;
  onSnapshot(handler: (snapshot: SimulationSnapshot) => void): () => void;
  onResult(handler: (snapshot: SimulationSnapshot) => void): () => void;
  onStatus(handler: (state: RuntimeEvents["status"]) => void): () => void;
}
