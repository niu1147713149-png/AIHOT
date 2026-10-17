import type { ServerModule } from "@aihot/backend/modules";
import { registerIdeas } from "./api/routes.ts";
import { ideasQueue, ideasScheduleEnabled, scheduleIdeas } from "./backend/jobs.ts";

export default {
  name: "ai-ideas", http: registerIdeas,
  models: { ideas: { label: "创意集市", env: "IDEAS_MODEL", purposes: ["ai_ideas"] } },
  queues: [ideasQueue],
  schedules: [{ name: "ai-ideas.daily", cron: "30 21 * * *", when: ideasScheduleEnabled, run: scheduleIdeas, missed: "skip" }],
} satisfies ServerModule;
