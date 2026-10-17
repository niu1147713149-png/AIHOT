import type { SkillClient } from "@aihot/contracts/skills";

// Only these portable tokens may enter a shell command. Never copy commands from a README.
export const REPO = /^[A-Za-z0-9][A-Za-z0-9-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
export const NAME = /^[a-z0-9][a-z0-9-]{0,99}$/;
export function installCommand(repo: string, name: string, client: SkillClient, scope: "project" | "global") {
  if (repo !== repo.trim() || name !== name.trim() || !REPO.test(repo) || !NAME.test(name) || !["codex", "claude-code"].includes(client) || !["project", "global"].includes(scope))
    throw new Error("安装参数无效");
  return `npx skills add https://github.com/${repo} --skill ${name} --agent ${client}${scope === "global" ? " --global" : ""}`;
}
export function sourceUrl(repo: string, path: string, commit: string) {
  return `https://github.com/${repo}/blob/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
