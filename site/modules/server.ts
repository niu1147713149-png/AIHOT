// The backend of the site's modules, installed by the api and the worker when they start (site/modules/index.ts).
import type { ServerModule } from "@aihot/backend/modules";
import aiTools from "@aihot/ai-tools/server";
import skillsMarket from "@aihot/skills-market/server";
import aiIdeas from "@aihot/ai-ideas/server";

export const SERVER_MODULES: readonly ServerModule[] = [aiIdeas, aiTools, skillsMarket];
