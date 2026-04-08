import { createSnakeServer } from "./server.js";

const server = createSnakeServer();

await server.listen();

console.log(`Snake room server listening on http://${server.host}:${server.port}`);
