#!/usr/bin/env bash
# Process the open email-auth follow-up issues one at a time.
#
# For each issue a brand-new `claude -p` session is started, so every issue gets a
# fresh context (nothing carries over from the previous one). The session implements
# the issue and commits; this script then re-runs the checks itself and only pushes
# if they pass. It stops at the first failure so a broken issue never gets stacked on.
#
# Usage (from the repo root, Git Bash):
#   bash scripts/process-issues.sh              # all issues, in the default order
#   bash scripts/process-issues.sh 12 8 9       # only these, in this order
#   DRY_RUN=1 bash scripts/process-issues.sh    # print the plan, change nothing
#   NO_PUSH=1 bash scripts/process-issues.sh    # implement + commit, do not push
set -euo pipefail

# Real-risk first (#12 security gap), then small code fixes, then judgement calls and docs.
DEFAULT_ISSUES=(12 8 9 13 14 10 15 11 17 18)
ISSUES=("${@:-${DEFAULT_ISSUES[@]}}")

# Tools the headless session may use without prompting. Pushing is done by this
# script, not by the agent, so `git push` is deliberately absent. `gh` is absent
# too: the script fetches the issue text and passes it in the prompt.
ALLOWED_TOOLS='Read,Write,Edit,Glob,Grep,Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(git add:*),Bash(git commit:*),Bash(npm run:*),Bash(npm test:*),Bash(npx vitest:*),Bash(npx playwright:*)'

cd "$(git rev-parse --show-toplevel)"

branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" == "main" ]]; then
  echo "Refusing to run on main. Switch to the feature branch first." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean; commit or stash first." >&2
  exit 1
fi

# Fetch an issue's title, labels, body and comments; retry, and fail if it comes back empty.
fetch_issue() {
  local n=$1 out attempt
  for attempt in 1 2 3; do
    if out=$(gh issue view "$n" --comments 2>/dev/null) && [[ -n "${out//[[:space:]]/}" ]]; then
      printf '%s' "$out"
      return 0
    fi
    sleep $((attempt * 5))
  done
  return 1
}

checks() {
  npm run typecheck && npm run lint && npm test
}

for n in "${ISSUES[@]}"; do
  echo
  echo "=================================================================="
  echo " Issue #$n  (branch: $branch)"
  echo "=================================================================="

  if [[ "${DRY_RUN:-}" == "1" ]]; then
    echo "[dry run] would implement, check, commit and push #$n"
    continue
  fi

  if ! issue_text=$(fetch_issue "$n"); then
    echo "Could not fetch issue #$n from GitHub (empty or failed); stopping." >&2
    exit 1
  fi

  start_sha=$(git rev-parse HEAD)

  prompt="Implement GitHub issue #$n of this repo, following CLAUDE.md and tasks/TASK.md.

1. The full issue text (title, body, comments) is below. Every checkbox in it is part of the work.
   You have no GitHub access in this session; do not try to run gh.
2. Use TDD where it fits: write or extend the failing test first, then the fix.
3. Where the issue says 'decide and record', pick the option that best matches
   CLAUDE.md, PRD.md and CONTRACT-CHANGES.md and record the decision in CONTRACT-CHANGES.md
   (and docs/DESIGN.md for UI exceptions). If it is genuinely the user's call, do not guess:
   leave the code unchanged, state the question in your final message, and exit non-zero.
4. Keep the change scoped to this issue. Do not touch other open issues' items.
5. Run typecheck, lint and the relevant test files while working; run the full server tests once at the end.
6. Update tasks/TASK.md / docs if the issue changes anything they describe.
7. Make exactly one commit on the current branch. Message: a short imperative summary,
   a blank line, 'Closes #$n', a blank line, then the trailer
   'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'.
8. Do NOT push. The caller pushes.

Finish with one line: what changed and which tests cover it.

----- ISSUE #$n (fetched by the caller) -----
$issue_text
----- END ISSUE -----"

  # Fresh process => fresh context for every issue.
  if ! claude -p "$prompt" --allowedTools "$ALLOWED_TOOLS" --permission-mode acceptEdits; then
    echo "claude exited non-zero on #$n; stopping." >&2
    exit 1
  fi

  # The session must have produced a commit and left the tree clean.
  if [[ "$(git rev-parse HEAD)" == "$start_sha" ]]; then
    echo "#$n produced no commit; stopping." >&2
    exit 1
  fi
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "#$n left uncommitted changes; stopping." >&2
    git status --short >&2
    exit 1
  fi

  # Do not trust the session's own report: re-run the gate here.
  echo "--- verifying #$n"
  if ! checks; then
    echo "Checks failed after #$n; not pushing. Fix or revert with: git reset --hard $start_sha" >&2
    exit 1
  fi

  if [[ "${NO_PUSH:-}" == "1" ]]; then
    echo "--- NO_PUSH set; skipping push for #$n"
  else
    git push origin "$branch"
  fi

  echo "--- #$n done: $(git log -1 --oneline)"
done

echo
echo "All requested issues processed."
echo "Not covered by this gate: Playwright (npm run test:e2e). Run it once at the end,"
echo "with PW_CHROMIUM_CHANNEL=msedge --project=chromium, especially after #8 and #11."
