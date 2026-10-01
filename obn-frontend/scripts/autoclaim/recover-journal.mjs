import { appendFile } from "node:fs/promises";
import { selectJournal } from "./journal.mjs";

async function main() {
  const { GITHUB_REPOSITORY: repository, GITHUB_RUN_ID: currentRunId, GITHUB_OUTPUT: output, GH_TOKEN: token } = process.env;
  const currentRunAttempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || "") || !/^\d+$/.test(currentRunId || "") || !token || !output) {
    throw new Error("Missing recovery configuration");
  }
  const allowBootstrap = process.env.GITHUB_EVENT_NAME === "workflow_dispatch" && process.env.AUTOCLAIM_BOOTSTRAP === "true";
  const selected = await selectJournal({ repository, currentRunId, currentRunAttempt,
    allowMissing: process.env.AUTOCLAIM_SEND !== "true" || allowBootstrap,
    getJson: async path => {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(30000), redirect: "error",
      });
      if (!response.ok) throw new Error("GitHub journal lookup failed");
      return response.json();
    },
  });
  await appendFile(output, `artifact-id=${selected?.artifactId ?? ""}\nrun-id=${selected?.runId ?? ""}\n`);
  console.log(selected ? `Restoring journal from workflow run ${selected.runId}` : "No prior journal selected; live bootstrap remains explicitly gated");
}

main().catch(() => {
  console.error("Autoclaim journal recovery failed. Review the most recent worker run and its retained artifact before retrying.");
  process.exitCode = 1;
});
