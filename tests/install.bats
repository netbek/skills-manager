#!/usr/bin/env bats
# skills-sync install: CLI invocation shape, checksum-driven idempotence,
# first-party handling and pruning.

load 'helpers'

setup() {
    setup_sandbox
}

teardown() {
    teardown_sandbox
}

@test "install passes agents, -y and each skill to the CLI, run from the root" {
    make_git_fixture
    stub_skills
    enable_stub_installs

    run_sync --root "$SANDBOX" install
    assert_status 0
    assert_err_equals_file /dev/null

    [ "$(stub_call_count)" -eq 1 ] || printf 'calls: %s\n' "$(cat "$STUB_LOG")"
    [ "$(stub_call_count)" -eq 1 ]
    local expected="add vercel-labs/skills -a opencode -a claude-code -y --skill find-skills"
    [ "$(last_stub_args)" = "$expected" ] || printf 'args: %s\n' "$(last_stub_args)"
    [ "$(last_stub_args)" = "$expected" ]

    # The stub materialized the skill under the sandbox root, proving it ran there.
    assert_path_exists "$SANDBOX/.agents/skills/find-skills/SKILL.md"
}

@test "install makes one CLI invocation per repo line and repeats --skill within a line" {
    make_git_fixture
    write_config skills.conf <<'EOF'
agents: opencode claude-code
skills-dir: .agents/skills
links-dir: .claude/skills
repo/a alpha beta
repo/b gamma
EOF
    stub_skills

    run_sync --root "$SANDBOX" install
    assert_status 0

    [ "$(stub_call_count)" -eq 2 ] || printf 'calls:\n%s\n' "$(cat "$STUB_LOG")"
    [ "$(stub_call_count)" -eq 2 ]
    grep -Fxq 'ARGS=add repo/a -a opencode -a claude-code -y --skill alpha --skill beta' "$STUB_LOG"
    grep -Fxq 'ARGS=add repo/b -a opencode -a claude-code -y --skill gamma' "$STUB_LOG"
}

@test "install creates every declared skills-dir and links-dir" {
    make_git_fixture
    write_config skills.conf <<'EOF'
agents: opencode
skills-dir: .agents/skills
skills-dir: .other/skills
links-dir: .claude/skills
links-dir: .codex/skills
repo/a alpha
EOF
    stub_skills

    run_sync --root "$SANDBOX" install
    assert_status 0

    assert_path_exists "$SANDBOX/.agents/skills"
    assert_path_exists "$SANDBOX/.other/skills"
    assert_path_exists "$SANDBOX/.claude/skills"
    assert_path_exists "$SANDBOX/.codex/skills"
}

@test "install records config and first-party hashes in the checksum file" {
    make_git_fixture
    stub_skills
    enable_stub_installs

    run_sync --root "$SANDBOX" install
    assert_status 0

    assert_path_exists "$SANDBOX/.skills.checksum"
    [ "$(wc -l <"$SANDBOX/.skills.checksum")" -eq 2 ]
    local hash fp_hash
    hash=$(sha256sum "$SANDBOX/skills.conf" | cut -d ' ' -f 1)
    fp_hash=$(cd "$SANDBOX" && printf 'fp-skill\n' | sha256sum | cut -d ' ' -f 1)
    grep -qx "$hash" "$SANDBOX/.skills.checksum"
    grep -qx "$fp_hash" "$SANDBOX/.skills.checksum"
}

@test "unchanged rerun is a no-op" {
    make_git_fixture
    stub_skills
    enable_stub_installs

    run_sync --root "$SANDBOX" install
    assert_status 0
    [ "$(stub_call_count)" -eq 1 ]

    run_sync --root "$SANDBOX" install
    assert_status 0
    assert_err_equals_file /dev/null
    [ "$(stub_call_count)" -eq 1 ] || printf 'calls:\n%s\n' "$(cat "$STUB_LOG")"
    [ "$(stub_call_count)" -eq 1 ]
}

@test "--force reinstalls despite matching checksum" {
    make_git_fixture
    stub_skills
    enable_stub_installs

    run_sync --root "$SANDBOX" install
    assert_status 0

    run_sync --root "$SANDBOX" install --force
    assert_status 0
    [ "$(stub_call_count)" -eq 2 ] || printf 'calls:\n%s\n' "$(cat "$STUB_LOG")"
    [ "$(stub_call_count)" -eq 2 ]
}

@test "editing the config triggers a fresh pass covering both old and new lines" {
    make_git_fixture
    stub_skills
    enable_stub_installs

    run_sync --root "$SANDBOX" install
    assert_status 0
    printf '\nother/repo delta\n' >>"$SANDBOX/skills.conf"

    run_sync --root "$SANDBOX" install
    assert_status 0
    [ "$(stub_call_count)" -eq 3 ] || printf 'calls:\n%s\n' "$(cat "$STUB_LOG")"
    [ "$(stub_call_count)" -eq 3 ]
    grep -Fxq 'ARGS=add other/repo -a opencode -a claude-code -y --skill delta' "$STUB_LOG"
}

@test "missing config file errors and exits 1" {
    run_sync --root "$SANDBOX" install
    assert_status 1
    assert_err_contains "error: no config at $SANDBOX/skills.conf"
    assert_out_equals_file /dev/null
}

@test "missing skills binary warns and exits 0 without creating directories" {
    make_git_fixture
    copy_sync_into_sandbox # so the beside-the-script fallback cannot find one either

    run_sync --root "$SANDBOX" install
    assert_status 0
    assert_err_contains 'warning: no skills binary here or beside skills-sync; install dependencies first'
    # The fixture itself ships a first-party skill, so check nothing was installed.
    assert_path_absent "$SANDBOX/.agents/skills/find-skills"
    assert_path_absent "$SANDBOX/.claude/skills/find-skills"
}

@test "config declaring no skills-dir errors and exits 1" {
    make_git_fixture
    write_config skills.conf <<'EOF'
agents: opencode
links-dir: .claude/skills
repo/a alpha
EOF
    stub_skills

    run_sync --root "$SANDBOX" install
    assert_status 1
    assert_err_contains "error: $SANDBOX/skills.conf declares no skills-dir"
}

@test "first-party skill is never reinstalled but gets refreshed links" {
    make_git_fixture
    write_config skills.conf <<'EOF'
agents: opencode claude-code
skills-dir: .agents/skills
links-dir: .claude/skills
vercel-labs/skills find-skills fp-skill
EOF
    stub_skills
    enable_stub_installs

    run_sync --root "$SANDBOX" install
    assert_status 0

    if grep -q -- '--skill fp-skill' "$STUB_LOG"; then
        fail 'first-party skill passed to CLI'
    fi
    grep -Fq -- '--skill find-skills' "$STUB_LOG"

    assert_symlink_target "$SANDBOX/.claude/skills/fp-skill" '../../.agents/skills/fp-skill'
    # The committed link is refreshed too, keeping its existing relative target.
    assert_symlink_target "$SANDBOX/.claude/skills/committed-link" '../../.agents/skills/fp-skill'
}

@test "install prunes excess skills and links while sparing committed ones" {
    make_git_fixture
    mkdir -p "$SANDBOX/.agents/skills/installed-old"
    echo gone >"$SANDBOX/.agents/skills/installed-old/SKILL.md"
    ln -s ./nope "$SANDBOX/.claude/skills/dangling-link"
    ln -s ../../.agents/skills/fp-skill "$SANDBOX/.claude/skills/stale-link"
    stub_skills
    enable_stub_installs

    run_sync --root "$SANDBOX" install
    assert_status 0

    assert_err_contains 'uninstalling excess skill: installed-old'
    assert_err_contains 'removing dangling skill link: dangling-link'
    assert_err_contains 'uninstalling excess skill link: stale-link'

    assert_path_absent "$SANDBOX/.agents/skills/installed-old"
    assert_path_absent "$SANDBOX/.claude/skills/dangling-link"
    assert_path_absent "$SANDBOX/.claude/skills/stale-link"

    assert_path_exists "$SANDBOX/.agents/skills/fp-skill/SKILL.md"
    assert_path_exists "$SANDBOX/.claude/skills/committed-link"
    assert_path_exists "$SANDBOX/.agents/skills/find-skills/SKILL.md"
}

@test "custom --config and --checksum paths are honored" {
    write_config conf/my.conf <<'EOF'
agents: opencode
skills-dir: .agents/skills
links-dir: .claude/skills
repo/a alpha
EOF
    stub_skills
    enable_stub_installs

    run_sync --root "$SANDBOX" install --config conf/my.conf --checksum state/checksums
    assert_status 0

    [ "$(stub_call_count)" -eq 1 ] || printf 'calls:\n%s\n' "$(cat "$STUB_LOG")"
    [ "$(stub_call_count)" -eq 1 ]
    assert_path_exists "$SANDBOX/state/checksums"
    assert_path_absent "$SANDBOX/.skills.checksum"
}

@test "warns when the checksum file is not git-ignored" {
    default_config
    cat >"$SANDBOX/.gitignore" <<'EOF'
.agents/skills/*
.claude/skills/*
!.agents/skills/fp-skill
EOF
    git -C "$SANDBOX" init -q -b main
    git -C "$SANDBOX" config user.email test@example.com
    git -C "$SANDBOX" config user.name Test
    git -C "$SANDBOX" add -A
    git -C "$SANDBOX" commit -qm init
    stub_skills

    run_sync --root "$SANDBOX" install
    assert_status 0
    assert_err_contains 'warning: add .skills.checksum to .gitignore'
}

@test "CLI failure warns but still exits 0" {
    make_git_fixture
    stub_skills
    export STUB_EXIT=1

    run_sync --root "$SANDBOX" install
    assert_status 0
    assert_err_contains 'warning: could not install skills from vercel-labs/skills (offline?)'
    assert_err_contains 'warning: some skills failed to install; check your connection and rerun'
    assert_out_equals_file /dev/null
}

@test "install works outside a git work tree" {
    default_config # no git init: nothing counts as first-party
    stub_skills
    enable_stub_installs

    run_sync --root "$SANDBOX" install
    assert_status 0
    assert_out_equals_file /dev/null
    [ "$(stub_call_count)" -eq 1 ]
    assert_path_exists "$SANDBOX/.agents/skills/find-skills/SKILL.md"
}
