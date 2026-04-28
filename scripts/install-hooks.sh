#!/usr/bin/env bash
#
# One-time installer for the project's git hooks.
#
# Run after a fresh clone:
#   bash scripts/install-hooks.sh
#
# The hooks live in scripts/git-hooks/ (versioned in the repo). This
# script wires them into .git/hooks/ (which git ignores, per repo
# clone) by symlink. Re-running is idempotent.

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
SRC="$REPO_ROOT/scripts/git-hooks"
DEST="$REPO_ROOT/.git/hooks"

if [[ ! -d "$SRC" ]]; then
  echo "✗ $SRC not found — run from inside the repo."
  exit 1
fi

mkdir -p "$DEST"

INSTALLED=0
for hook in "$SRC"/*; do
  name="$(basename "$hook")"
  target="$DEST/$name"
  # Use an absolute symlink so it works even if the repo gets moved.
  ln -snf "$hook" "$target"
  chmod +x "$hook"
  echo "  → linked .git/hooks/$name → scripts/git-hooks/$name"
  INSTALLED=$((INSTALLED+1))
done

echo
echo "✓ Installed $INSTALLED hook(s)."
echo "  The pre-commit hook will refuse commits that contain credential-shaped strings."
echo "  Override (last resort, don't make it a habit): git commit --no-verify"
