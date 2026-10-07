#!/usr/bin/env bash
# Fails if any path outside the open protocol is tracked (or staged, with --staged).
# The OBN application, automation and governance keeper are private; see README "Licensing".
set -euo pipefail

if [ "${1:-}" = "--staged" ]; then
  files=$(git diff --cached --name-only --diff-filter=ACMR)
else
  files=$(git ls-files)
fi

forbidden='^obn-frontend/'                                    # private application
forbidden+='|(^|/)keeper/'                                     # keeper implementation
forbidden+='|(^|/)\.env($|\.)'                                 # environment files, including examples
forbidden+='|^\.archive/[^/]+\.(cjs|mjs)$'                     # internal release scripts
forbidden+='|(^|/)(frontend-candidate|frontend-overlay|live-frontend-integration[^/]*|private-local-integration-[^/]*)/'  # frontend copies in release evidence

violations=$(printf '%s\n' "$files" | grep -E "$forbidden" || true)
if [ -n "$violations" ]; then
  echo "These paths belong in the private repository, not the public protocol repo:" >&2
  printf '  %s\n' $violations >&2
  exit 1
fi
echo "Public boundary check passed."
