#!/usr/bin/env bats
# skills-sync uninstall: sweeps ignored skills and links, spares committed ones,
# drops checksum and lock state.

load 'helpers'

setup() {
    setup_sandbox
}

teardown() {
    teardown_sandbox
}

# Fixture plus the leftovers an earlier install would have produced.
make_installed_fixture() {
    make_git_fixture
    mkdir -p "$SANDBOX/.agents/skills/find-skills"
    cat >"$SANDBOX/.agents/skills/find-skills/SKILL.md" <<'EOF'
---
name: find-skills
description: Installed find-skills
---
Installed.
EOF
    ln -s ../../.agents/skills/find-skills "$SANDBOX/.claude/skills/find-skills"
    ln -s ./nope "$SANDBOX/.claude/skills/dangling-link"
    printf '%s\n%s\n' deadbeef deadbeef >"$SANDBOX/.skills.checksum"
    echo '{}' >"$SANDBOX/skills-lock.json"
}

@test "uninstall removes ignored skills and links, spares committed ones, drops state" {
    make_installed_fixture

    run_sync --root "$SANDBOX" uninstall
    assert_status 0

    assert_err_contains 'uninstalling excess skill: find-skills'
    assert_err_contains 'uninstalling excess skill link: find-skills'

    assert_path_absent "$SANDBOX/.agents/skills/find-skills"
    assert_path_absent "$SANDBOX/.claude/skills/find-skills"
    assert_path_absent "$SANDBOX/.claude/skills/dangling-link"
    assert_path_absent "$SANDBOX/.skills.checksum"
    assert_path_absent "$SANDBOX/skills-lock.json"

    # First-party skill and its committed link must survive.
    assert_path_exists "$SANDBOX/.agents/skills/fp-skill/SKILL.md"
    assert_path_exists "$SANDBOX/.claude/skills/committed-link"

    # A second pass finds nothing left to do and stays quiet about it.
    run_sync --root "$SANDBOX" uninstall
    assert_status 0
    assert_path_exists "$SANDBOX/.agents/skills/fp-skill/SKILL.md"
}

@test "uninstall outside a git work tree refuses to remove anything" {
    default_config # no git init
    mkdir -p "$SANDBOX/.agents/skills/keep"
    echo x >"$SANDBOX/.agents/skills/keep/SKILL.md"
    mkdir -p "$SANDBOX/.claude"
    ln -s ../.agents/skills/keep "$SANDBOX/.claude/skills-link"
    printf 'hash\nhash\n' >"$SANDBOX/.skills.checksum"
    echo '{}' >"$SANDBOX/skills-lock.json"

    run_sync --root "$SANDBOX" uninstall
    assert_status 0
    assert_err_contains 'warning: outside a git work tree; refusing to uninstall any skills'

    assert_path_exists "$SANDBOX/.agents/skills/keep/SKILL.md"
    assert_path_exists "$SANDBOX/.claude/skills-link"
    assert_path_exists "$SANDBOX/.skills.checksum"
    assert_path_exists "$SANDBOX/skills-lock.json"
}

@test "uninstall still requires a config file" {
    run_sync --root "$SANDBOX" uninstall
    assert_status 1
    assert_err_contains "error: no config at $SANDBOX/skills.conf"
}
