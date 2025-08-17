export type EffectMode = "none" | "gloss" | "goldGloss" | "rainbowGloss";

export function effectFromAccumulated(seconds: number): EffectMode {
  const DAY = 60 * 60 * 24; // seconds in a day
  if (seconds < 30 * DAY) return "none";
  if (seconds < 60 * DAY) return "gloss";
  if (seconds < 90 * DAY) return "goldGloss";
  return "rainbowGloss"; // 90+ days
}
