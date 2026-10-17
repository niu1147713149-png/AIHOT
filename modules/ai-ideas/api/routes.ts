import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { beijingDate } from "@aihot/contracts/time";
import { config } from "@aihot/backend/config";
import { sql } from "@aihot/backend/db";
import { actorOf } from "@aihot/backend/admin/auth";
import { readIdeas } from "@aihot/backend/publication/ideas";
import { adminHandler } from "../../../apps/api/src/routes/admin-auth.ts";
import { dateSchema } from "../backend/schema.ts";
import { ideasScheduleEnabled, queueIdeas } from "../backend/jobs.ts";

const querySchema = z.object({ date: dateSchema.optional() });
export function registerIdeas(app: FastifyInstance) {
  app.get("/api/site/ideas", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const query = querySchema.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ detail: "请输入有效日期，且不能晚于今天。" });
    return readIdeas(query.data.date ?? beijingDate(new Date()));
  });
  app.get("/api/admin/ideas", adminHandler(async req => {
    const date = querySchema.parse(req.query).date ?? beijingDate(new Date());
    const [edition, rows] = await Promise.all([readIdeas(date), sql`SELECT error FROM ai_idea_editions WHERE date = ${date}`]);
    return { edition, modelCallsEnabled: config.modelCallsEnabled, scheduleEnabled: ideasScheduleEnabled(), error: rows[0]?.error ?? null };
  }));
  app.post("/api/admin/ideas/generate", adminHandler(async (req, reply, admin) => {
    const body = z.object({ date: dateSchema, reason: z.string().trim().min(2).max(300) }).strict().parse(req.body);
    const result = await queueIdeas(body.date, actorOf(admin), body.reason);
    return reply.code(202).send(result);
  }));
}
