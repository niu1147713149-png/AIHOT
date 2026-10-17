import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { closeDb } from "@aihot/backend/db";
import { importSkills, previewImport } from "../backend/catalog.ts";

try {
  const file = process.argv.find(a => a.startsWith("--file="))?.slice(7);
  const entries = JSON.parse(await readFile(file ? resolve(file) : new URL("../data/seed.json", import.meta.url), "utf8"));
  const preview = await previewImport(entries);
  console.log(JSON.stringify({ added: preview.added, skipped: preview.skipped, digest: preview.digest }));
  if (process.argv.includes("--apply")) console.log(await importSkills(entries, preview.digest, "script:skills-import", "导入已核验的 Skills 目录"));
  else console.log("预览完成；加 --apply 确认新增，重复来源保持不变。");
} finally { await closeDb(); }
