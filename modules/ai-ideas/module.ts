import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "ai-ideas",
  pages: [{ path: "ideas", file: "web/ideas.tsx", id: "ai-ideas" }],
  adminPages: [{ path: "admin/ideas", file: "web/admin.tsx", id: "admin-ai-ideas" }],
  apiPaths: [/^\/api\/site\/ideas$/, /^\/api\/admin\/ideas(?:\/generate)?$/],
});
