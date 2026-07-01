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
  read -r DPL STATE SHA < <(LIST="$LIST" TARGET="$TARGET" python3 <<'PY'
import os, json
target = os.environ.get("TARGET", "")
data = json.loads(os.environ["LIST"])
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

# Git deployments here are previews (target=None). The dashboard's "Promote to
# Production" actually REDEPLOYS them with target=production (source:"redeploy"),
# so do the same: create a production redeploy from the source deployment. The
# /v10 promote endpoint returns unprocessable_entity for preview deployments.
echo "redeploying $DPL as production…"
NEW="$("${CURL[@]}" -X POST -H "Content-Type: application/json" \
  -d "{\"name\":\"hitstar-online\",\"deploymentId\":\"$DPL\",\"target\":\"production\",\"meta\":{\"action\":\"redeploy\"}}" \
  "$API/v13/deployments?forceNew=1" | python3 -c 'import sys,json
d = json.load(sys.stdin)
if "error" in d:
    sys.stderr.write("API error: %s\n" % d["error"].get("message", d["error"]))
    sys.exit(1)
print(d.get("id", ""))')"
[ -n "$NEW" ] || { echo "ERROR: redeploy request failed" >&2; exit 1; }
echo "production deployment $NEW created; waiting for READY + alias…"

# Wait for the production redeploy to go READY and take over the alias.
DEADLINE=$(( $(date +%s) + 1500 ))
while :; do
  STATE="$("${CURL[@]}" "$API/v13/deployments/$NEW" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("readyState","?"))')"
  echo "  $NEW state=$STATE"
  case "$STATE" in
    READY) break ;;
    ERROR|CANCELED|BLOCKED|DELETED) echo "ERROR: production redeploy is $STATE" >&2; exit 1 ;;
  esac
  [ "$(date +%s)" -ge "$DEADLINE" ] && { echo "ERROR: timed out waiting for production redeploy" >&2; exit 1; }
  sleep 15
done
for _ in $(seq 1 24); do
  CUR="$("${CURL[@]}" "$API/v13/deployments/$PROD_HOST" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))')"
  if [ "$CUR" = "$NEW" ]; then
    echo "OK: https://$PROD_HOST now serves $NEW (from $DPL, commit $SHA)"
    exit 0
  fi
  sleep 5
done
echo "WARN: redeploy READY but alias still shows $CUR — check the Vercel dashboard" >&2
exit 2
