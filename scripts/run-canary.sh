#!/bin/bash
# Run the canary's pipeline with the configuration and the platform package of a branch
# of this repository, wait for it, and print each job's status, every failed step's
# output and the output of the steps named by the regex, with token-shaped values redacted.
#
# usage: CIRCLECI_TOKEN=... run-canary.sh <branch> [step-name-regex]
#   APPROVE=1   approves the hold, so production is deployed too
#   PROBE=1     runs the probe job in place of the pipeline
#
# The CircleCI personal token comes from the operator's own vault, never from a project
# the pipeline's identity can read. It reaches curl through a file descriptor.
set -euo pipefail

BRANCH=${1:?usage: run-canary.sh <branch> [step-name-regex]}
SHOW=${2:-'Read nextnode|Fetch the secrets|Deploy|Resources|Smoke|Promote|Probe|Stand in'}
: "${CIRCLECI_TOKEN:?CIRCLECI_TOKEN must be set}"
CC=https://circleci.com/api/v2
PROJECT=circleci/TRU8GsHNL2QX13BVQE2UK8/FDPCoATpJwHnVvPDFPNiN
DEFINITION=3b27438e-17b8-41f4-8e7e-372b32323712

json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j={};try{j=JSON.parse(s||"{}")}catch{};const v=new Function("j","return ("+process.argv[1]+")")(j);console.log(v==null?"":typeof v==="string"?v:JSON.stringify(v))})' "$1"; }
api() { curl -sS -K <(printf 'header = "Circle-Token: %s"\n' "$CIRCLECI_TOKEN") -H 'content-type: application/json' "$@"; }
redact() { sed -E 's/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_.-]+/<redacted-jwt>/g; s/[A-Za-z0-9_-]{40,}/<redacted>/g'; }

probe=$([ -n "${PROBE:-}" ] && echo true || echo false)
run=$(api -X POST "$CC/project/$PROJECT/pipeline/run" -d "{\"definition_id\":\"$DEFINITION\",\"config\":{\"branch\":\"$BRANCH\"},\"checkout\":{\"branch\":\"main\"},\"parameters\":{\"program_ref\":\"$BRANCH\",\"probe\":$probe}}")
pipeline=$(printf '%s' "$run" | json 'j.id')
[ -n "$pipeline" ] || { printf '%s\n' "$run" | head -c 300; echo; exit 1; }
echo "pipeline $(printf '%s' "$run" | json 'j.number') ($pipeline) branch=$BRANCH probe=$probe"

approved=
for _ in $(seq 1 240); do
  workflow=$(api "$CC/pipeline/$pipeline/workflow" | json 'j.items?.[0]')
  status=$(printf '%s' "$workflow" | json 'j.status')
  id=$(printf '%s' "$workflow" | json 'j.id')
  if [ "$status" = on_hold ] && [ -n "${APPROVE:-}" ] && [ -z "$approved" ]; then
    request=$(api "$CC/workflow/$id/job" | json 'j.items.find(x=>x.type==="approval")?.approval_request_id')
    [ -n "$request" ] && api -o /dev/null -X POST "$CC/workflow/$id/approve/$request" && approved=1 && echo "approved the hold" && { sleep 5; continue; }
  fi
  # An approved hold reads as on_hold for a few more polls.
  case "$status" in success|failed|error|canceled) break;; on_hold) [ -n "$approved" ] || break;; esac
  if [ -z "$status" ]; then
    errors=$(api "$CC/pipeline/$pipeline" | json 'j.errors?.map(e=>e.type+" "+e.message).join(" | ")')
    [ -z "$errors" ] || { echo "pipeline error: $errors" | redact; exit 1; }
  fi
  sleep 5
done
echo "workflow: ${status:-unknown}"
jobs=$(api "$CC/workflow/$id/job")
printf '%s' "$jobs" | json 'j.items.map(x=>x.name+"="+x.status+(x.job_number?"#"+x.job_number:"")).join("  ")'
for number in $(printf '%s' "$jobs" | json 'j.items.filter(x=>x.job_number).map(x=>x.job_number).join(" ")'); do
  job=$(api "https://circleci.com/api/v1.1/project/$PROJECT/$number")
  echo "== job $(printf '%s' "$job" | json 'j.workflows?.job_name') (#$number) $(printf '%s' "$job" | json 'j.status')"
  printf '%s' "$job" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const re=new RegExp(process.argv[1]);for(const st of j.steps||[])for(const a of st.actions||[]){if(a.status!=="success"||re.test(st.name))console.log((a.status==="success"?"ok   ":"FAIL ")+st.name+"\t"+(a.output_url||""))}})' "$SHOW" | while IFS=$'\t' read -r line url; do
    echo "  $line"
    if [ -n "$url" ]; then curl -s "$url" | json 'j.map(m=>m.message).join("")' | redact | tail -n 15 | sed 's/^/      | /'; fi
  done
done
# Without APPROVE, a green pipeline rests on hold.
[ "$status" = success ] || { [ "$status" = on_hold ] && [ -z "${APPROVE:-}" ]; }
