import Phaser from "phaser";
import { SKINS, PARTY_ITEMS, BOARD } from "../config/gameConfig";
import type { RuntimeHandle, SimulationSnapshot } from "../game/types";
import type { Direction } from "@snake/shared";

interface GameSceneData {
  runtime: RuntimeHandle;
}

interface Layout {
  scale: number;
  originX: number;
  originY: number;
  cellSize: number;
}

const INPUT_BINDINGS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  KeyI: "up",
  KeyK: "down",
  KeyJ: "left",
  KeyL: "right",
  KeyT: "up",
  KeyG: "down",
  KeyF: "left",
  KeyH: "right"
};

export class GameScene extends Phaser.Scene {
  private runtime?: RuntimeHandle;
  private layout: Layout = { scale: 1, originX: 0, originY: 0, cellSize: 32 };
  private graphics?: Phaser.GameObjects.Graphics;
  private titleText?: Phaser.GameObjects.Text;
  private noticeText?: Phaser.GameObjects.Text;
  private countdownText?: Phaser.GameObjects.Text;
  private lastStatus?: string;
  private keyboardHandler?: (event: KeyboardEvent) => void;
  private readonly controlSlots = [
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"],
    ["KeyW", "KeyS", "KeyA", "KeyD"],
    ["KeyI", "KeyK", "KeyJ", "KeyL"],
    ["KeyT", "KeyG", "KeyF", "KeyH"]
  ];

  constructor() {
    super("game");
  }

  init(data: GameSceneData): void {
    this.runtime = data.runtime;
    this.lastStatus = undefined;
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#060912");
    this.graphics = this.add.graphics();
    this.titleText = this.add.text(24, 20, "Snake Arena", {
      color: "#f5f7ff",
      fontSize: "24px",
      fontStyle: "700"
    });
    this.noticeText = this.add.text(24, 56, "", {
      color: "#9fb1d1",
      fontSize: "15px"
    });
    this.countdownText = this.add.text(this.scale.width / 2, this.scale.height / 2, "", {
      color: "#ffffff",
      fontSize: "72px",
      fontStyle: "700"
    }).setOrigin(0.5);

    this.keyboardHandler = (event: KeyboardEvent) => {
      if (!this.runtime) {
        return;
      }
      const direction = INPUT_BINDINGS[event.code];
      if (!direction) {
        return;
      }
      const slot = this.controlSlots.findIndex((bindings) => bindings.includes(event.code));
      if (slot < 0) {
        return;
      }
      const player = this.runtime.snapshot.players[slot];
      if (!player || !player.alive) {
        return;
      }
      this.runtime.queueDirection(player.playerId, direction);
    };

    window.addEventListener("keydown", this.keyboardHandler, { passive: true });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.keyboardHandler) {
        window.removeEventListener("keydown", this.keyboardHandler);
      }
      this.graphics?.destroy();
      this.titleText?.destroy();
      this.noticeText?.destroy();
      this.countdownText?.destroy();
    });
  }

  update(_: number, delta: number): void {
    if (!this.runtime || !this.graphics) {
      return;
    }

    this.runtime.advance(delta);
    const snapshot = this.runtime.snapshot;
    this.render(snapshot);

    if (snapshot.status !== this.lastStatus) {
      this.lastStatus = snapshot.status;
      if (snapshot.status === "playing") {
        this.countdownText?.setText("");
      }
      if (snapshot.status === "result") {
        this.game.events.emit("snake:match-ended", snapshot);
      }
    }
  }

  private layoutFor(width: number, height: number): Layout {
    const boardWidth = width - 80;
    const boardHeight = height - 120;
    const cellSize = Math.floor(Math.min(boardWidth / BOARD.cols, boardHeight / BOARD.rows));
    const scale = Math.max(0.65, Math.min(1.35, cellSize / 28));
    const actualWidth = cellSize * BOARD.cols;
    const actualHeight = cellSize * BOARD.rows;
    return {
      scale,
      originX: Math.round((width - actualWidth) / 2),
      originY: Math.round((height - actualHeight) / 2),
      cellSize
    };
  }

  private render(snapshot: SimulationSnapshot): void {
    const { width, height } = this.scale;
    this.layout = this.layoutFor(width, height);
    const { originX, originY, cellSize } = this.layout;

    this.graphics!.clear();
    this.graphics!.fillStyle(0x0d1321, 0.85);
    this.graphics!.fillRoundedRect(originX - 20, originY - 20, cellSize * BOARD.cols + 40, cellSize * BOARD.rows + 40, 20);
    this.graphics!.lineStyle(2, 0x59c3c3, 0.3);
    this.graphics!.strokeRoundedRect(originX - 20, originY - 20, cellSize * BOARD.cols + 40, cellSize * BOARD.rows + 40, 20);

    for (let x = 0; x <= BOARD.cols; x += 1) {
      const gx = originX + x * cellSize;
      this.graphics!.lineStyle(1, 0xffffff, 0.04);
      this.graphics!.lineBetween(gx, originY, gx, originY + BOARD.rows * cellSize);
    }
    for (let y = 0; y <= BOARD.rows; y += 1) {
      const gy = originY + y * cellSize;
      this.graphics!.lineStyle(1, 0xffffff, 0.04);
      this.graphics!.lineBetween(originX, gy, originX + BOARD.cols * cellSize, gy);
    }

    snapshot.food.forEach((food, index) => {
      const fx = originX + food.x * cellSize + cellSize / 2;
      const fy = originY + food.y * cellSize + cellSize / 2;
      const radius = Math.max(4, cellSize * 0.32);
      const pulse = 0.85 + (index % 2) * 0.1;
      this.graphics!.fillStyle(0xf6ad55, 1);
      this.graphics!.fillCircle(fx, fy, radius * pulse);
      this.graphics!.lineStyle(2, 0xffffff, 0.22);
      this.graphics!.strokeCircle(fx, fy, radius * 1.12);
    });

    snapshot.items.forEach((item) => {
      const template = PARTY_ITEMS.find((entry) => entry.effect === item.type);
      const tint = Phaser.Display.Color.HexStringToColor(template?.tint ?? "#9fb1d1").color;
      const ix = originX + item.position.x * cellSize + cellSize / 2;
      const iy = originY + item.position.y * cellSize + cellSize / 2;
      this.graphics!.fillStyle(tint, 1);
      this.graphics!.fillRoundedRect(ix - cellSize * 0.28, iy - cellSize * 0.28, cellSize * 0.56, cellSize * 0.56, 8);
      this.graphics!.lineStyle(2, 0xffffff, 0.2);
      this.graphics!.strokeRoundedRect(ix - cellSize * 0.28, iy - cellSize * 0.28, cellSize * 0.56, cellSize * 0.56, 8);
    });

    snapshot.players.forEach((player) => {
      const skin = SKINS.find((entry) => entry.id === player.skinId) ?? SKINS[0];
      const primary = Phaser.Display.Color.HexStringToColor(skin.primaryColor).color;
      const accent = Phaser.Display.Color.HexStringToColor(skin.accentColor).color;
      const alive = player.alive;
      player.segments.forEach((segment, index) => {
        const x = originX + segment.x * cellSize;
        const y = originY + segment.y * cellSize;
        const size = index === 0 ? cellSize * 0.92 : cellSize * 0.82;
        const offset = (cellSize - size) / 2;
        this.graphics!.fillStyle(index === 0 ? accent : primary, alive ? 1 : 0.35);
        this.graphics!.fillRoundedRect(x + offset, y + offset, size, size, 8);
        this.graphics!.lineStyle(1, 0x000000, 0.18);
        this.graphics!.strokeRoundedRect(x + offset, y + offset, size, size, 8);
        if (index === 0 && alive) {
          this.graphics!.fillStyle(0xffffff, 0.9);
          this.graphics!.fillCircle(x + cellSize * 0.35, y + cellSize * 0.35, Math.max(2, cellSize * 0.07));
          this.graphics!.fillCircle(x + cellSize * 0.65, y + cellSize * 0.35, Math.max(2, cellSize * 0.07));
        }
      });
    });

    const countdownSeconds = Math.ceil(snapshot.countdownRemainingMs / 1000);
    const statusLabel = snapshot.status === "countdown"
      ? `Starting in ${countdownSeconds}`
      : snapshot.status === "playing"
        ? `Match time ${Math.ceil(snapshot.remainingMs / 1000)}s`
        : snapshot.note;

    this.noticeText?.setText(statusLabel);
    this.countdownText?.setText(snapshot.status === "countdown" ? `${countdownSeconds}` : "");
    this.countdownText?.setPosition(width / 2, height / 2);
    this.titleText?.setPosition(24, 20);
  }
}
