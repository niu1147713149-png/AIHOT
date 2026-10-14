import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "ai-tools",
  pages: [
    { path: "leaderboard", file: "web/leaderboard.tsx", id: "model-leaderboard" },
    { path: "leaderboard/category/:category", file: "web/leaderboard.tsx", id: "model-leaderboard-category" },
    { path: "leaderboard/rules", file: "web/rules.tsx", id: "model-leaderboard-rules" },
    { path: "leaderboard/:slug", file: "web/model.tsx", id: "model-detail" },
    { path: "codex-reset", file: "web/resets.tsx", id: "tibo-resets" },
    { path: "codex-reset/history/:date", file: "web/resets.tsx", id: "tibo-reset-history" },
  ],
  apiPaths: [/^\/api\/site\/ai-tools\/(leaderboard|codex-reset)$/, /^\/model-providers\/[^/]+$/, /^\/ai-tools-assets\/tibo\.jpg$/],
});
