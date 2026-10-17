import { defineWebModule } from "@aihot/web/modules";
import { IconGrid } from "@aihot/web/components/icons";

export default defineWebModule({
  name: "skills-market",
  sidebar: { section: "工具", items: [{ to: "/skills", label: "Skills 市场", icon: IconGrid }] },
  tools: [{ to: "/skills", label: "Skills 市场", icon: <IconGrid /> }],
  admin: { content: [{ to: "/admin/skills", label: "Skills 市场" }] },
});
