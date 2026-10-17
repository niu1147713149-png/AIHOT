import { z } from "zod";
import { beijingDate, isValidDate } from "@aihot/contracts/time";

export const dateSchema = z.string().refine(isValidDate, "请输入有效日期").refine(d => d <= beijingDate(new Date()), "不能生成未来日期的点子");
const text = (max: number) => z.string().trim().min(2).max(max);
export const ideaSchema = z.object({
  title: text(70), category: z.enum(["tool", "content", "automation"]),
  audience: text(180), problem: text(240), proposal: text(360), whyNow: text(360), firstStep: text(240),
  validation: z.array(text(240)).min(2).max(4), successSignal: text(220), stopSignal: text(220),
  effort: text(220), monetization: text(240), uncertainties: z.array(text(240)).min(1).max(8),
  sourceIds: z.array(z.string().min(1).max(100)).min(1).max(3),
});
export function responseSchema(allowedIds: string[]) {
  const allowed = new Set(allowedIds);
  return z.object({ ideas: z.array(ideaSchema).max(5) }).superRefine(({ ideas }, ctx) => {
    const titles = new Set<string>();
    for (const [n, idea] of ideas.entries()) {
      if (titles.has(idea.title)) ctx.addIssue({ code: "custom", message: "Duplicate idea", path: ["ideas", n, "title"] });
      titles.add(idea.title);
      if (new Set(idea.sourceIds).size !== idea.sourceIds.length || idea.sourceIds.some(id => !allowed.has(id)))
        ctx.addIssue({ code: "custom", message: "Citations must reference provided news", path: ["ideas", n, "sourceIds"] });
    }
  });
}
