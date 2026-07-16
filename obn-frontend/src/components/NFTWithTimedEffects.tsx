// src/components/NFTWithTimedEffects.tsx
"use client";

import Image from "next/image";
import clsx from "clsx";
import { useMemo, useState, type CSSProperties } from "react";
import { IPFS_IMAGE_GATEWAYS, buildIpfsHttpUrl } from "@/lib/ipfs";

export type EffectMode = "none" | "gloss" | "goldGloss" | "rainbowGloss";

function resolveSrc(rawSrc: string | null | undefined, gatewayIndex: number): string {
  if (!rawSrc) return "";
  return buildIpfsHttpUrl(rawSrc, gatewayIndex, IPFS_IMAGE_GATEWAYS);
}

export function NFTWithTimedEffects({
  src,
  alt = "Your Olive",
  effect,
  rounded = "rounded-xl",
  width = 512,
  height = 512,
  oliveId,
  progressPct,
  rainbowStyle,
}: {
  src?: string | null;
  alt?: string;
  effect: EffectMode;
  rounded?: string;
  width?: number;
  height?: number;
  oliveId?: string;
  progressPct?: number;
  rainbowStyle?: CSSProperties;
}) {
  const [gatewayIndex, setGatewayIndex] = useState(0);
  const [hasError, setHasError] = useState(false);

  const resolvedSrc = useMemo(
    () => resolveSrc(src, gatewayIndex),
    [src, gatewayIndex]
  );

  const hasGloss = effect === "gloss";
  const hasGoldGloss = effect === "goldGloss";
  const hasRainbowGloss = effect === "rainbowGloss";
  const isBaseballCard = !!oliveId && progressPct !== undefined;

  const handleImageError = () => {
    console.warn("NFT image failed to load", {
      original: src,
      resolved: resolvedSrc,
      gatewayIndex,
    });

    // If this was an ipfs:// URL and we still have gateways to try, advance
    if (src && src.startsWith("ipfs://") && gatewayIndex < IPFS_IMAGE_GATEWAYS.length - 1) {
      setGatewayIndex((prev) => prev + 1);
      return;
    }

    // Otherwise, give up and show fallback
    setHasError(true);
  };

  const commonImage = (imgWidth: number, imgHeight: number, extraClasses = "") => {
    // Show fallback if there's an error or no source URL
    if (hasError || !resolvedSrc) {
      return (
        <div className="flex items-center justify-center bg-gray-200 text-xs text-gray-600 w-full h-full">
          Olive image unavailable
        </div>
      );
    }

    return (
      <Image
        src={resolvedSrc}
        alt={alt}
        width={imgWidth}
        height={imgHeight}
        className={clsx("block w-full h-auto", extraClasses)}
        priority
        onError={handleImageError}
      />
    );
  };

  if (isBaseballCard) {
    return (
      <div
        className="border-2"
        style={{ width: `${width}px`, borderColor: "black", backgroundColor: "#ffffff" }}
      >
        {/* Header with Olive # */}
        <div
          className="px-2 py-1.5 border-b-2 border-black text-center"
          style={{ backgroundColor: "#0D9921" }}
        >
          <p className="text-[10px] font-bold" style={{ margin: 0, color: "#ffffff" }}>
            Olive #{oliveId}
          </p>
        </div>

        {/* Art section */}
        <div
          className="relative flex items-center justify-center border-b-2 border-black p-3"
          style={{ aspectRatio: "1/1", backgroundColor: "#ffffff" }}
        >
          <div className="olive-nft-frame overflow-hidden relative rounded-lg">
            {commonImage(width - 40, width - 40, "olive-nft-image")}

            {/* White glossy sweep */}
            {hasGloss && (
              <div
                className="pointer-events-none absolute inset-0 overflow-hidden z-10"
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
                className="pointer-events-none absolute inset-0 overflow-hidden z-10"
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
                className="pointer-events-none absolute inset-0 overflow-hidden z-10"
                aria-hidden
              >
                <div className="absolute inset-0 rainbow-sheen-mask">
                  <div className="rainbow-sheen-band" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Experience bar section */}
        <div className="px-2 py-1.5" style={{ backgroundColor: "#ffffff" }}>
          <p
            className="text-[7px] font-semibold mb-1 text-black"
            style={{ margin: 0, textAlign: "center" }}
          >
            Experience
          </p>
          <div className="relative mb-1" style={{ marginRight: "4px" }}>
            {/* Bar track */}
            <div className="h-1 w-full rounded-sm overflow-hidden bg-gray-300">
              {/* Filled portion */}
              <div
                className="h-full transition-all bg-blue-600"
                style={{ width: `${progressPct ?? 0}%` }}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressPct ?? 0)}
                role="progressbar"
              />
            </div>

            {/* Star markers above the bar */}
            <div className="relative">
              {/* 30d — silver star */}
              <span
                className="absolute -top-2 -translate-x-1/2 text-[8px] select-none"
                style={{ left: "33.333%" }}
                title="30 days"
                aria-hidden
              >
                <span style={{ color: "#C0C0C0", WebkitTextStroke: "0.25px black" }}>★</span>
              </span>
              {/* 60d — gold star */}
              <span
                className="absolute -top-2 -translate-x-1/2 text-[8px] select-none"
                style={{ left: "66.666%" }}
                title="60 days"
                aria-hidden
              >
                <span style={{ color: "#DAA520", WebkitTextStroke: "0.25px black" }}>★</span>
              </span>
              {/* 90d — rainbow star */}
              <span
                className="absolute -top-2 -translate-x-1/2 text-[8px] select-none"
                style={{ left: "100%" }}
                title="90 days"
                aria-hidden
              >
                <span style={{ ...rainbowStyle, WebkitTextStroke: "0.25px black" }}>★</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Original behavior for when not a baseball card
  return (
    <div className={clsx("relative inline-block", rounded)}>
      {commonImage(width, height, rounded)}

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
