# Snake Arena

Licensed under the **MIT License**. See [LICENSE](./LICENSE).

A TypeScript monorepo for a modern multiplayer Snake game with:

- **Solo** play
- **Local couch multiplayer** for 2–4 players
- **Online rooms** over Socket.IO
- **Competitive** and **party** modes
- **Phaser** rendering in the browser
- A lightweight **Node/Express + Socket.IO** game server

## Project structure

```text
apps/
  client/   Phaser + Vite frontend
  server/   Node + Socket.IO room server
packages/
  shared/   Shared game and protocol types
```

## Tech stack

- TypeScript
- Vite
- Phaser 3
- Socket.IO
- Node.js
- npm workspaces

## Getting started

### 1) Install dependencies

```bash
npm install
```

### 2) Start the server

```bash
npm run dev:server
```

This starts the room server on `http://localhost:3000` by default.

### 3) Start the client

Open a second terminal and run:

```bash
npm run dev:client
```

Then open the local Vite URL shown in the terminal.

## Build

```bash
npm run build
```

## Type-check

```bash
npm run typecheck
```

## How to play

### Solo

1. Launch the client.
2. Choose **Competitive** or **Party** mode.
3. Pick a difficulty and skin.
4. Click **Start Solo**.

### Local multiplayer

1. Set **Local players** to 2, 3, or 4.
2. Click **Start Local**.
3. Controls by player:
   - Player 1: Arrow keys
   - Player 2: `W A S D`
   - Player 3: `I J K L`
   - Player 4: `T F G H`

### Online rooms

1. Start the server.
2. In the client, leave the server URL as `http://localhost:3000` or change it.
3. Click **Create Online Room** on one machine/tab.
4. Share the room code.
5. Other players enter the code and click **Join**.
6. Ready up and start the match.

## Game modes

### Competitive

- Classic elimination-focused Snake
- Last surviving snake or best score wins

### Party

- Adds temporary item effects such as boost, slow, shield, bonus, and warp
- More chaotic multiplayer rounds

## Notes

- The client and server use separate simulation paths today: local play runs a client-side simulation, while online play mirrors server room state.
- Production client builds are currently large because Phaser is bundled into a big chunk.

## Scripts

At the repo root:

```bash
npm run dev:client
npm run dev:server
npm run build
npm run typecheck
```

## License

This project is licensed under the **MIT License**.

See [LICENSE](./LICENSE) for the full text.
