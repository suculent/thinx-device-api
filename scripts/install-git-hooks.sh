#!/bin/sh
# Installs the versioned secret-scan hook into this clone's hooks directory by symlink.
# It does NOT set core.hooksPath, so hooks already living in .git/hooks (roborev post-commit and
# post-rewrite) keep working. Works from a worktree: hooks are shared through the common git dir.
#
# Only pre-commit is installed here; .githooks/prepare-commit-msg stays opt-in via `npm run setup:hooks`.
set -eu

root="$(git rev-parse --show-toplevel)"
hooks_dir="$(git rev-parse --git-path hooks)"
case "$hooks_dir" in /*) ;; *) hooks_dir="$root/$hooks_dir" ;; esac
mkdir -p "$hooks_dir"

src="$root/.githooks/pre-commit"
dst="$hooks_dir/pre-commit"

if [ -e "$dst" ] && [ ! -L "$dst" ]; then
	echo "install-git-hooks: $dst already exists and is not a symlink; leaving it alone." >&2
	echo "Chain it manually: add  \"$src\" || exit 1  to that file." >&2
	exit 1
fi

chmod +x "$src"
ln -sf "$src" "$dst"
echo "installed pre-commit secret scan -> $dst"
command -v gitleaks >/dev/null 2>&1 || echo "note: gitleaks is not installed; the hook will skip until it is (brew install gitleaks)" >&2
