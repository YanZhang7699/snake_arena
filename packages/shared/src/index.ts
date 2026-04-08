export type GameMode = "competitive" | "party";
export type PlayType = "solo" | "local" | "online";
export type Difficulty = "easy" | "normal" | "hard";
export type RoomStatus = "lobby" | "countdown" | "in_game" | "result";

export type Direction = "up" | "down" | "left" | "right";

export interface Point {
  x: number;
  y: number;
}

export interface SnakeSkin {
  id: string;
  name: string;
  headStyle: string;
  bodyStyle: string;
  tailStyle: string;
  trailEffect: string;
  accentColor: string;
  primaryColor: string;
  outlineColor: string;
  cosmeticOnly: true;
}

export interface MatchConfig {
  mode: GameMode;
  playType: PlayType;
  difficulty: Difficulty;
  maxPlayers: number;
  isOnline: boolean;
  mapId: string;
  timeLimitSec: number;
}

export interface PlayerState {
  playerId: string;
  name: string;
  skinId: string;
  score: number;
  alive: boolean;
  disconnected?: boolean;
  invincibleUntil: number;
  currentDirection: Direction;
  pendingDirection?: Direction;
  segments: Point[];
  deaths: number;
  eliminations: number;
}

export interface ItemState {
  itemId: string;
  type: string;
  position: Point;
  expiresAt: number;
}

export interface RoomState {
  roomId: string;
  hostId: string;
  status: RoomStatus;
  players: PlayerState[];
  matchConfig: MatchConfig;
  food: Point[];
  items: ItemState[];
  countdownRemainingMs: number;
  endsAt: number;
  winnerId?: string;
  resultEntries?: ResultEntry[];
}

export interface DirectionInput {
  roomId: string;
  playerId: string;
  sequence: number;
  direction: Direction;
  clientTime: number;
}

export interface ResultEntry {
  playerId: string;
  name: string;
  skinId: string;
  score: number;
  eliminations: number;
  maxLength: number;
  survivedMs: number;
  rank: number;
}

export interface AudioTrackSet {
  menu: string;
  soloCompetitive: string;
  soloParty: string;
  multiCompetitive: string;
  multiParty: string;
  result: string;
}

export interface AudioConfig {
  music: AudioTrackSet;
  sfx: Record<string, string>;
  volume: {
    master: number;
    music: number;
    sfx: number;
  };
}
