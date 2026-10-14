import type { ServerModule } from "@aihot/backend/modules";
import { registerTools } from "./api/routes.ts";
import { syncEnabled, syncLeaderboard, syncResets } from "./backend/sync.ts";

export default {
  name: "ai-tools",
  http: registerTools,
  schedules: [
    { name: "ai-tools.leaderboard", cron: "7 * * * *", when: syncEnabled, run: syncLeaderboard },
    { name: "ai-tools.codex-reset", cron: "*/10 * * * *", when: syncEnabled, run: syncResets },
  ],
} satisfies ServerModule;
