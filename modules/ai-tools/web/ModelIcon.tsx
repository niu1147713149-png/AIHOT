import { useState } from "react";
import { PROVIDER_ICONS } from "../brands";

export function ModelIcon({ provider, size = 32 }: { provider: string; size?: number }) {
  const file = Object.hasOwn(PROVIDER_ICONS, provider) ? PROVIDER_ICONS[provider] : undefined;
  const [failed, setFailed] = useState<string>();
  return <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center overflow-hidden border text-sm font-semibold ${provider === "Moonshot AI" ? "border-transparent bg-[#111] text-white" : "border-line bg-white text-[#202a30] dark:bg-white/95"}`}
    style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}>
    {file && file !== failed ? <img src={`/model-providers/${file}`} alt="" width={size} height={size} loading="lazy" decoding="async"
      onError={() => setFailed(file)} className={`object-contain ${provider === "Moonshot AI" ? "h-[66%] w-[66%]" : "h-[64%] w-[64%]"}`} /> : provider.slice(0, 1).toUpperCase()}
  </span>;
}
