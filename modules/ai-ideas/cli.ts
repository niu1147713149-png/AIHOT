// One bounded worker task, without starting the site's collection/translation queues.
import { installModules } from "@aihot/backend/modules";
import { closeDb } from "@aihot/backend/db";
import { beijingDate } from "@aihot/contracts/time";
import module from "./server.ts";
import { generateIdeas } from "./backend/generate.ts";

installModules([module]);
try { console.log(JSON.stringify(await generateIdeas(process.argv[2] ?? beijingDate(new Date())))); }
catch { console.error("创意集市生成未完成，请在后台查看状态和模型回执。"); process.exitCode = 1; }
finally { await closeDb(); }
