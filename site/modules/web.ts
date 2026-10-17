// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import aiTools from "@aihot/ai-tools/web";
import skillsMarket from "@aihot/skills-market/web";
import aiIdeas from "@aihot/ai-ideas/web";

export const WEB_MODULES: readonly WebModule[] = [aiIdeas, aiTools, skillsMarket];
