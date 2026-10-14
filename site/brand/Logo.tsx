// AIVANE 的风向标与字标。size 是整体高度，字形转为路径以保持各设备上的品牌外观。
import { SITE } from "../site.ts";
import { TAIL_PATH, VANE_PATH, WORDMARK_PATH } from "./artwork.ts";

export function Wordmark({ size = 24, className = "", title = SITE.name }: { size?: number; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 332 64" width={size * 332 / 64} height={size} className={`shrink-0 ${className}`} aria-label={title} role="img" focusable="false">
      <rect width="64" height="64" rx="14" fill="#102824" />
      <path d={VANE_PATH} fill="#59e2bb" />
      <path d={TAIL_PATH} fill="#a6f3da" />
      <circle cx="17.3" cy="20" r="3" fill="#a6f3da" />
      <path d={WORDMARK_PATH} fill="currentColor" />
    </svg>
  );
}

/** The compact brand mark; the existing RingMark name keeps loader call sites stable. */
export function RingMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g fill="currentColor" style={spinning ? { transformOrigin: "32px 32px", animation: "spin-slow 1.1s linear infinite" } : undefined}>
        <path d={VANE_PATH} />
        <path d={TAIL_PATH} />
        <circle cx="17.3" cy="20" r="3" />
      </g>
    </svg>
  );
}
