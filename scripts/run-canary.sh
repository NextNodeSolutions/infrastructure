#!/bin/bash
# Run the canary's pipeline with the configuration and the platform package of a branch
# of this repository, on a branch of the canary, wait for it, print each job's status,
# every failed step's output and the output of the steps named by SHOW, and save every
# step's output, one log per job, with token-shaped values redacted.
#
# usage: infisical run ... -- run-canary.sh <branch> [canary-branch]
#   APPROVE=1   approves the hold, so production is deployed too
#   PROBE=1     runs the probe job in place of the pipeline
#   SHOW=regex  the steps whose output is printed, beside the failed ones
#   LOGS=dir    where the logs go, a new temporary directory by default
#
# The CircleCI personal token comes from the operator's own vault, never from a project
# the pipeline's identity can read. It reaches curl through a file descriptor, so it
# shows in no process listing.
set -euo pipefail

BRANCH=${1:?usage: run-canary.sh <branch> [canary-branch]}
CHECKOUT=${2:-main}
SHOW=${SHOW:-'Read nextnode|Fetch the secrets|Deploy|Resources|Smoke|Promote|Probe|Stand in'}
LOGS=${LOGS:-$(mktemp -d)}
: "${CIRCLECI_TOKEN:?inject it with infisical run, never type or export it}"
CC=https://circleci.com/api/v2
PROJECT=circleci/TRU8GsHNL2QX13BVQE2UK8/FDPCoATpJwHnVvPDFPNiN
DEFINITION=3b27438e-17b8-41f4-8e7e-372b32323712
mkdir -p "$LOGS"

api() { curl -sS -H @/dev/fd/3 -H 'content-type: application/json' "$@" 3<<<"Circle-Token: $CIRCLECI_TOKEN"; }
redact() { sed -E 's/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_.-]+/<redacted-jwt>/g; s/[A-Za-z0-9_-]{40,}/<redacted>/g'; }

body=$(jq -nc --arg d "$DEFINITION" --arg b "$BRANCH" --arg c "$CHECKOUT" --argjson p "$([ -n "${PROBE:-}" ] && echo true || echo false)" \
  '{definition_id: $d, config: {branch: $b}, checkout: {branch: $c}, parameters: {program_ref: $b, probe: $p}}')
run=$(api -X POST "$CC/project/$PROJECT/pipeline/run" -d "$body")
pipeline=$(jq -r '.id // empty' <<<"$run")
[ -n "$pipeline" ] || { head -c 300 <<<"$run" | redact; echo; exit 1; }
echo "pipeline $(jq -r .number <<<"$run") ($pipeline) branch=$BRANCH canary=$CHECKOUT probe=${PROBE:-} logs=$LOGS"

status="" id="" approved=""
while [ "$SECONDS" -lt 3600 ]; do
  workflow=$(api "$CC/pipeline/$pipeline/workflow" | jq -c '.items[0] // {}')
  status=$(jq -r '.status // empty' <<<"$workflow")
  id=$(jq -r '.id // empty' <<<"$workflow")
  if [ "$status" = on_hold ] && [ -n "${APPROVE:-}" ] && [ -z "$approved" ]; then
    request=$(api "$CC/workflow/$id/job" | jq -r '[.items[] | select(.type == "approval" and .status == "on_hold")][0].approval_request_id // empty')
    [ -n "$request" ] && api -o /dev/null -X POST "$CC/workflow/$id/approve/$request" && approved=1 && echo "approved the hold"
  fi
  # An approved hold reads as on_hold for a few more polls.
  case "$status" in success|failed|error|canceled|unauthorized) break;; on_hold) [ -n "${APPROVE:-}" ] || break;; esac
  if [ -z "$status" ]; then
    errors=$(api "$CC/pipeline/$pipeline" | jq -r '[.errors[]? | "\(.type) \(.message)"] | join(" | ")')
    [ -z "$errors" ] || { echo "pipeline error: $errors" | redact; exit 1; }
  fi
  sleep 10
done
echo "workflow: ${status:-unknown}"

jobs=$(api "$CC/workflow/$id/job")
jq -r '[.items[] | "\(.name)=\(.status)\(if .job_number then "#\(.job_number)" else "" end)"] | join("  ")' <<<"$jobs"
jq -r '.items[] | select(.type == "build" and .job_number) | "\(.job_number)\t\(.name)"' <<<"$jobs" | while IFS=$'\t' read -r number name; do
  job=$(api "https://circleci.com/api/v1.1/project/$PROJECT/$number")
  echo "== job $name (#$number) $(jq -r .status <<<"$job") -> $LOGS/$name.log"
  jq -r '.steps[] | .name as $step | .actions[] | [$step, .status, .output_url // ""] | @tsv' <<<"$job" | while IFS=$'\t' read -r step state url; do
    output=$([ -z "$url" ] || curl -sS "$url" | jq -r '.[].message' | redact)
    printf '===== %s (%s)\n%s\n' "$step" "$state" "$output" >>"$LOGS/$name.log"
    if [ "$state" != success ] || [[ $step =~ $SHOW ]]; then
      echo "  $([ "$state" = success ] && echo "ok  " || echo FAIL) $step"
      [ -z "$output" ] || tail -n 15 <<<"$output" | sed 's/^/      | /'
    fi
  done
done
# Without APPROVE, a green pipeline rests on hold.
[ "$status" = success ] || { [ "$status" = on_hold ] && [ -z "${APPROVE:-}" ]; }
