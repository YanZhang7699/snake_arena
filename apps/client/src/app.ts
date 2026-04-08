import Phaser from "phaser";
import type { Difficulty, GameMode, PlayType, RoomState } from "@snake/shared";
import { AUDIO_CONFIG, BOARD, DIFFICULTY_PRESETS, SKINS } from "./config/gameConfig";
import { BoardScene } from "./game/boardScene";
import { roomStateToSnapshot } from "./game/roomAdapter";
import { createRuntime } from "./game/runtime";
import type { ControlBindings, MatchSetup, RuntimeHandle, SimulationSnapshot } from "./game/types";
import { OnlineClient } from "./net/onlineClient";
import { SynthAudio } from "./audio/synthAudio";

type Screen = "menu" | "lobby" | "game";

interface PlayerDraft {
  playerId: string;
  name: string;
  skinId: string;
  color: string;
  controls: ControlBindings;
  slot: number;
  isHuman: boolean;
}

interface ModeSelection {
  playType: PlayType;
  mode: GameMode;
  difficulty: Difficulty;
  localPlayers: number;
  roomCode: string;
  serverUrl: string;
  playerName: string;
  skinId: string;
}

const DEFAULT_BINDINGS: ControlBindings[] = [
  { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" },
  { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" },
  { up: "KeyI", down: "KeyK", left: "KeyJ", right: "KeyL" },
  { up: "KeyT", down: "KeyG", left: "KeyF", right: "KeyH" }
];

const PLAYER_COLORS = ["#68d391", "#f97316", "#60a5fa", "#c084fc"];

export function startApp(root: HTMLElement): void {
  const shell = document.createElement("div");
  shell.className = "shell";

  const canvasHost = document.createElement("div");
  canvasHost.className = "screen";
  shell.append(canvasHost);

  const overlay = document.createElement("div");
  overlay.className = "hud-root";
  shell.append(overlay);

  root.append(shell);

  const audio = new SynthAudio();
  const boardScene = new BoardScene();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: canvasHost,
    backgroundColor: "#09111f",
    width: 728,
    height: 520,
    scene: [boardScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    }
  });

  const selection: ModeSelection = {
    playType: "solo",
    mode: "competitive",
    difficulty: "normal",
    localPlayers: 2,
    roomCode: "",
    serverUrl: "http://localhost:3000",
    playerName: "Player 1",
    skinId: SKINS[0].id
  };

  let screen: Screen = "menu";
  let runtime: RuntimeHandle | undefined;
  let onlineClient: OnlineClient | undefined;
  let roomState: RoomState | undefined;
  let snapshot: SimulationSnapshot | undefined;
  let rafId = 0;
  let lastFrame = performance.now();
  let sequence = 1;
  let activePlayerId = "player-1";

  const settings = loadAudioSettings();
  audio.setVolume(settings.master, settings.music, settings.sfx);
  audio.playMusic("menu");

  const unsubs: Array<() => void> = [];

  function cleanupSession(): void {
    runtime?.dispose();
    runtime = undefined;
    onlineClient?.disconnect();
    onlineClient = undefined;
    roomState = undefined;
    snapshot = undefined;
    unsubs.splice(0).forEach((off) => off());
  }

  function syncSnapshot(nextSnapshot: SimulationSnapshot): void {
    snapshot = nextSnapshot;
    boardScene.setSnapshot(nextSnapshot);
    renderOverlay();
    syncMusic();
  }

  function syncMusic(): void {
    if (screen === "menu" || screen === "lobby") {
      audio.playMusic("menu");
      return;
    }
    if (!snapshot) {
      audio.playMusic("menu");
      return;
    }
    if (snapshot.status === "result") {
      audio.playMusic("result");
      return;
    }
    const key =
      selection.playType === "solo"
        ? selection.mode === "competitive"
          ? "soloCompetitive"
          : "soloParty"
        : selection.mode === "competitive"
          ? "multiCompetitive"
          : "multiParty";
    audio.playMusic(key);
  }

  function attachRuntime(nextRuntime: RuntimeHandle): void {
    cleanupSession();
    runtime = nextRuntime;
    unsubs.push(
      nextRuntime.onSnapshot((value) => syncSnapshot(value)),
      nextRuntime.onResult((value) => {
        syncSnapshot(value);
        audio.playSfx("victory");
      })
    );
    syncSnapshot(nextRuntime.snapshot);
  }

  function buildPlayers(count: number): PlayerDraft[] {
    return Array.from({ length: count }, (_, index) => ({
      playerId: `player-${index + 1}`,
      name: index === 0 ? selection.playerName : `Player ${index + 1}`,
      skinId: SKINS[index % SKINS.length].id,
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
      controls: DEFAULT_BINDINGS[index % DEFAULT_BINDINGS.length],
      slot: index,
      isHuman: true
    }));
  }

  function beginLocalSession(playType: Exclude<PlayType, "online">): void {
    selection.playType = playType;
    const players = buildPlayers(playType === "solo" ? 1 : selection.localPlayers);
    activePlayerId = players[0].playerId;
    players[0].skinId = selection.skinId;

    const setup: MatchSetup = {
      board: BOARD,
      config: {
        mode: selection.mode,
        playType,
        difficulty: selection.difficulty,
        maxPlayers: players.length,
        isOnline: false,
        mapId: "default",
        timeLimitSec: DIFFICULTY_PRESETS[selection.difficulty].roundTimeSec
      },
      seed: Date.now(),
      players,
      roomId: playType === "solo" ? "solo-room" : "local-room",
      roomName: playType === "solo" ? "Solo" : "Local Arena"
    };

    attachRuntime(createRuntime(setup));
    screen = "game";
    renderOverlay();
    syncMusic();
  }

  function attachOnlineClient(client: OnlineClient): void {
    cleanupSession();
    onlineClient = client;
    screen = "lobby";
    unsubs.push(
      client.on("room", (room) => {
        roomState = room;
        if (room.players[0]) {
          activePlayerId = room.players[0].playerId;
        }
        if (room.status === "countdown" || room.status === "in_game" || room.status === "result") {
          screen = "game";
          syncSnapshot(roomStateToSnapshot(room));
        } else {
          renderOverlay();
        }
      }),
      client.on("snapshot", (room) => {
        roomState = room;
        screen = "game";
        syncSnapshot(roomStateToSnapshot(room));
      }),
      client.on("error", (payload) => {
        alert(payload.message);
      }),
      client.on("connected", () => {
        renderOverlay();
      })
    );
  }

  async function createOnlineRoom(): Promise<void> {
    selection.playType = "online";
    const client = new OnlineClient();
    attachOnlineClient(client);
    await client.connect(selection.serverUrl);
    await client.createRoom({
      name: selection.playerName,
      skinId: selection.skinId,
      mode: selection.mode,
      playType: "online",
      difficulty: selection.difficulty,
      maxPlayers: 4,
      timeLimitSec: DIFFICULTY_PRESETS[selection.difficulty].roundTimeSec
    });
    renderOverlay();
    syncMusic();
  }

  async function joinOnlineRoom(): Promise<void> {
    if (!selection.roomCode.trim()) {
      return;
    }
    selection.playType = "online";
    const client = new OnlineClient();
    attachOnlineClient(client);
    await client.connect(selection.serverUrl);
    await client.joinRoom({
      roomId: selection.roomCode.trim().toUpperCase(),
      name: selection.playerName,
      skinId: selection.skinId
    });
    renderOverlay();
    syncMusic();
  }

  function renderMenu(): string {
    const difficultyCards = Object.values(DIFFICULTY_PRESETS)
      .map(
        (preset) => `
          <button class="card ${selection.difficulty === preset.id ? "active" : ""}" data-action="difficulty" data-value="${preset.id}">
            <strong>${preset.label}</strong>
            <div>${preset.moveIntervalMs} ms step</div>
            <div>${preset.roundTimeSec}s round</div>
          </button>
        `
      )
      .join("");

    const skinCards = SKINS.map(
      (skin) => `
        <button class="card ${selection.skinId === skin.id ? "active" : ""}" data-action="skin" data-value="${skin.id}">
          <strong>${skin.name}</strong>
          <div class="row"><span class="chip">${skin.headStyle}</span><span class="chip">${skin.trailEffect}</span></div>
        </button>
      `
    ).join("");

    return `
      <div class="screen">
        <div class="panel menu-grid">
          <section class="menu-hero stack">
            <div class="chip">Single player, local versus, online rooms</div>
            <h1 class="hero-title">Snake Arena</h1>
            <p class="hero-copy">
              Competitive mode supports solo and multiplayer across three difficulty levels. Party mode also supports solo and multiplayer with power-ups, synth background music, skins, and a 3-second spawn shield.
            </p>
            <div class="row">
              <button class="primary" data-action="start-solo">Start Solo</button>
              <button data-action="start-local">Start Local</button>
              <button data-action="create-online">Create Online Room</button>
            </div>
          </section>
          <section class="stack">
            <div class="menu-controls stack">
              <div class="field">
                <label>Player name</label>
                <input data-input="name" value="${selection.playerName}" maxlength="16" />
              </div>
              <div class="field">
                <label>Server URL</label>
                <input data-input="serverUrl" value="${selection.serverUrl}" />
              </div>
              <div class="field">
                <label>Join room code</label>
                <div class="row">
                  <input data-input="roomCode" value="${selection.roomCode}" maxlength="8" />
                  <button data-action="join-online">Join</button>
                </div>
              </div>
              <div class="field">
                <label>Mode</label>
                <div class="row">
                  <button class="${selection.mode === "competitive" ? "primary" : ""}" data-action="mode" data-value="competitive">Competitive</button>
                  <button class="${selection.mode === "party" ? "primary" : ""}" data-action="mode" data-value="party">Party</button>
                </div>
              </div>
              <div class="field">
                <label>Play type</label>
                <div class="row">
                  <button class="${selection.playType === "solo" ? "primary" : ""}" data-action="playType" data-value="solo">Solo</button>
                  <button class="${selection.playType === "local" ? "primary" : ""}" data-action="playType" data-value="local">Local</button>
                  <button class="${selection.playType === "online" ? "primary" : ""}" data-action="playType" data-value="online">Online</button>
                </div>
              </div>
              <div class="field">
                <label>Local players</label>
                <select data-input="localPlayers">
                  ${[2, 3, 4]
                    .map((count) => `<option value="${count}" ${selection.localPlayers === count ? "selected" : ""}>${count} players</option>`)
                    .join("")}
                </select>
              </div>
              <div class="field">
                <label>Audio</label>
                <div class="row">
                  <button data-action="audio" data-value="menu">Menu BGM</button>
                  <button data-action="audio" data-value="stop">Mute Music</button>
                </div>
              </div>
            </div>
            <div class="menu-list stack">
              <h3>Difficulty</h3>
              <div class="card-grid">${difficultyCards}</div>
            </div>
            <div class="menu-list stack">
              <h3>Skins</h3>
              <div class="card-grid">${skinCards}</div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderLobby(): string {
    const players = roomState?.players ?? [];
    return `
      <div class="screen">
        <div class="panel menu-grid">
          <section class="menu-hero stack">
            <div class="chip">Room ${roomState?.roomId ?? "Connecting"}</div>
            <h2 class="hero-title" style="font-size: clamp(1.8rem, 4vw, 3rem);">Online Lobby</h2>
            <p class="hero-copy">
              Share the room code, let players ready up, then start the countdown. Online rooms accept 1-4 players, so you can also launch solo.
            </p>
            <div class="row">
              <button class="primary" data-action="ready">Ready</button>
              <button data-action="start-match">Start Match</button>
              <button class="danger" data-action="back-menu">Back</button>
            </div>
          </section>
          <section class="stack">
            <div class="menu-controls stack">
              <div class="chip">Mode: ${selection.mode}</div>
              <div class="chip">Difficulty: ${selection.difficulty}</div>
              <div class="chip">Server: ${selection.serverUrl}</div>
            </div>
            <div class="menu-list stack">
              <h3>Players</h3>
              <div class="stack">
                ${players
                  .map(
                    (player) => `
                      <div class="card">
                        <strong>${player.name}</strong>
                        <div>${player.playerId === roomState?.hostId ? "Host" : "Guest"}</div>
                        <div>Skin: ${player.skinId}</div>
                        <div>${player.disconnected ? "Disconnected" : player.alive ? "Ready to race" : "Eliminated"}</div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function renderHud(snapshotValue: SimulationSnapshot): string {
    const scores = [...snapshotValue.players]
      .sort((a, b) => b.score - a.score || b.eliminations - a.eliminations)
      .map(
        (player) => `
          <div class="hud-score">
            <strong>${player.name}</strong>
            <div>${player.score} pts</div>
            <div>${player.segments.length} length</div>
            <div>${player.alive ? "Alive" : "Out"}</div>
          </div>
        `
      )
      .join("");

    const countdownText =
      snapshotValue.status === "countdown"
        ? `${Math.ceil(snapshotValue.countdownRemainingMs / 1000)}`
        : snapshotValue.status === "result"
          ? "Results"
          : "";

    const activePlayer = snapshotValue.players.find((player) => player.playerId === activePlayerId) ?? snapshotValue.players[0];
    const invincibleSeconds = activePlayer ? Math.max(0, Math.ceil((activePlayer.invincibleUntil - snapshotValue.timeMs) / 1000)) : 0;
    const resultMarkup =
      snapshotValue.status === "result"
        ? `
            <div class="overlay-center">
              <div class="panel menu-inline stack overlay-box" style="max-width: 520px;">
                <h3 style="margin: 0;">${snapshotValue.note}</h3>
                <div class="stack">
                  ${snapshotValue.resultEntries
                    .map(
                      (entry) => `
                        <div class="card">
                          <strong>#${entry.rank} ${entry.name}</strong>
                          <div>${entry.score} pts, ${entry.maxLength} max length, ${entry.eliminations} eliminations</div>
                        </div>
                      `
                    )
                    .join("")}
                </div>
                <div class="row">
                  <button class="primary" data-action="rematch">Rematch</button>
                  <button data-action="back-menu">Main Menu</button>
                </div>
              </div>
            </div>
          `
        : "";

    return `
      <div class="hud-top">
        <div class="hud-badge">${selection.playType} / ${selection.mode} / ${selection.difficulty}</div>
        <div class="hud-badge">Time ${Math.max(0, Math.ceil(snapshotValue.remainingMs / 1000))}s</div>
        <div class="hud-badge">Spawn Shield ${invincibleSeconds}s</div>
      </div>
      <div class="hud-scoreboard">${scores}</div>
      ${countdownText ? `<div class="overlay-center"><div class="hud-badge" style="font-size: 4rem; padding: 1rem 2rem;">${countdownText}</div></div>` : ""}
      ${resultMarkup}
    `;
  }

  function renderOverlay(): void {
    overlay.innerHTML = screen === "menu" ? renderMenu() : screen === "lobby" ? renderLobby() : snapshot ? renderHud(snapshot) : "";
  }

  overlay.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const actionElement = target.closest<HTMLElement>("[data-action]");
    if (!actionElement) {
      return;
    }
    const action = actionElement.dataset.action;
    const value = actionElement.dataset.value;
    if (!action) {
      return;
    }
    audio.unlock();
    audio.playSfx("uiClick");

    switch (action) {
      case "mode":
        selection.mode = value as GameMode;
        break;
      case "playType":
        selection.playType = value as PlayType;
        break;
      case "difficulty":
        selection.difficulty = value as Difficulty;
        break;
      case "skin":
        selection.skinId = value ?? selection.skinId;
        break;
      case "start-solo":
        beginLocalSession("solo");
        break;
      case "start-local":
        beginLocalSession("local");
        break;
      case "create-online":
        void createOnlineRoom();
        break;
      case "join-online":
        void joinOnlineRoom();
        break;
      case "ready":
        void onlineClient?.setReady(true);
        break;
      case "start-match":
        void onlineClient?.startMatch();
        break;
      case "back-menu":
        cleanupSession();
        screen = "menu";
        syncMusic();
        break;
      case "rematch":
        if (selection.playType === "online") {
          cleanupSession();
          void createOnlineRoom();
        } else {
          beginLocalSession(selection.playType === "local" ? "local" : "solo");
        }
        break;
      case "audio":
        if (value === "menu") {
          audio.playMusic("menu");
        } else if (value === "stop") {
          audio.stopMusic();
        }
        break;
      default:
        break;
    }
    renderOverlay();
  });

  overlay.addEventListener("input", (event) => {
    const inputElement = (event.target as HTMLElement).closest("[data-input]") as HTMLInputElement | HTMLSelectElement | null;
    if (!inputElement) {
      return;
    }
    const key = inputElement.dataset.input;
    if (!key) {
      return;
    }
    if (key === "name") {
      selection.playerName = inputElement.value.slice(0, 16);
    } else if (key === "serverUrl") {
      selection.serverUrl = inputElement.value;
    } else if (key === "roomCode") {
      selection.roomCode = inputElement.value.toUpperCase();
    } else if (key === "localPlayers") {
      selection.localPlayers = Number.parseInt(inputElement.value, 10);
    }
  });

  window.addEventListener("keydown", (event) => {
    audio.unlock();
    if (!snapshot || screen !== "game") {
      return;
    }

    if (selection.playType === "online") {
      const nextDirection = mapDirection(event.code, DEFAULT_BINDINGS[0]);
      if (nextDirection && activePlayerId) {
        onlineClient?.sendDirection(nextDirection, sequence++);
      }
      return;
    }

    const players = buildPlayers(selection.playType === "solo" ? 1 : selection.localPlayers);
    for (const player of players) {
      const nextDirection = mapDirection(event.code, player.controls);
      if (nextDirection) {
        runtime?.queueDirection(player.playerId, nextDirection);
      }
    }
  });

  function frame(now: number): void {
    const delta = now - lastFrame;
    lastFrame = now;
    runtime?.advance(delta);
    rafId = window.requestAnimationFrame(frame);
  }

  rafId = window.requestAnimationFrame(frame);
  renderOverlay();

  window.addEventListener("beforeunload", () => {
    cleanupSession();
    audio.dispose();
    game.destroy(true);
    window.cancelAnimationFrame(rafId);
  });
}

function mapDirection(code: string, controls: ControlBindings) {
  if (code === controls.up) {
    return "up" as const;
  }
  if (code === controls.down) {
    return "down" as const;
  }
  if (code === controls.left) {
    return "left" as const;
  }
  if (code === controls.right) {
    return "right" as const;
  }
  return undefined;
}

function loadAudioSettings() {
  try {
    const raw = localStorage.getItem("snake-arena-audio");
    if (!raw) {
      return AUDIO_CONFIG.volume;
    }
    return { ...AUDIO_CONFIG.volume, ...JSON.parse(raw) };
  } catch {
    return AUDIO_CONFIG.volume;
  }
}
