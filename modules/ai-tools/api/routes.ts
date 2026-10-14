import type { FastifyInstance } from "fastify";
import { fileURLToPath } from "node:url";
import { sendFile } from "../../../apps/api/src/routes/static.ts";
import { PROVIDER_ICONS } from "../brands.ts";
import { readReferenceSnapshot } from "@aihot/backend/publication/reference-snapshots";
import type { Leaderboard, Resets, ResetResponse } from "../contracts.ts";
import { mergeResets } from "../data.ts";

export function registerTools(app: FastifyInstance) {
  const icons = new Set(Object.values(PROVIDER_ICONS));
  app.get("/ai-tools-assets/tibo.jpg", (req, reply) => sendFile(req, reply,
    fileURLToPath(new URL("../assets/tibo.jpg", import.meta.url)), { cacheControl: "public, max-age=86400" }));
  app.get<{ Params: { file: string } }>("/model-providers/:file", (req, reply) => {
    if (!icons.has(req.params.file)) return reply.code(404).send();
    return sendFile(req, reply, fileURLToPath(new URL(`../assets/model-providers/${req.params.file}`, import.meta.url)), { cacheControl: "public, max-age=86400" });
  });
  app.get("/api/site/ai-tools/leaderboard", async (_req, reply) => {
    const result = await readReferenceSnapshot<Leaderboard>("ai-tools.leaderboard", "https://aihot.news/leaderboard");
    return reply.header("Cache-Control", "private, no-store").send(result);
  });
  app.get("/api/site/ai-tools/codex-reset", async (_req, reply) => {
    const [history, recent] = await Promise.all([
      readReferenceSnapshot<Resets>("ai-tools.reset-history", "https://aihot.news/api/v1/codex-resets"),
      readReferenceSnapshot<Resets>("ai-tools.reset-recent", "https://aihot.news/api/v1/codex-resets/recent"),
    ]);
    // A newer complete refresh must not be overwritten by an older recent response.
    const useRecent = !!recent.data && (!history.data?.checkedAt || Date.parse(recent.data.checkedAt ?? recent.checkedAt ?? "") >= Date.parse(history.data.checkedAt));
    const current = useRecent ? recent : history;
    const result: ResetResponse = { ...current, data: useRecent ? mergeResets(history.data, recent.data) : history.data,
      error: recent.error ?? history.error, historyCheckedAt: history.checkedAt, historyError: history.error };
    if ((!recent.data && recent.error) || (!history.data && history.error)) result.data = null;
    return reply.header("Cache-Control", "private, no-store").send(result);
  });
}
