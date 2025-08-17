// src/components/NFTWithTimedEffects.tsx
"use client";

import Image from "next/image";
import clsx from "clsx";

export type EffectMode = "none" | "gloss" | "goldGloss" | "rainbowGloss";

export function NFTWithTimedEffects({
  src,
  alt = "Your Olive",
  effect,
  rounded = "rounded-xl",
  width = 512,
  height = 512,
}: {
  src: string;
  alt?: string;
  effect: EffectMode;
  rounded?: string;
  width?: number;
  height?: number;
}) {
  const hasGloss = effect === "gloss";
  const hasGoldGloss = effect === "goldGloss";
  const hasRainbowGloss = effect === "rainbowGloss";

  return (
    <div className={clsx("relative inline-block", rounded)}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={clsx("block w-full h-auto", rounded)}
        priority
      />

      {/* White glossy sweep */}
      {hasGloss && (
        <div
          className={clsx(
            "pointer-events-none absolute inset-0 overflow-hidden z-10",
            rounded
          )}
          aria-hidden
        >
          <div className="absolute inset-0 sheen-mask">
            <div className="sheen-band" />
          </div>
        </div>
      )}

      {/* Gold glossy sweep */}
      {hasGoldGloss && (
        <div
          className={clsx(
            "pointer-events-none absolute inset-0 overflow-hidden z-10",
            rounded
          )}
          aria-hidden
        >
          <div className="absolute inset-0 gold-sheen-mask">
            <div className="gold-sheen-band" />
          </div>
        </div>
      )}

      {/* Rainbow glossy sweep */}
      {hasRainbowGloss && (
        <div
          className={clsx(
            "pointer-events-none absolute inset-0 overflow-hidden z-10",
            rounded
          )}
          aria-hidden
        >
          <div className="absolute inset-0 rainbow-sheen-mask">
            <div className="rainbow-sheen-band" />
          </div>
        </div>
      )}
    </div>
  );
}
