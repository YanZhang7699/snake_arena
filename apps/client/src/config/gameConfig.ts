import type { AudioConfig, Difficulty, GameMode, PlayType, SnakeSkin } from "@snake/shared";
import type { Point } from "@snake/shared";

export interface BoardConfig {
  cols: number;
  rows: number;
  tickMs: number;
}

export interface DifficultyPreset {
  id: Difficulty;
  label: string;
  moveIntervalMs: number;
  foodSpawnRate: number;
  itemSpawnRate: number;
  obstacleCount: number;
  scoreMultiplier: number;
  roundTimeSec: number;
}

export interface ModePreset {
  mode: GameMode;
  playType: PlayType;
  label: string;
  supportsDifficulty: boolean;
  supportsParty: boolean;
  supportsOnline: boolean;
}

export interface PartyItemConfig {
  id: string;
  label: string;
  effect: "boost" | "slow" | "shield" | "bonus" | "warp";
  tint: string;
}

export interface PlayerSkinPlacement {
  id: string;
  name: string;
  color: string;
}

export const BOARD: BoardConfig = {
  cols: 28,
  rows: 20,
  tickMs: 25
};

export const MODE_PRESETS: ModePreset[] = [
  {
    mode: "competitive",
    playType: "solo",
    label: "Solo Competitive",
    supportsDifficulty: true,
    supportsParty: false,
    supportsOnline: true
  },
  {
    mode: "competitive",
    playType: "local",
    label: "Local Competitive",
    supportsDifficulty: true,
    supportsParty: false,
    supportsOnline: false
  },
  {
    mode: "competitive",
    playType: "online",
    label: "Online Competitive",
    supportsDifficulty: true,
    supportsParty: false,
    supportsOnline: true
  },
  {
    mode: "party",
    playType: "solo",
    label: "Solo Party",
    supportsDifficulty: false,
    supportsParty: true,
    supportsOnline: true
  },
  {
    mode: "party",
    playType: "local",
    label: "Local Party",
    supportsDifficulty: false,
    supportsParty: true,
    supportsOnline: false
  },
  {
    mode: "party",
    playType: "online",
    label: "Online Party",
    supportsDifficulty: false,
    supportsParty: true,
    supportsOnline: true
  }
];

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  easy: {
    id: "easy",
    label: "Easy",
    moveIntervalMs: 145,
    foodSpawnRate: 1.15,
    itemSpawnRate: 0.65,
    obstacleCount: 2,
    scoreMultiplier: 1,
    roundTimeSec: 150
  },
  normal: {
    id: "normal",
    label: "Normal",
    moveIntervalMs: 115,
    foodSpawnRate: 1,
    itemSpawnRate: 1,
    obstacleCount: 4,
    scoreMultiplier: 1.15,
    roundTimeSec: 120
  },
  hard: {
    id: "hard",
    label: "Hard",
    moveIntervalMs: 85,
    foodSpawnRate: 0.92,
    itemSpawnRate: 1.2,
    obstacleCount: 6,
    scoreMultiplier: 1.35,
    roundTimeSec: 95
  }
};

export const PARTY_ITEMS: PartyItemConfig[] = [
  { id: "boost", label: "Boost", effect: "boost", tint: "#68d391" },
  { id: "slow", label: "Slow", effect: "slow", tint: "#59c3c3" },
  { id: "shield", label: "Shield", effect: "shield", tint: "#9f7aea" },
  { id: "bonus", label: "Bonus", effect: "bonus", tint: "#f6ad55" },
  { id: "warp", label: "Warp", effect: "warp", tint: "#ff6b6b" }
];

export const SKINS: SnakeSkin[] = [
  {
    id: "mint",
    name: "Mint Circuit",
    headStyle: "rounded",
    bodyStyle: "slab",
    tailStyle: "point",
    trailEffect: "spark",
    accentColor: "#68d391",
    primaryColor: "#1dd1a1",
    outlineColor: "#d7fff3",
    cosmeticOnly: true
  },
  {
    id: "ember",
    name: "Ember",
    headStyle: "angled",
    bodyStyle: "slab",
    tailStyle: "point",
    trailEffect: "flare",
    accentColor: "#ff6b6b",
    primaryColor: "#f97316",
    outlineColor: "#fff3d7",
    cosmeticOnly: true
  },
  {
    id: "aurora",
    name: "Aurora",
    headStyle: "rounded",
    bodyStyle: "orb",
    tailStyle: "rounded",
    trailEffect: "glow",
    accentColor: "#59c3c3",
    primaryColor: "#60a5fa",
    outlineColor: "#e6f7ff",
    cosmeticOnly: true
  },
  {
    id: "onyx",
    name: "Onyx",
    headStyle: "angular",
    bodyStyle: "slab",
    tailStyle: "point",
    trailEffect: "smoke",
    accentColor: "#cbd5e1",
    primaryColor: "#475569",
    outlineColor: "#ffffff",
    cosmeticOnly: true
  }
];

export const AUDIO_CONFIG: AudioConfig = {
  music: {
    menu: "menu",
    soloCompetitive: "soloCompetitive",
    soloParty: "soloParty",
    multiCompetitive: "multiCompetitive",
    multiParty: "multiParty",
    result: "result"
  },
  sfx: {
    countdown: "countdown",
    eat: "eat",
    pickup: "pickup",
    invincibleStart: "invincibleStart",
    invincibleEnd: "invincibleEnd",
    death: "death",
    victory: "victory",
    uiClick: "uiClick"
  },
  volume: {
    master: 0.8,
    music: 0.7,
    sfx: 0.9
  }
};

export function createSpawnCandidates(cols: number, rows: number): Point[] {
  const points: Point[] = [];
  for (let y = 1; y < rows - 1; y += 1) {
    for (let x = 1; x < cols - 1; x += 1) {
      points.push({ x, y });
    }
  }
  return points;
}
