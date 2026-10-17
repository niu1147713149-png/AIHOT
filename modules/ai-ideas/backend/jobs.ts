import { beijingDate } from "@aihot/contracts/time";
import { config } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { audit, Conflict } from "@aihot/backend/audit";
import { defineQueue } from "@aihot/backend/modules";
import { enqueueOn, ensureQueue } from "@aihot/backend/jobs/queue";
import { generateIdeas } from "./generate.ts";
import { dateSchema } from "./schema.ts";

export const ideasQueue = defineQueue<{ date: string }>({
  name: "ai-ideas.generate", options: { policy: "exclusive", retryLimit: 1, retryDelay: 60, expireInSeconds: 600 },
  worker: { batchSize: 1, localConcurrency: 1 },
  run: async jobs => { for (const job of jobs) await generateIdeas(job.date); },
});
export function ideasScheduleEnabled() { return config.modelCallsEnabled && process.env.AI_IDEAS_DAILY_ENABLED === "true"; }
export async function queueIdeas(input: string, actor: string, reason: string) {
  const date = dateSchema.parse(input);
  if (!config.modelCallsEnabled) throw new Conflict("模型调用未开启；启用后可提交生成任务。");
  await ensureQueue(ideasQueue.name, ideasQueue.options);
  return sql.begin(async tx => {
    const id = await enqueueOn(ideasQueue, { date }, { singletonKey: date }, tx);
    if (!id) return { queued: false, date };
    await tx`INSERT INTO ai_idea_editions (date, status) VALUES (${date}, 'queued')
      ON CONFLICT (date) DO UPDATE SET status = 'queued', error = NULL, updated_at = now()`;
    await audit(actor, "ideas.generate", `ideas:${date}`, reason, null, { jobId: id, date }, { db: tx });
    return { queued: true, date };
  });
}
export async function scheduleIdeas() {
  if (!ideasScheduleEnabled()) return { skipped: true };
  return queueIdeas(beijingDate(new Date()), "system:ai-ideas", "创意集市每日生成");
}
