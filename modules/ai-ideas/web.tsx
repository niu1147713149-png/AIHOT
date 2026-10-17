import { defineWebModule } from "@aihot/web/modules";
import { IconSparkles } from "@aihot/web/components/icons";

export default defineWebModule({
  name: "ai-ideas",
  sidebar: { section: "内容", items: [{ to: "/ideas", label: "创意集市", icon: IconSparkles }] },
  tools: [{ to: "/ideas", label: "创意集市", icon: <IconSparkles /> }],
  admin: { content: [{ to: "/admin/ideas", label: "创意集市" }] },
});
