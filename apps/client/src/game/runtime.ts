import type { Direction } from "@snake/shared";
import { TypedEmitter } from "../lib/emitter";
import { GameSimulation } from "./simulation";
import { roomStateToSnapshot } from "./roomAdapter";
import type { MatchSetup, RuntimeEvents, RuntimeHandle, SimulationSnapshot } from "./types";
import { OnlineClient } from "../net/onlineClient";

abstract class RuntimeBase extends TypedEmitter<RuntimeEvents> implements RuntimeHandle {
  public snapshot: SimulationSnapshot;

  protected constructor(snapshot: SimulationSnapshot) {
    super();
    this.snapshot = snapshot;
  }

  abstract advance(deltaMs: number): void;
  abstract queueDirection(playerId: string, direction: Direction): void;
  abstract dispose(): void;

  onSnapshot(handler: (snapshot: SimulationSnapshot) => void): () => void {
    return this.on("snapshot", handler);
  }

  onResult(handler: (snapshot: SimulationSnapshot) => void): () => void {
    return this.on("result", handler);
  }

  onStatus(handler: (state: RuntimeEvents["status"]) => void): () => void {
    return this.on("status", handler);
  }

  protected updateSnapshot(snapshot: SimulationSnapshot): void {
    this.snapshot = snapshot;
    this.emit("snapshot", snapshot);
    this.emit("status", {
      status: snapshot.status,
      countdownRemainingMs: snapshot.countdownRemainingMs,
      remainingMs: snapshot.remainingMs
    });
    if (snapshot.status === "result") {
      this.emit("result", snapshot);
    }
  }
}

class LocalRuntime extends RuntimeBase {
  private readonly simulation: GameSimulation;
  private disposed = false;

  constructor(setup: MatchSetup) {
    const simulation = new GameSimulation(setup);
    super(simulation.snapshot);
    this.simulation = simulation;
    this.simulation.on("snapshot", (snapshot) => this.updateSnapshot(snapshot));
    this.simulation.on("result", (snapshot) => this.updateSnapshot(snapshot));
    this.simulation.on("status", (status) => this.emit("status", status));
  }

  advance(deltaMs: number): void {
    if (this.disposed) {
      return;
    }
    this.simulation.advance(deltaMs);
    this.snapshot = this.simulation.snapshot;
  }

  queueDirection(playerId: string, direction: Direction): void {
    this.simulation.queueDirection(playerId, direction);
  }

  dispose(): void {
    this.disposed = true;
    this.simulation.dispose();
  }
}

class RemoteRuntime extends RuntimeBase {
  private readonly fallback: LocalRuntime;
  private readonly client: OnlineClient;
  private connected = false;
  private disposed = false;

  constructor(setup: MatchSetup) {
    const fallback = new LocalRuntime(setup);
    super(fallback.snapshot);
    this.fallback = fallback;
    this.client = new OnlineClient();
    if (setup.serverUrl) {
      void this.client.connect(setup.serverUrl);
    }

    this.client.on("connected", () => {
      this.connected = true;
      this.emit("status", {
        status: this.snapshot.status,
        countdownRemainingMs: this.snapshot.countdownRemainingMs,
        remainingMs: this.snapshot.remainingMs
      });
    });
    this.client.on("disconnected", () => {
      this.connected = false;
    });
    this.client.on("snapshot", (room) => {
      this.updateSnapshot(roomStateToSnapshot(room));
    });
    this.client.on("room", () => undefined);
    this.client.on("error", (error) => {
      console.warn("Online client error:", error.message);
    });
  }

  advance(deltaMs: number): void {
    if (this.disposed) {
      return;
    }
    if (!this.connected) {
      this.fallback.advance(deltaMs);
      this.snapshot = this.fallback.snapshot;
      return;
    }
    this.snapshot = this.fallback.snapshot;
  }

  queueDirection(playerId: string, direction: Direction): void {
    this.client.sendDirection(direction, Date.now());
    this.fallback.queueDirection(playerId, direction);
  }

  dispose(): void {
    this.disposed = true;
    this.client.disconnect();
    this.fallback.dispose();
  }
}

export function createRuntime(setup: MatchSetup): RuntimeHandle {
  if (setup.config.isOnline) {
    return new RemoteRuntime(setup);
  }
  return new LocalRuntime(setup);
}
