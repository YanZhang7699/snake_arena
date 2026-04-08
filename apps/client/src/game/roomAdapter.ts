import type { RoomState } from "@snake/shared";
import type { SimulationSnapshot } from "./types";

export function roomStateToSnapshot(room: RoomState): SimulationSnapshot {
  const now = Date.now();
  const status = room.status === "countdown" ? "countdown" : room.status === "result" ? "result" : "playing";
  const fallbackResults = [...room.players]
    .map((player) => ({
      playerId: player.playerId,
      name: player.name,
      skinId: player.skinId,
      score: player.score,
      eliminations: player.eliminations,
      maxLength: player.segments.length,
      survivedMs: 0,
      rank: 0
    }))
    .sort((a, b) => b.score - a.score || b.eliminations - a.eliminations || b.maxLength - a.maxLength || a.name.localeCompare(b.name))
    .map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
  const results = room.resultEntries && room.resultEntries.length > 0 ? room.resultEntries : fallbackResults;

  return {
    timeMs: now,
    tick: 0,
    status,
    countdownRemainingMs: room.countdownRemainingMs,
    remainingMs: room.endsAt > now ? room.endsAt - now : 0,
    players: room.players,
    food: room.food,
    items: room.items,
    resultEntries: results,
    winnerId: room.winnerId ?? results[0]?.playerId,
    note: status === "result" ? "Match complete" : room.status === "countdown" ? "Preparing match" : "Live room"
  };
}
