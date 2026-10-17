import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { actorOf } from "@aihot/backend/admin/auth";
import { readSkill, readSkills } from "@aihot/backend/publication/skills";
import { adminHandler } from "../../../apps/api/src/routes/admin-auth.ts";
import { filterSchema, reasonSchema } from "../backend/schema.ts";
import { editSkill, importSkills, listAdminSkills, previewImport, readAdminSkill } from "../backend/catalog.ts";

export function registerSkills(app: FastifyInstance) {
  app.get("/api/site/skills", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const filter = filterSchema.safeParse(req.query);
    if (!filter.success) return reply.code(400).send({ detail: "筛选参数无效" });
    return readSkills(filter.data);
  });
  app.get<{ Params: { id: string } }>("/api/site/skills/:id", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const result = await readSkill(req.params.id);
    return result ?? reply.code(404).send({ detail: "条目不存在或已下架" });
  });
  app.get("/api/admin/skills", adminHandler(async () => ({ items: await listAdminSkills() })));
  app.get("/api/admin/skills/seed", adminHandler(async () => JSON.parse(await readFile(new URL("../data/seed.json", import.meta.url), "utf8"))));
  app.get("/api/admin/skills/:id", adminHandler(async (req, reply) => {
    const item = await readAdminSkill((req.params as { id: string }).id);
    return item ?? reply.code(404).send({ detail: "条目不存在" });
  }));
  app.post("/api/admin/skills/preview", adminHandler(async req => previewImport(req.body)));
  app.post("/api/admin/skills/import", adminHandler(async (req, _reply, admin) => {
    const body = z.object({ entries: z.unknown(), digest: z.string().length(64), reason: reasonSchema }).strict().parse(req.body);
    return importSkills(body.entries, body.digest, actorOf(admin), body.reason);
  }));
  app.patch("/api/admin/skills/:id", adminHandler(async (req, _reply, admin) => editSkill((req.params as { id: string }).id, req.body, actorOf(admin))));
}
