#!/usr/bin/env bash
# Installed as /usr/local/sbin/evisa-update by setup-autodeploy.sh.
# Runs as root through sudo and is the only thing the GitHub deploy key can run.
# Argument (one string, from SSH_ORIGINAL_COMMAND): "check" or "deploy <40-hex commit>".
set -euo pipefail
[ ! -f /etc/evisa-deploy.env ] || . /etc/evisa-deploy.env
DIR="${DIR:-/opt/evisa}"
BRANCH="${BRANCH:-claude/affectionate-archimedes-yzozwx}"
LOG_DIR=/var/log/evisa-deploy

REQUEST="${1:-}"
case "$REQUEST" in
  check) echo "evisa-update: ok"; exit 0 ;;
  "deploy "*) SHA="${REQUEST#deploy }" ;;
  *) echo "Usage: check | deploy <commit>" >&2; exit 2 ;;
esac
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Bad commit id." >&2; exit 2; }

# One deploy at a time, also against a manual deploy.sh run started through this command.
exec 9>/run/evisa-update.lock
flock -w 900 9 || { echo "Another deploy is still running." >&2; exit 1; }

cd "$DIR"
git fetch -q origin "$BRANCH"
git merge-base --is-ancestor "$SHA" "origin/$BRANCH" || { echo "Commit is not on $BRANCH." >&2; exit 1; }
CURRENT="$(git rev-parse HEAD)"
if [ "$SHA" != "$CURRENT" ] && git merge-base --is-ancestor "$SHA" "$CURRENT" 2>/dev/null; then
  echo "A newer commit (${CURRENT:0:7}) is already deployed; nothing to do."
  exit 0
fi

mkdir -p "$LOG_DIR"; chmod 700 "$LOG_DIR"
LOG="$LOG_DIR/$(date +%Y%m%d-%H%M%S)-${SHA:0:7}.log"
# Run the deploy.sh of that very commit from a copy: the checkout below rewrites the original.
SCRIPT="$(mktemp)"; trap 'rm -f "$SCRIPT"' EXIT
git show "$SHA:deploy.sh" >"$SCRIPT"
START="$(date +%s)"
set +e
NONINTERACTIVE=1 DEPLOY_SHA="$SHA" BRANCH="$BRANCH" DIR="$DIR" bash "$SCRIPT" </dev/null >"$LOG" 2>&1
CODE=$?
set -e
# The repository is public, so the CI log only gets the step lines; the full log stays on the server.
sed 's/\x1b\[[0-9;]*m//g' "$LOG" | grep -E '^(==>|\[!\]|\[x\]) ' || true
ls -1t "$LOG_DIR"/*.log 2>/dev/null | tail -n +31 | xargs -r rm -f --
if [ "$CODE" = 0 ]; then
  echo "Deploy OK: ${SHA:0:7} in $(( $(date +%s) - START )) s"
else
  echo "Deploy FAILED (exit $CODE). Full log on the server: $LOG" >&2
fi
exit "$CODE"
