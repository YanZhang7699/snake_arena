import type { Direction, ItemState, PlayerState, Point, ResultEntry } from "@snake/shared";
import type { DifficultyPreset, PartyItemConfig } from "../config/gameConfig";
import { BOARD, DIFFICULTY_PRESETS, PARTY_ITEMS } from "../config/gameConfig";
import { TypedEmitter } from "../lib/emitter";
import { SeededRng } from "./rng";
import type { MatchSetup, RuntimeEvents, SimulationSnapshot } from "./types";

interface InternalPlayer extends PlayerState {
  spawnAt: Point;
  pendingDirection?: Direction;
  speedMultiplier: number;
  speedUntil: number;
  shieldUntil: number;
  maxLength: number;
  moveCarryMs: number;
  deathAt?: number;
  score: number;
}

interface SimulationResult {
  entries: ResultEntry[];
  winnerId?: string;
}

interface SimulationEventMap extends RuntimeEvents {
  snapshot: SimulationSnapshot;
  result: SimulationSnapshot;
  status: RuntimeEvents["status"];
}

const DIRECTION_VECTORS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left"
};

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isInside(point: Point, cols: number, rows: number): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < cols && point.y < rows;
}

function pointKey(point: Point): string {
  return `${point.x}:${point.y}`;
}

function createBody(initialHead: Point, direction: Direction, length: number): Point[] {
  const vector = DIRECTION_VECTORS[OPPOSITE[direction]];
  return Array.from({ length }, (_, index) => ({
    x: initialHead.x + vector.x * index,
    y: initialHead.y + vector.y * index
  }));
}

function buildDifficulty(config: MatchSetup): DifficultyPreset {
  return DIFFICULTY_PRESETS[config.config.difficulty];
}

export class GameSimulation extends TypedEmitter<SimulationEventMap> {
  private readonly rng: SeededRng;
  private readonly setup: MatchSetup;
  private readonly difficulty: DifficultyPreset;
  private readonly board = BOARD;
  private readonly players: InternalPlayer[];
  private readonly maxFoods: number;
  private readonly maxItems: number;
  private readonly tickMs: number;
  private readonly roundTimeMs: number;
  private readonly spawnCandidates: Point[];
  private accumulator = 0;
  private currentTimeMs = 0;
  private tick = 0;
  private status: SimulationSnapshot["status"] = "countdown";
  private countdownRemainingMs = 3000;
  private remainingMs = 0;
  private food: Point[] = [];
  private items: ItemState[] = [];
  private itemSpawnTimerMs = 0;
  private ended = false;
  public snapshot: SimulationSnapshot;

  constructor(setup: MatchSetup) {
    super();
    this.setup = setup;
    this.difficulty = buildDifficulty(setup);
    this.tickMs = setup.board.tickMs;
    this.roundTimeMs = this.difficulty.roundTimeSec * 1000;
    this.remainingMs = this.roundTimeMs;
    this.maxFoods = setup.config.mode === "party" ? 2 : 1;
    this.maxItems = setup.config.mode === "party" ? 2 : 0;
    this.rng = new SeededRng(setup.seed);
    this.spawnCandidates = Array.from({ length: setup.board.rows * setup.board.cols }, (_, index) => ({
      x: index % setup.board.cols,
      y: Math.floor(index / setup.board.cols)
    }));
    this.players = this.createPlayers(setup.players);
    this.food = this.spawnInitialFood();
    this.snapshot = this.buildSnapshot("Awaiting launch");
  }

  private createPlayers(players: MatchSetup["players"]): InternalPlayer[] {
    const spawnSlots: Point[] = [
      { x: 4, y: 4 },
      { x: this.board.cols - 5, y: this.board.rows - 5 },
      { x: 4, y: this.board.rows - 5 },
      { x: this.board.cols - 5, y: 4 }
    ];

    const headings: Direction[] = ["right", "left", "right", "left"];

    return players.map((player, index) => {
      const spawnAt = spawnSlots[index % spawnSlots.length];
      const heading = headings[index % headings.length];
      const segments = createBody(spawnAt, heading, 4);
      return {
        ...player,
        score: 0,
        alive: true,
        invincibleUntil: 3000,
        currentDirection: heading,
        pendingDirection: heading,
        segments,
        deaths: 0,
        eliminations: 0,
        spawnAt,
        speedMultiplier: 1,
        speedUntil: 0,
        shieldUntil: 0,
        moveCarryMs: 0,
        maxLength: segments.length
      };
    });
  }

  private spawnInitialFood(): Point[] {
    const foods: Point[] = [];
    while (foods.length < this.maxFoods) {
      const position = this.pickFreeCell([...foods, ...this.allSegments()]);
      if (position) {
        foods.push(position);
      } else {
        break;
      }
    }
    return foods;
  }

  private allSegments(): Point[] {
    return this.players.flatMap((player) => player.segments);
  }

  private pickFreeCell(occupied: Point[]): Point | undefined {
    const occupiedKeys = new Set(occupied.map(pointKey));
    const candidates = this.spawnCandidates.filter((point) => !occupiedKeys.has(pointKey(point)));
    if (candidates.length === 0) {
      return undefined;
    }
    return this.rng.pick(candidates);
  }

  queueDirection(playerId: string, direction: Direction): void {
    const player = this.players.find((entry) => entry.playerId === playerId);
    if (!player || !player.alive) {
      return;
    }
    if (OPPOSITE[player.currentDirection] === direction) {
      return;
    }
    player.pendingDirection = direction;
  }

  advance(deltaMs: number): void {
    if (this.ended) {
      return;
    }
    this.currentTimeMs += deltaMs;
    this.accumulator += deltaMs;
    if (this.status === "countdown") {
      this.countdownRemainingMs = Math.max(0, 3000 - this.currentTimeMs);
      if (this.countdownRemainingMs === 0) {
        this.status = "playing";
        this.players.forEach((player) => {
          player.invincibleUntil = this.currentTimeMs + 3000;
        });
        this.emit("status", {
          status: this.status,
          countdownRemainingMs: this.countdownRemainingMs,
          remainingMs: this.remainingMs
        });
      }
      this.emitSnapshot("Countdown");
      return;
    }

    while (this.accumulator >= this.tickMs && this.status === "playing" && !this.ended) {
      this.accumulator -= this.tickMs;
      this.step();
    }

    this.remainingMs = Math.max(0, this.roundTimeMs - this.currentTimeMs);
    if (this.status === "playing" && this.remainingMs === 0) {
      this.finish("Time up");
    }

    this.emitSnapshot();
  }

  private step(): void {
    this.tick += 1;
    this.itemSpawnTimerMs += this.tickMs;

    if (this.setup.config.mode === "party" && this.itemSpawnTimerMs >= 3000 && this.items.length < this.maxItems) {
      this.itemSpawnTimerMs = 0;
      const item = this.spawnItem();
      if (item) {
        this.items.push(item);
      }
    }

    const movingPlayers = this.players.map((player) => {
      if (!player.alive) {
        return undefined;
      }
      const moveIntervalMs = Math.max(40, Math.round(this.difficulty.moveIntervalMs * player.speedMultiplier));
      player.moveCarryMs += this.tickMs;
      if (player.moveCarryMs < moveIntervalMs) {
        return undefined;
      }
      player.moveCarryMs -= moveIntervalMs;
      if (player.pendingDirection && OPPOSITE[player.currentDirection] !== player.pendingDirection) {
        player.currentDirection = player.pendingDirection;
      }
      player.pendingDirection = undefined;
      const vector = DIRECTION_VECTORS[player.currentDirection];
      return {
        player,
        head: {
          x: player.segments[0].x + vector.x,
          y: player.segments[0].y + vector.y
        },
        willGrow: false
      };
    });

    const deadPlayers = new Set<string>();
    const eatenFoods = new Set<number>();
    const eatenItems = new Set<number>();
    const grewPlayers = new Set<string>();

    for (let i = 0; i < movingPlayers.length; i += 1) {
      const entry = movingPlayers[i];
      if (!entry) {
        continue;
      }
      const { player, head } = entry;
      const protectedUntil = Math.max(player.invincibleUntil, player.shieldUntil);
      const protectedNow = this.currentTimeMs < protectedUntil;

      if (!isInside(head, this.board.cols, this.board.rows)) {
        if (!protectedNow) {
          deadPlayers.add(player.playerId);
        } else {
          head.x = clamp(head.x, 0, this.board.cols - 1);
          head.y = clamp(head.y, 0, this.board.rows - 1);
        }
      }

      this.food.forEach((food, foodIndex) => {
        if (samePoint(food, head)) {
          entry.willGrow = true;
          eatenFoods.add(foodIndex);
          grewPlayers.add(player.playerId);
          player.score += Math.round(10 * this.difficulty.scoreMultiplier);
          player.maxLength = Math.max(player.maxLength, player.segments.length + 1);
        }
      });

      for (let j = 0; j < movingPlayers.length; j += 1) {
        if (i === j) {
          continue;
        }
        const other = movingPlayers[j];
        if (!other || !other.player.alive) {
          continue;
        }
        if (samePoint(other.head, head) && !protectedNow) {
          deadPlayers.add(player.playerId);
          deadPlayers.add(other.player.playerId);
        }
      }

      const selfBody = player.segments.slice(0, entry.willGrow ? player.segments.length : Math.max(0, player.segments.length - 1));
      if (!protectedNow && selfBody.some((segment) => samePoint(segment, head))) {
        deadPlayers.add(player.playerId);
      }

      for (const otherPlayer of this.players) {
        if (!otherPlayer.alive || otherPlayer.playerId === player.playerId) {
          continue;
        }
        const otherMove = movingPlayers.find((candidate) => candidate?.player.playerId === otherPlayer.playerId);
        const otherSegments = otherPlayer.segments.slice(
          0,
          otherMove?.willGrow ? otherPlayer.segments.length : Math.max(0, otherPlayer.segments.length - (otherMove ? 1 : 0))
        );
        if (!protectedNow && otherSegments.some((segment) => samePoint(segment, head))) {
          deadPlayers.add(player.playerId);
          otherPlayer.eliminations += 1;
          break;
        }
      }

      this.items.forEach((item, itemIndex) => {
        if (!samePoint(item.position, head)) {
          return;
        }
        eatenItems.add(itemIndex);
        this.applyItemEffect(player, item);
      });
    }

    const remainingFood = this.food.filter((_, index) => !eatenFoods.has(index));
    this.food = remainingFood;
    while (this.food.length < this.maxFoods) {
      const spawned = this.pickFreeCell([...this.food, ...this.items.map((item) => item.position), ...this.allSegments()]);
      if (!spawned) {
        break;
      }
      this.food.push(spawned);
    }

    this.items = this.items.filter((_, index) => !eatenItems.has(index));

    for (const player of this.players) {
      if (!player.alive || deadPlayers.has(player.playerId)) {
        player.alive = false;
        if (!player.deathAt) {
          player.deathAt = this.currentTimeMs;
        }
        continue;
      }

      const move = movingPlayers.find((entry) => entry?.player.playerId === player.playerId);
      if (!move) {
        continue;
      }

      const vector = DIRECTION_VECTORS[player.currentDirection];
      const nextHead = {
        x: move.head.x,
        y: move.head.y
      };
      if (!isInside(nextHead, this.board.cols, this.board.rows)) {
        const protectedUntil = Math.max(player.invincibleUntil, player.shieldUntil);
        if (this.currentTimeMs >= protectedUntil) {
          player.alive = false;
          player.deathAt = this.currentTimeMs;
          continue;
        }
      }

      player.segments.unshift(nextHead);
      if (!grewPlayers.has(player.playerId)) {
        player.segments.pop();
      }
      player.maxLength = Math.max(player.maxLength, player.segments.length);
    }

    this.refreshEffectTimers();
    this.evaluateEndState();
  }

  private refreshEffectTimers(): void {
    for (const player of this.players) {
      if (player.speedUntil > 0 && this.currentTimeMs >= player.speedUntil) {
        player.speedUntil = 0;
        player.speedMultiplier = 1;
      }
      if (player.shieldUntil > 0 && this.currentTimeMs >= player.shieldUntil) {
        player.shieldUntil = 0;
      }
    }
  }

  private spawnItem(): ItemState | undefined {
    const template = this.rng.pick(PARTY_ITEMS);
    const position = this.pickFreeCell([...this.food, ...this.items.map((item) => item.position), ...this.allSegments()]);
    if (!position) {
      return undefined;
    }
    return {
      itemId: `${template.id}-${this.tick}-${Math.floor(this.rng.next() * 10000)}`,
      type: template.effect,
      position,
      expiresAt: this.currentTimeMs + 12000
    };
  }

  private applyItemEffect(player: InternalPlayer, item: ItemState): void {
    switch (item.type) {
      case "boost":
        player.speedMultiplier = 0.72;
        player.speedUntil = this.currentTimeMs + 4000;
        break;
      case "slow":
        player.speedMultiplier = 1.38;
        player.speedUntil = this.currentTimeMs + 3500;
        break;
      case "shield":
        player.shieldUntil = this.currentTimeMs + 5000;
        break;
      case "bonus":
        player.score += 25;
        break;
      case "warp": {
        const destination = this.pickFreeCell([...this.food, ...this.items.map((entry) => entry.position)]);
        if (destination) {
          const length = Math.max(3, player.segments.length);
          player.segments = createBody(destination, player.currentDirection, length);
        }
        break;
      }
      default:
        break;
    }
  }

  private evaluateEndState(): void {
    const alivePlayers = this.players.filter((player) => player.alive);
    if (alivePlayers.length === 0) {
      this.finish("Everyone eliminated");
    } else if (this.setup.config.maxPlayers > 1 && alivePlayers.length === 1 && this.setup.config.mode === "competitive") {
      this.finish("Last snake standing");
    } else if (this.items.some((item) => item.expiresAt <= this.currentTimeMs)) {
      this.items = this.items.filter((item) => item.expiresAt > this.currentTimeMs);
    }
  }

  private finish(note: string): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.status = "result";
    this.snapshot = this.buildSnapshot(note);
    this.emit("status", {
      status: this.status,
      countdownRemainingMs: 0,
      remainingMs: this.remainingMs
    });
    this.emit("result", this.snapshot);
  }

  private buildResultEntries(): SimulationResult {
    const entries = this.players.map((player, index) => {
      const survivedMs = player.deathAt ?? this.currentTimeMs;
      return {
        playerId: player.playerId,
        name: player.name,
        skinId: player.skinId,
        score: player.score,
        eliminations: player.eliminations,
        maxLength: player.maxLength,
        survivedMs,
        rank: index + 1
      };
    });

    entries.sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      if (a.maxLength !== b.maxLength) {
        return b.maxLength - a.maxLength;
      }
      if (a.survivedMs !== b.survivedMs) {
        return b.survivedMs - a.survivedMs;
      }
      return a.name.localeCompare(b.name);
    });

    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return {
      entries,
      winnerId: entries[0]?.playerId
    };
  }

  private buildSnapshot(note: string): SimulationSnapshot {
    const result = this.buildResultEntries();
    return {
      timeMs: this.currentTimeMs,
      tick: this.tick,
      status: this.status,
      countdownRemainingMs: this.countdownRemainingMs,
      remainingMs: this.remainingMs,
      players: this.players.map((player) => ({
        playerId: player.playerId,
        name: player.name,
        skinId: player.skinId,
        score: player.score,
        alive: player.alive,
        invincibleUntil: player.invincibleUntil,
        currentDirection: player.currentDirection,
        segments: player.segments.map((segment) => ({ ...segment })),
        deaths: player.deathAt ? 1 : 0,
        eliminations: player.eliminations
      })),
      food: this.food.map((point) => ({ ...point })),
      items: this.items.map((item) => ({
        itemId: item.itemId,
        type: item.type,
        position: { ...item.position },
        expiresAt: item.expiresAt
      })),
      resultEntries: result.entries,
      winnerId: result.winnerId,
      note
    };
  }

  private emitSnapshot(note = this.ended ? "Result" : ""): void {
    this.snapshot = this.buildSnapshot(note);
    this.emit("snapshot", this.snapshot);
  }

  dispose(): void {
    this.players.length = 0;
    this.food.length = 0;
    this.items.length = 0;
  }
}
