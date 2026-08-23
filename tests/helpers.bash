# Shared fixtures and assertions for the skills-sync bats suite.
#
# Every test runs skills-sync inside a throwaway sandbox created outside any git
# repository, so root detection, work-tree checks and pruning behave predictably.

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SYNC="$REPO_ROOT/skills-sync.sh"

SANDBOX=
STATUS=0
SYNC_BIN=$SYNC
STUB_LOG=

# --- lifecycle ---------------------------------------------------------------

setup_sandbox() {
    SANDBOX=$(mktemp -d "${TMPDIR:-/tmp}/skills-sync-test.XXXXXX")
    SYNC_BIN=$SYNC
    STATUS=0
    STUB_LOG=
}

teardown_sandbox() {
    if [ -n "$SANDBOX" ] && [ -d "$SANDBOX" ]; then
        rm -rf "$SANDBOX"
    fi
    SANDBOX=
}

# --- fixture builders --------------------------------------------------------

# Default config shared by most tests.
write_config() {
    local file=${1:-skills.conf}
    local dir
    dir=$(dirname "$SANDBOX/$file")
    mkdir -p "$dir"
    cat >"$SANDBOX/$file"
}

default_config() {
    write_config skills.conf <<'EOF'
agents: opencode claude-code
skills-dir: .agents/skills
links-dir: .claude/skills

vercel-labs/skills find-skills
EOF
}

# Git repo whose .gitignore marks installed skills and links as ignored, while a
# committed first-party skill and one committed link stay unignored via negation.
make_git_fixture() {
    default_config
    cat >"$SANDBOX/.gitignore" <<'EOF'
.agents/skills/*
.claude/skills/*
!.agents/skills/fp-skill
!.claude/skills/committed-link
.skills.checksum
skills-lock.json
EOF
    mkdir -p "$SANDBOX/.agents/skills/fp-skill"
    cat >"$SANDBOX/.agents/skills/fp-skill/SKILL.md" <<'EOF'
---
name: fp-skill
description: First party skill
---
Use me directly.
EOF
    mkdir -p "$SANDBOX/.claude/skills"
    ln -s ../../.agents/skills/fp-skill "$SANDBOX/.claude/skills/committed-link"
    git -C "$SANDBOX" init -q -b main
    git -C "$SANDBOX" config user.email test@example.com
    git -C "$SANDBOX" config user.name Test
    git -C "$SANDBOX" add -A
    git -C "$SANDBOX" commit -qm init
}

# Stub skills CLI at the sandbox root; find_skills prefers it over any real copy.
# Appends one ARGS line per invocation to $STUB_LOG, materializes each --skill
# into STUB_SKILLS_DIR, and exits with STUB_EXIT (default 0).
stub_skills() {
    mkdir -p "$SANDBOX/node_modules/.bin"
    cat >"$SANDBOX/node_modules/.bin/skills" <<'EOF'
#!/usr/bin/env bash
printf 'ARGS=%s\n' "$(printf '%q ' "$@" | sed -e 's/[[:space:]]*$//')" >>"$STUB_LOG"
if [ -n "${STUB_SKILLS_DIR:-}" ]; then
    prev=
    for arg in "$@"; do
        if [ "$prev" = --skill ]; then
            mkdir -p "$STUB_SKILLS_DIR/$arg"
            printf -- '---\nname: %s\ndescription: Installed %s\n---\nInstalled.\n' "$arg" "$arg" \
                >"$STUB_SKILLS_DIR/$arg/SKILL.md"
        fi
        prev=$arg
    done
fi
exit ${STUB_EXIT:-0}
EOF
    chmod +x "$SANDBOX/node_modules/.bin/skills"
    : >"$SANDBOX/skills-calls.log"
    export STUB_LOG="$SANDBOX/skills-calls.log"
}

enable_stub_installs() {
    export STUB_SKILLS_DIR="$SANDBOX/.agents/skills"
}

copy_sync_into_sandbox() {
    cp "$SYNC" "$SANDBOX/skills-sync.sh"
    chmod +x "$SANDBOX/skills-sync.sh"
    SYNC_BIN="$SANDBOX/skills-sync.sh"
}

# --- running -----------------------------------------------------------------

# Runs the script from inside the sandbox; captures stdout/stderr to files and
# the exit status to $STATUS. The failing status is absorbed so bats does not
# abort the test before assertions run.
run_sync() {
    STATUS=0
    (
        cd "$SANDBOX" || exit 99
        "$SYNC_BIN" "$@"
    ) >"$SANDBOX/out" 2>"$SANDBOX/err" </dev/null || STATUS=$?
}

# --- assertions --------------------------------------------------------------

assert_status() {
    if [ "$STATUS" -ne "$1" ]; then
        printf 'expected status %d, got %d\nstderr:\n%s\n' "$1" "$STATUS" "$(cat "$SANDBOX/err")"
        return 1
    fi
}

assert_out_contains() {
    if ! grep -qF -- "$1" "$SANDBOX/out"; then
        printf 'stdout missing %q\nstdout:\n%s\n' "$1" "$(cat "$SANDBOX/out")"
        return 1
    fi
}

assert_out_not_contains() {
    if grep -qF -- "$1" "$SANDBOX/out"; then
        printf 'stdout unexpectedly contains %q\n' "$1"
        return 1
    fi
}

assert_err_contains() {
    if ! grep -qF -- "$1" "$SANDBOX/err"; then
        printf 'stderr missing %q\nstderr:\n%s\n' "$1" "$(cat "$SANDBOX/err")"
        return 1
    fi
}

assert_err_not_contains() {
    if grep -qF -- "$1" "$SANDBOX/err"; then
        printf 'stderr unexpectedly contains %q\n' "$1"
        return 1
    fi
}

assert_err_equals_file() {
    if ! diff -u "$1" "$SANDBOX/err"; then
        printf 'stderr does not match %s\n' "$1"
        return 1
    fi
}

assert_out_equals_file() {
    if ! diff -u "$1" "$SANDBOX/out"; then
        printf 'stdout does not match %s\n' "$1"
        return 1
    fi
}

assert_path_exists() {
    if [ ! -e "$1" ] && [ ! -L "$1" ]; then
        printf 'expected path to exist: %s\n' "$1"
        return 1
    fi
}

assert_path_absent() {
    if [ -e "$1" ] || [ -L "$1" ]; then
        printf 'expected path to be absent: %s\n' "$1"
        return 1
    fi
}

assert_symlink_target() {
    local actual
    actual=$(readlink "$1")
    if [ "$actual" != "$2" ]; then
        printf 'symlink %s points to %q, expected %q\n' "$1" "$actual" "$2"
        return 1
    fi
}

# --- stub inspection ---------------------------------------------------------

stub_call_count() {
    grep -c '^ARGS=' "$STUB_LOG" || true
}

last_stub_args() {
    grep '^ARGS=' "$STUB_LOG" | tail -n1 | cut -c6-
}
