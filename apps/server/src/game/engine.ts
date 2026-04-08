import type { Direction, Point, ResultEntry, RoomState } from "@snake/shared";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  COUNTDOWN_MS,
  DISCONNECT_GRACE_MS,
  INITIAL_SNAKE_LENGTH,
  INVINCIBLE_MS,
  resolveDifficultyRules
} from "./constants.js";
import type { MoveOutcome, RuntimePlayerState, RuntimeRoomState } from "./types.js";

const OPPOSITES: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left"
};

const SPAWNS: Array<{ head: Point; direction: Direction }> = [
  { head: { x: 5, y: 5 }, direction: "right" },
  { head: { x: BOARD_WIDTH - 6, y: BOARD_HEIGHT - 6 }, direction: "left" },
  { head: { x: 5, y: BOARD_HEIGHT - 6 }, direction: "right" },
  { head: { x: BOARD_WIDTH - 6, y: 5 }, direction: "left" }
];

export class GameEngine {
  readonly roomId: string;
  readonly matchConfig: RoomState["matchConfig"];
  readonly state: RuntimeRoomState;
  private readonly players: RuntimePlayerState[] = [];

  constructor(roomId: string, matchConfig: RoomState["matchConfig"], hostId: string, hostName: string, skinId: string, now: number) {
    this.roomId = roomId;
    this.matchConfig = matchConfig;
    this.state = {
      roomId,
      hostId,
      status: "lobby",
      players: [],
      matchConfig,
      food: [],
      items: [],
      countdownRemainingMs: 0,
      endsAt: 0,
      winnerId: undefined,
      createdAt: now,
      updatedAt: now,
      countdownEndsAt: 0,
      matchEndsAt: 0,
      lastTickAt: now,
      resultEntries: [],
      announcedResult: false,
      startedAt: 0,
      seed: this.hash(roomId) ^ now
    };
    this.players.push(this.makePlayer(hostId, hostName, skinId, now, 0, true));
    this.syncPublicState(now);
  }

  get status(): RoomState["status"] {
    return this.state.status;
  }

  get playerCount(): number {
    return this.players.length;
  }

  canJoin(maxPlayers: number): boolean {
    return this.players.length < maxPlayers;
  }

  canStart(): boolean {
    return this.players.length > 0 && this.players.every((player) => player.alive && !player.disconnected && player.ready);
  }

  addPlayer(playerId: string, name: string, skinId: string, now: number, socketId?: string): RuntimePlayerState {
    const existing = this.players.find((player) => player.playerId === playerId);
    if (existing) {
      existing.name = name;
      existing.skinId = skinId;
      existing.socketId = socketId;
      existing.disconnectedAt = undefined;
      existing.disconnected = false;
      existing.ready = true;
      existing.revivedAt = now;
      this.syncPublicState(now);
      return existing;
    }
    const player = this.makePlayer(playerId, name, skinId, now, this.players.length, false);
    player.socketId = socketId;
    this.players.push(player);
    this.syncPublicState(now);
    return player;
  }

  reconnectPlayer(playerId: string, socketId: string, now: number): RuntimePlayerState | undefined {
    const player = this.players.find((candidate) => candidate.playerId === playerId);
    if (!player) {
      return undefined;
    }
    player.socketId = socketId;
    player.disconnectedAt = undefined;
    player.disconnected = false;
    player.ready = true;
    player.revivedAt = now;
    this.syncPublicState(now);
    return player;
  }

  markReady(playerId: string, ready: boolean, now: number): boolean {
    const player = this.players.find((candidate) => candidate.playerId === playerId);
    if (!player) {
      return false;
    }
    player.ready = ready;
    this.syncPublicState(now);
    return true;
  }

  markDisconnected(playerId: string, now: number): void {
    const player = this.players.find((candidate) => candidate.playerId === playerId);
    if (!player) {
      return;
    }
    player.disconnected = true;
    player.disconnectedAt = now;
    player.socketId = undefined;
    this.syncPublicState(now);
  }

  removePlayer(playerId: string, now: number): boolean {
    const index = this.players.findIndex((candidate) => candidate.playerId === playerId);
    if (index === -1) {
      return false;
    }
    this.players.splice(index, 1);
    if (this.state.hostId === playerId) {
      this.state.hostId = this.players[0]?.playerId ?? "";
    }
    this.syncPublicState(now);
    return true;
  }

  startCountdown(now: number): void {
    if (this.state.status !== "lobby") {
      return;
    }
    this.state.status = "countdown";
    this.state.countdownRemainingMs = COUNTDOWN_MS;
    this.state.countdownEndsAt = now + COUNTDOWN_MS;
    this.syncPublicState(now);
  }

  startMatch(now: number): void {
    this.state.status = "in_game";
    this.state.startedAt = now;
    this.state.countdownRemainingMs = 0;
    this.state.countdownEndsAt = 0;
    this.state.matchEndsAt = now + this.matchConfig.timeLimitSec * 1000;
    this.state.endsAt = this.state.matchEndsAt;
    this.state.food = [];
    this.state.items = [];
    this.state.winnerId = undefined;
    this.state.announcedResult = false;
    this.state.resultEntries = [];
    this.players.forEach((player, index) => {
      const spawn = SPAWNS[index % SPAWNS.length];
      player.alive = true;
      player.disconnected = false;
      player.disconnectedAt = undefined;
      player.invincibleUntil = now + INVINCIBLE_MS;
      player.currentDirection = spawn.direction;
      player.pendingDirection = undefined;
      player.score = 0;
      player.deaths = 0;
      player.eliminations = 0;
      player.lastSequence = 0;
      player.growthPending = 0;
      player.moveCarryMs = 0;
      player.maxLength = INITIAL_SNAKE_LENGTH;
      player.ready = true;
      player.segments = this.spawnSnakeSegments(spawn.head, spawn.direction);
      player.joinedAt = player.joinedAt || now;
      player.revivedAt = now;
    });
    this.spawnFood(this.resolveFoodTarget());
    this.syncPublicState(now);
  }

  resetToLobby(now: number): void {
    this.state.status = "lobby";
    this.state.countdownRemainingMs = 0;
    this.state.countdownEndsAt = 0;
    this.state.matchEndsAt = 0;
    this.state.endsAt = 0;
    this.state.winnerId = undefined;
    this.state.food = [];
    this.state.items = [];
    this.state.resultEntries = [];
    this.state.announcedResult = false;
    this.players.forEach((player, index) => {
      const spawn = SPAWNS[index % SPAWNS.length];
      player.alive = true;
      player.disconnected = false;
      player.disconnectedAt = undefined;
      player.invincibleUntil = 0;
      player.currentDirection = spawn.direction;
      player.pendingDirection = undefined;
      player.score = 0;
      player.deaths = 0;
      player.eliminations = 0;
      player.lastSequence = 0;
      player.growthPending = 0;
      player.moveCarryMs = 0;
      player.maxLength = INITIAL_SNAKE_LENGTH;
      player.ready = false;
      player.segments = this.spawnSnakeSegments(spawn.head, spawn.direction);
    });
    this.syncPublicState(now);
  }

  applyDirection(payload: { playerId: string; sequence: number; direction: Direction }, now: number): boolean {
    const player = this.players.find((candidate) => candidate.playerId === payload.playerId);
    if (!player || !player.alive) {
      return false;
    }
    if (payload.sequence <= player.lastSequence) {
      return false;
    }
    const nextDirection = payload.direction;
    if (player.pendingDirection && nextDirection === OPPOSITES[player.pendingDirection]) {
      return false;
    }
    if (player.segments.length > 1 && nextDirection === OPPOSITES[player.currentDirection]) {
      return false;
    }
    player.pendingDirection = nextDirection;
    player.lastSequence = payload.sequence;
    this.syncPublicState(now);
    return true;
  }

  step(now: number, deltaMs: number): RuntimeRoomState {
    this.state.lastTickAt = now;
    this.pruneDisconnectedPlayers(now);

    if (this.state.status === "countdown") {
      this.state.countdownRemainingMs = Math.max(0, this.state.countdownEndsAt - now);
      if (this.state.countdownRemainingMs === 0) {
        this.startMatch(now);
      }
      this.syncPublicState(now);
      return this.state;
    }

    if (this.state.status !== "in_game") {
      this.syncPublicState(now);
      return this.state;
    }

    if (now >= this.state.matchEndsAt) {
      this.finishMatch(now);
      return this.state;
    }

    const rules = resolveDifficultyRules(this.matchConfig.mode, this.matchConfig.difficulty);
    const movers = new Set<RuntimePlayerState>();

    for (const player of this.players) {
      if (!player.alive) {
        continue;
      }
      player.moveCarryMs += deltaMs;
      while (player.moveCarryMs >= rules.moveIntervalMs) {
        player.moveCarryMs -= rules.moveIntervalMs;
        movers.add(player);
      }
    }

    if (movers.size === 0) {
      this.syncPublicState(now);
      return this.state;
    }

    for (const player of movers) {
      const direction = player.pendingDirection ?? player.currentDirection;
      player.currentDirection = direction;
      player.pendingDirection = undefined;
      this.movePlayer(player);
    }

    this.resolveFood(rules.scorePerFood);
    this.resolveCollisions(now);
    this.ensureFoodTarget(this.resolveFoodTarget());

    const alivePlayers = this.players.filter((player) => player.alive);
    if (alivePlayers.length <= 1) {
      this.finishMatch(now, alivePlayers[0]?.playerId);
    } else if (now >= this.state.matchEndsAt) {
      this.finishMatch(now);
    }

    this.syncPublicState(now);
    return this.state;
  }

  snapshot(): RoomState {
    return this.clonePublicState();
  }

  private movePlayer(player: RuntimePlayerState): void {
    const nextHead = this.stepPoint(player.segments[0], player.currentDirection);
    const ateFood = this.state.food.some((food) => food.x === nextHead.x && food.y === nextHead.y);
    const shouldGrow = ateFood || player.growthPending > 0;
    const nextSegments = [nextHead, ...player.segments];
    if (!shouldGrow) {
      nextSegments.pop();
    } else if (player.growthPending > 0) {
      player.growthPending -= 1;
    }
    player.segments = nextSegments;
    player.maxLength = Math.max(player.maxLength, player.segments.length);
  }

  private resolveFood(scorePerFood: number): void {
    const remainingFood: Point[] = [];
    for (const food of this.state.food) {
      const eater = this.players.find((player) => player.alive && player.segments[0].x === food.x && player.segments[0].y === food.y);
      if (!eater) {
        remainingFood.push(food);
        continue;
      }
      eater.score += scorePerFood;
      eater.growthPending += 1;
      eater.maxLength = Math.max(eater.maxLength, eater.segments.length + 1);
    }
    this.state.food = remainingFood;
  }

  private resolveCollisions(now: number): void {
    for (const player of this.players) {
      if (!player.alive) {
        continue;
      }
      const head = player.segments[0];
      const invincible = player.invincibleUntil > now;
      const outside = head.x < 0 || head.y < 0 || head.x >= BOARD_WIDTH || head.y >= BOARD_HEIGHT;
      if (outside) {
        if (!invincible) {
          this.eliminate(player, now);
        }
        continue;
      }

      for (const other of this.players) {
        if (!other.alive) {
          continue;
        }
        const collided = other.segments.some((segment, index) => {
          if (other.playerId === player.playerId && index === 0) {
            return false;
          }
          return segment.x === head.x && segment.y === head.y;
        });
        if (collided && !invincible) {
          this.eliminate(player, now);
          if (other.playerId !== player.playerId) {
            other.eliminations += 1;
          }
          break;
        }
      }
    }
  }

  private finishMatch(now: number, winnerId?: string): void {
    this.state.status = "result";
    this.state.matchEndsAt = now;
    this.state.endsAt = now;
    this.state.winnerId = winnerId ?? this.pickWinnerId(now);
    this.state.resultEntries = this.calculateResults(now);
    this.syncPublicState(now);
  }

  private pickWinnerId(now: number): string | undefined {
    const results = this.calculateResults(now);
    return results[0]?.playerId;
  }

  private calculateResults(now: number): ResultEntry[] {
    return this.players
      .map((player) => ({
        playerId: player.playerId,
        name: player.name,
        skinId: player.skinId,
        score: player.score,
        eliminations: player.eliminations,
        maxLength: player.maxLength,
        survivedMs: Math.max(0, now - player.joinedAt),
        rank: 0,
        alive: player.alive
      }))
      .sort((a, b) => {
        if (a.alive !== b.alive) {
          return a.alive ? -1 : 1;
        }
        if (a.score !== b.score) {
          return b.score - a.score;
        }
        if (a.eliminations !== b.eliminations) {
          return b.eliminations - a.eliminations;
        }
        if (a.maxLength !== b.maxLength) {
          return b.maxLength - a.maxLength;
        }
        if (a.survivedMs !== b.survivedMs) {
          return b.survivedMs - a.survivedMs;
        }
        return a.playerId.localeCompare(b.playerId);
      })
      .map((entry, index) => ({
        playerId: entry.playerId,
        name: entry.name,
        skinId: entry.skinId,
        score: entry.score,
        eliminations: entry.eliminations,
        maxLength: entry.maxLength,
        survivedMs: entry.survivedMs,
        rank: index + 1
      }));
  }

  private pruneDisconnectedPlayers(now: number): void {
    for (const player of [...this.players]) {
      if (!player.disconnectedAt) {
        continue;
      }
      if (now - player.disconnectedAt < DISCONNECT_GRACE_MS) {
        continue;
      }
      if (this.state.status === "in_game") {
        this.eliminate(player, now);
        continue;
      }
      this.removePlayer(player.playerId, now);
    }
  }

  private eliminate(player: RuntimePlayerState, now: number): void {
    player.alive = false;
    player.disconnected = false;
    player.disconnectedAt = undefined;
    player.pendingDirection = undefined;
    player.segments = [];
    player.moveCarryMs = 0;
    player.growthPending = 0;
    player.deaths += 1;
    this.syncPublicState(now);
  }

  private spawnFood(targetCount: number): void {
    while (this.state.food.length < targetCount) {
      const point = this.randomFreePoint();
      if (!point) {
        return;
      }
      this.state.food.push(point);
    }
  }

  private ensureFoodTarget(targetCount: number): void {
    this.state.food = this.state.food.filter((food) => this.isFree(food));
    this.spawnFood(targetCount);
  }

  private resolveFoodTarget(): number {
    return Math.max(2, resolveDifficultyRules(this.matchConfig.mode, this.matchConfig.difficulty).foodTarget);
  }

  private randomFreePoint(): Point | null {
    const occupied = new Set<string>();
    for (const player of this.players) {
      for (const segment of player.segments) {
        occupied.add(this.pointKey(segment));
      }
    }
    for (const food of this.state.food) {
      occupied.add(this.pointKey(food));
    }

    const total = BOARD_WIDTH * BOARD_HEIGHT;
    for (let attempts = 0; attempts < total; attempts += 1) {
      this.state.seed = this.nextSeed(this.state.seed);
      const x = this.state.seed % BOARD_WIDTH;
      this.state.seed = this.nextSeed(this.state.seed);
      const y = this.state.seed % BOARD_HEIGHT;
      const point = { x, y };
      if (!occupied.has(this.pointKey(point))) {
        return point;
      }
    }
    return null;
  }

  private isFree(point: Point): boolean {
    for (const player of this.players) {
      if (player.segments.some((segment) => segment.x === point.x && segment.y === point.y)) {
        return false;
      }
    }
    return true;
  }

  private spawnSnakeSegments(head: Point, direction: Direction): Point[] {
    const segments: Point[] = [head];
    for (let index = 1; index < INITIAL_SNAKE_LENGTH; index += 1) {
      segments.push(this.stepPoint(segments[index - 1], OPPOSITES[direction]));
    }
    return segments;
  }

  private stepPoint(point: Point, direction: Direction): Point {
    switch (direction) {
      case "up":
        return { x: point.x, y: point.y - 1 };
      case "down":
        return { x: point.x, y: point.y + 1 };
      case "left":
        return { x: point.x - 1, y: point.y };
      case "right":
        return { x: point.x + 1, y: point.y };
    }
  }

  private publicPlayer(player: RuntimePlayerState): RoomState["players"][number] {
    return {
      playerId: player.playerId,
      name: player.name,
      skinId: player.skinId,
      score: player.score,
      alive: player.alive,
      disconnected: player.disconnected,
      invincibleUntil: player.invincibleUntil,
      currentDirection: player.currentDirection,
      pendingDirection: player.pendingDirection,
      segments: player.segments.map((segment) => ({ ...segment })),
      deaths: player.deaths,
      eliminations: player.eliminations
    };
  }

  private syncPublicState(now: number): void {
    this.state.players = this.players.map((player) => this.publicPlayer(player));
    this.state.countdownRemainingMs = this.state.status === "countdown" ? Math.max(0, this.state.countdownEndsAt - now) : 0;
    this.state.endsAt = this.state.status === "in_game" ? this.state.matchEndsAt : this.state.endsAt;
    this.state.updatedAt = now;
  }

  private clonePublicState(): RoomState {
    return {
      roomId: this.state.roomId,
      hostId: this.state.hostId,
      status: this.state.status,
      players: this.state.players.map((player) => ({
        ...player,
        segments: player.segments.map((segment) => ({ ...segment }))
      })),
      matchConfig: this.state.matchConfig,
      food: this.state.food.map((food) => ({ ...food })),
      items: this.state.items.map((item) => ({ ...item })),
      countdownRemainingMs: this.state.countdownRemainingMs,
      endsAt: this.state.endsAt,
      winnerId: this.state.winnerId
    };
  }

  private makePlayer(playerId: string, name: string, skinId: string, now: number, index: number, ready: boolean): RuntimePlayerState {
    const spawn = SPAWNS[index % SPAWNS.length];
    return {
      playerId,
      name,
      skinId,
      score: 0,
      alive: true,
      invincibleUntil: 0,
      currentDirection: spawn.direction,
      pendingDirection: undefined,
      segments: this.spawnSnakeSegments(spawn.head, spawn.direction),
      deaths: 0,
      eliminations: 0,
      ready,
      lastSequence: 0,
      growthPending: 0,
      moveCarryMs: 0,
      maxLength: INITIAL_SNAKE_LENGTH,
      joinedAt: now,
      socketId: undefined,
      disconnectedAt: undefined,
      disconnected: false,
      revivedAt: now
    };
  }

  private pointKey(point: Point): string {
    return `${point.x}:${point.y}`;
  }

  private nextSeed(seed: number): number {
    return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  }

  private hash(input: string): number {
    let value = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      value ^= input.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }
}
