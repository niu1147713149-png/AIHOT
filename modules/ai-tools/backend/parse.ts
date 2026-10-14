import { load } from "cheerio";
import { leaderboardSchema } from "./schema.ts";

// React Router emits a JSON reference table inside enqueue("..."). Decode data only; never execute
// the page's scripts. Reject unfamiliar encodings so a layout change cannot silently replace the board.
export function parseLeaderboard(html: string) {
  const $ = load(html);
  const chunks = $("script").toArray().flatMap(s => [...($(s).html() ?? "").matchAll(/streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/g)].map(m => JSON.parse(m[1]) as string));
  const encoded: unknown = JSON.parse(chunks.join("").trim());
  if (!Array.isArray(encoded) || encoded.length > 50000) throw new Error("Invalid reference table");
  const table: unknown[] = encoded;
  const seen = new Set<number>();
  const memo = new Map<number, unknown>();
  function read(index: unknown, depth = 0): unknown {
    if (!Number.isInteger(index) || depth > 80) throw new Error("Invalid reference");
    const i = index as number;
    if (i === -5) return null;
    if (i === -1) return undefined;
    if (i < 0 || i >= table.length || seen.has(i)) throw new Error("Invalid or cyclic reference");
    if (memo.has(i)) return memo.get(i);
    const value = table[i];
    if (value === null || typeof value !== "object") return value;
    seen.add(i);
    let result: unknown;
    if (Array.isArray(value)) {
      if (typeof value[0] === "string") throw new Error("Unsupported reference encoding");
      result = value.map(v => read(v, depth + 1));
    } else {
      const record: Record<string, unknown> = Object.create(null);
      for (const [key, ref] of Object.entries(value)) {
        if (!/^_\d+$/.test(key)) throw new Error("Invalid reference key");
        const name = read(Number(key.slice(1)), depth + 1);
        if (typeof name !== "string" || ["__proto__", "prototype", "constructor"].includes(name)) throw new Error("Unsafe reference key");
        record[name] = read(ref, depth + 1);
      }
      result = record;
    }
    seen.delete(i); memo.set(i, result); return result;
  }
  const decoded = read(0) as { loaderData?: Record<string, unknown> };
  return leaderboardSchema.parse(decoded?.loaderData?.["leaderboard-boards"]);
}
