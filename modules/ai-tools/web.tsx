import { defineWebModule } from "@aihot/web/modules";
import { IconChart, IconClock } from "@aihot/web/components/icons";

export default defineWebModule({
  name: "ai-tools",
  sidebar: { section: "工具", items: [
    { to: "/leaderboard", label: "模型榜", icon: IconChart },
    { to: "/codex-reset", label: "Tibo 重置监控", icon: IconClock },
  ] },
  tabs: [{ key: "models", to: "/leaderboard", label: "模型榜", icon: IconChart }],
  tools: [
    { to: "/leaderboard", label: "模型榜", icon: <IconChart /> },
    { to: "/codex-reset", label: "Tibo 重置监控", icon: <IconClock /> },
  ],
});
