import type { Difficulty, GameMode, MatchConfig, PlayType } from "@snake/shared";

export const SERVER_TICK_MS = 100;
export const COUNTDOWN_MS = 3000;
export const INVINCIBLE_MS = 3000;
export const DISCONNECT_GRACE_MS = 15000;
export const BOARD_WIDTH = 28;
export const BOARD_HEIGHT = 20;
export const INITIAL_SNAKE_LENGTH = 3;
export const DEFAULT_MAX_PLAYERS = 4;
export const DEFAULT_TIME_LIMIT_SEC = 120;
export const DEFAULT_FOOD_TARGET = 3;

export interface DifficultyRules {
  moveIntervalMs: number;
  timeLimitSec: number;
  foodTarget: number;
  scorePerFood: number;
}

export const DIFFICULTY_RULES: Record<GameMode, Record<Difficulty, DifficultyRules>> = {
  competitive: {
    easy: { moveIntervalMs: 260, timeLimitSec: 120, foodTarget: 2, scorePerFood: 10 },
    normal: { moveIntervalMs: 200, timeLimitSec: 120, foodTarget: 3, scorePerFood: 12 },
    hard: { moveIntervalMs: 150, timeLimitSec: 90, foodTarget: 3, scorePerFood: 15 }
  },
  party: {
    easy: { moveIntervalMs: 240, timeLimitSec: 150, foodTarget: 3, scorePerFood: 8 },
    normal: { moveIntervalMs: 190, timeLimitSec: 150, foodTarget: 4, scorePerFood: 10 },
    hard: { moveIntervalMs: 140, timeLimitSec: 120, foodTarget: 4, scorePerFood: 12 }
  }
};

export function resolveMatchConfig(input: Partial<MatchConfig> = {}): MatchConfig {
  const mode = input.mode ?? "competitive";
  const difficulty = input.difficulty ?? "normal";
  const base = DIFFICULTY_RULES[mode][difficulty];
  return {
    mode,
    playType: input.playType ?? "online",
    difficulty,
    maxPlayers: clampMaxPlayers(input.maxPlayers ?? DEFAULT_MAX_PLAYERS),
    isOnline: input.isOnline ?? true,
    mapId: input.mapId ?? "default",
    timeLimitSec: clampTimeLimit(input.timeLimitSec ?? base.timeLimitSec)
  };
}

export function resolveDifficultyRules(mode: GameMode, difficulty: Difficulty): DifficultyRules {
  return DIFFICULTY_RULES[mode][difficulty];
}

export function clampMaxPlayers(maxPlayers: number): number {
  return Math.max(1, Math.min(DEFAULT_MAX_PLAYERS, Math.floor(maxPlayers)));
}

export function clampTimeLimit(timeLimitSec: number): number {
  return Math.max(30, Math.min(600, Math.floor(timeLimitSec)));
}

export function isSoloPlayType(playType: PlayType): boolean {
  return playType === "solo";
}
