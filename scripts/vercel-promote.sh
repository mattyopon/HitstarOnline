#!/usr/bin/env bash
# Promote a hitstar-online Vercel deployment to production.
#
# Why this exists: git pushes from this repo build successfully on Vercel but
# land as STAGED (bot-authored commits are not auto-promoted to the production
# alias), and CLI `vercel --prod` deploys are rejected outright ("Git author
# noreply@anthropic.com must have access to the team"). The supported path is
# the promote API with the owner's VERCEL_TOKEN — which is what this script
# does: wait for the target deployment to be READY, promote it, verify the
# production alias switched.
#
# Usage:
#   scripts/vercel-promote.sh              # newest git-source deployment
#   scripts/vercel-promote.sh <dpl_...>    # a specific deployment id
#   scripts/vercel-promote.sh <commit-sha> # deployment for a commit (prefix ok)
#
# Requires: VERCEL_TOKEN. Never prints the token.
set -euo pipefail

PROJECT_ID="prj_xrZGF8Go8q1AsMQMsUVCABXNuNCu"   # hitstar-online
PROD_HOST="hitstar-online.vercel.app"
API="https://api.vercel.com"
CA="${NODE_EXTRA_CA_CERTS:-/root/.ccr/ca-bundle.crt}"

CURL=(curl -sS -H "Authorization: Bearer ${VERCEL_TOKEN:?VERCEL_TOKEN is not set}" -H "User-Agent: Mozilla/5.0")
[ -f "$CA" ] && CURL+=(--cacert "$CA")

TARGET="${1:-}"

# Resolve the target deployment id + wait for READY (build ~2-4 min).
DEADLINE=$(( $(date +%s) + 1500 ))  # 25 min cap
DPL=""
while :; do
  LIST="$("${CURL[@]}" "$API/v6/deployments?projectId=$PROJECT_ID&limit=20")"
  read -r DPL STATE SHA < <(python3 - "$TARGET" <<'PY' <<<"$LIST"
import sys, json
target = sys.argv[1]
data = json.load(sys.stdin)
for d in data.get("deployments", []):
    uid = d.get("uid", "")
    sha = (d.get("meta", {}) or {}).get("githubCommitSha", "") or ""
    if target:
        if not (uid == target or (sha and sha.startswith(target))):
            continue
    elif d.get("source") != "git":
        continue  # default: newest git-source deployment
    print(uid, d.get("readyState", "?"), sha[:7] or "-")
    break
else:
    print("NONE NONE -")
PY
)
  if [ "$DPL" = "NONE" ]; then
    if [ -n "$TARGET" ] && [ "$(date +%s)" -lt "$DEADLINE" ]; then
      echo "target not visible yet; waiting…"; sleep 15; continue
    fi
    echo "ERROR: no matching deployment found" >&2; exit 1
  fi
  echo "deployment $DPL ($SHA) state=$STATE"
  case "$STATE" in
    READY) break ;;
    ERROR|CANCELED|BLOCKED|DELETED) echo "ERROR: deployment is $STATE — not promotable" >&2; exit 1 ;;
    *) [ "$(date +%s)" -ge "$DEADLINE" ] && { echo "ERROR: timed out waiting for READY" >&2; exit 1; }
       sleep 15 ;;
  esac
done

echo "promoting $DPL to production…"
"${CURL[@]}" -X POST -H "Content-Type: application/json" \
  "$API/v10/projects/$PROJECT_ID/promote/$DPL" >/dev/null

# Verify the production alias now serves the promoted deployment.
for _ in $(seq 1 40); do
  CUR="$("${CURL[@]}" "$API/v13/deployments/$PROD_HOST" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))')"
  if [ "$CUR" = "$DPL" ]; then
    echo "OK: https://$PROD_HOST now serves $DPL"
    exit 0
  fi
  sleep 5
done
echo "WARN: promote requested but alias still shows $CUR — check the Vercel dashboard" >&2
exit 2
