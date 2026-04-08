import Phaser from "phaser";
import type { Point, SnakeSkin } from "@snake/shared";
import { SKINS } from "../config/gameConfig";
import type { SimulationSnapshot } from "./types";

const CELL_SIZE = 26;
const BOARD_WIDTH = 28;
const BOARD_HEIGHT = 20;

function pointKey(point: Point): string {
  return `${point.x}:${point.y}`;
}

function findSkin(skinId: string): SnakeSkin {
  return SKINS.find((skin) => skin.id === skinId) ?? SKINS[0];
}

export class BoardScene extends Phaser.Scene {
  private snapshot?: SimulationSnapshot;
  private grid?: Phaser.GameObjects.Graphics;
  private entities?: Phaser.GameObjects.Graphics;
  private effects?: Phaser.GameObjects.Graphics;

  constructor() {
    super("board");
  }

  create(): void {
    this.grid = this.add.graphics();
    this.entities = this.add.graphics();
    this.effects = this.add.graphics();
    this.drawBackground();
  }

  update(): void {
    if (!this.snapshot) {
      return;
    }
    this.drawSnapshot();
  }

  setSnapshot(snapshot: SimulationSnapshot): void {
    this.snapshot = snapshot;
  }

  private drawBackground(): void {
    if (!this.grid) {
      return;
    }
    this.grid.clear();
    this.grid.fillStyle(0x09111f, 1);
    this.grid.fillRoundedRect(0, 0, BOARD_WIDTH * CELL_SIZE, BOARD_HEIGHT * CELL_SIZE, 28);

    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const color = (x + y) % 2 === 0 ? 0x0f1a2a : 0x122036;
        this.grid.fillStyle(color, 0.9);
        this.grid.fillRoundedRect(x * CELL_SIZE + 4, y * CELL_SIZE + 4, CELL_SIZE - 6, CELL_SIZE - 6, 8);
      }
    }
  }

  private drawSnapshot(): void {
    if (!this.snapshot || !this.entities || !this.effects) {
      return;
    }

    const entities = this.entities;
    const effects = this.effects;

    entities.clear();
    effects.clear();

    const occupied = new Set<string>();
    for (const food of this.snapshot.food) {
      occupied.add(pointKey(food));
      entities.fillStyle(0xf6ad55, 1);
      entities.fillCircle(food.x * CELL_SIZE + CELL_SIZE / 2, food.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE * 0.25);
      entities.lineStyle(2, 0xfff4d0, 0.85);
      entities.strokeCircle(food.x * CELL_SIZE + CELL_SIZE / 2, food.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE * 0.25);
    }

    for (const item of this.snapshot.items) {
      occupied.add(pointKey(item.position));
      entities.fillStyle(0x59c3c3, 0.95);
      entities.fillRoundedRect(item.position.x * CELL_SIZE + 7, item.position.y * CELL_SIZE + 7, CELL_SIZE - 14, CELL_SIZE - 14, 6);
      entities.lineStyle(2, 0xe6fffe, 0.9);
      entities.strokeRoundedRect(item.position.x * CELL_SIZE + 7, item.position.y * CELL_SIZE + 7, CELL_SIZE - 14, CELL_SIZE - 14, 6);
    }

    const now = this.snapshot.timeMs;
    for (const player of this.snapshot.players) {
      const skin = findSkin(player.skinId);
      player.segments.forEach((segment, index) => {
        const x = segment.x * CELL_SIZE + 4;
        const y = segment.y * CELL_SIZE + 4;
        const w = CELL_SIZE - 6;
        const h = CELL_SIZE - 6;
        const fill = Phaser.Display.Color.HexStringToColor(index === 0 ? skin.accentColor : skin.primaryColor).color;
        const outline = Phaser.Display.Color.HexStringToColor(skin.outlineColor).color;

        entities.fillStyle(fill, player.alive ? 1 : 0.35);
        entities.fillRoundedRect(x, y, w, h, index === 0 ? 10 : 7);
        entities.lineStyle(index === 0 ? 3 : 2, outline, player.alive ? 0.95 : 0.4);
        entities.strokeRoundedRect(x, y, w, h, index === 0 ? 10 : 7);

        if (index === 0) {
          entities.fillStyle(0x06121f, 0.85);
          entities.fillCircle(x + w * 0.35, y + h * 0.4, 2.4);
          entities.fillCircle(x + w * 0.65, y + h * 0.4, 2.4);
        }
      });

      if (player.invincibleUntil > now && player.segments[0]) {
        const head = player.segments[0];
        effects.lineStyle(3, 0xffffff, 0.9);
        effects.strokeCircle(head.x * CELL_SIZE + CELL_SIZE / 2, head.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE * 0.46);
      }
    }
  }
}
