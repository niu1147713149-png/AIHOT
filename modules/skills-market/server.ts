import type { ServerModule } from "@aihot/backend/modules";
import { registerSkills } from "./api/routes.ts";
import { syncEnabled, syncSkills } from "./backend/sync.ts";

export default {
  name: "skills-market", http: registerSkills,
  schedules: [{ name: "skills-market.github", cron: "23 3 * * *", when: syncEnabled, run: syncSkills }],
} satisfies ServerModule;
