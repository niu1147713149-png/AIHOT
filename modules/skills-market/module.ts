import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "skills-market",
  pages: [
    { path: "skills", file: "web/list.tsx", id: "skills-market" },
    { path: "skills/rules", file: "web/rules.tsx", id: "skills-market-rules" },
    { path: "skills/:id", file: "web/detail.tsx", id: "skill-detail" },
  ],
  adminPages: [
    { path: "admin/skills", file: "web/admin-list.tsx", id: "admin-skills" },
    { path: "admin/skills/:id", file: "web/admin-detail.tsx", id: "admin-skill-detail" },
  ],
  apiPaths: [/^\/api\/site\/skills(?:\/[^/]+)?$/, /^\/api\/admin\/skills(?:\/[^/]+)?$/],
});
