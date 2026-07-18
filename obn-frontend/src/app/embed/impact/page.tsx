// Normally bypassed by the beforeFiles rewrite in next.config.ts. Keeping a
// minimal page here prevents stale Next.js development types from referring to
// a module that no longer exists while the standalone widget is rolled out.
export default function ImpactEmbedFallback() {
  return null;
}
