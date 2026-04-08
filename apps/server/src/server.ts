import { createServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents, SocketData } from "./protocol.js";
import { RoomManager } from "./rooms/room-manager.js";

export interface SnakeServerOptions {
  port?: number;
  host?: string;
}

export function createSnakeServer(options: SnakeServerOptions = {}) {
  const port = options.port ?? Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = options.host ?? process.env.HOST ?? "0.0.0.0";
  const httpServer = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Snake room server running");
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>(httpServer, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  const rooms = new RoomManager(io);

  io.on("connection", (socket) => {
    socket.on("room:create", (payload, ack) => {
      const result = rooms.createRoom({ socket, now: Date.now() }, payload);
      if (ack) {
        ack(result);
      }
      if ("code" in result) {
        socket.emit("server:error", result);
      } else {
        socket.emit("room:created", result);
      }
    });

    socket.on("room:join", (payload, ack) => {
      const result = rooms.joinRoom({ socket, now: Date.now() }, payload);
      if (ack) {
        ack(result);
      }
      if ("code" in result) {
        socket.emit("server:error", result);
      } else {
        socket.emit("room:joined", result);
      }
    });

    socket.on("room:ready", (payload) => {
      rooms.ready({ socket, now: Date.now() }, payload);
    });

    socket.on("room:leave", (payload) => {
      rooms.leave({ socket, now: Date.now() }, payload);
      socket.leave(payload.roomId);
    });

    socket.on("match:start", (payload) => {
      rooms.startMatch({ socket, now: Date.now() }, payload);
    });

    socket.on("input:direction", (payload) => {
      rooms.direction({ socket, now: Date.now() }, payload);
    });

    socket.on("disconnect", () => {
      rooms.disconnect(socket);
    });
  });

  return {
    httpServer,
    io,
    rooms,
    host,
    port,
    async listen(): Promise<void> {
      await new Promise<void>((resolve) => {
        httpServer.listen(port, host, () => resolve());
      });
    },
    async close(): Promise<void> {
      rooms.stop();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      io.close();
    }
  };
}
