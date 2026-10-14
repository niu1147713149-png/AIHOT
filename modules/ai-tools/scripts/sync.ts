import { closeDb } from "@aihot/backend/db";
import { syncLeaderboard, syncResets } from "../backend/sync.ts";

try {
  console.log(JSON.stringify({ leaderboard: await syncLeaderboard(), resets: await syncResets() }));
} finally { await closeDb(); }
