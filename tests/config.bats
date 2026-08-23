#!/usr/bin/env bats
# skills-sync config: prints a starter config to stdout.

load 'helpers'

setup() {
    setup_sandbox
}

teardown() {
    teardown_sandbox
}

starter_golden() {
    cat <<'EOF'
# Docs: https://github.com/netbek/skills-sync

# Agents receiving installs; each name is passed to the skills CLI as an -a flag:
agents: opencode claude-code

# Directories the CLI fills with skill folders. Repeatable. At least one is required; git-ignored
# entries absent from the list below are pruned:
skills-dir: .agents/skills

# Directories of links into the first skills-dir. Repeatable. Dangling or excess git-ignored
# entries are pruned; committed first-party skills get refreshed links here:
links-dir: .claude/skills

# Third-party skills, one entry per line: <owner/repo> [#ref] <skill ...>
# At least one skill name is required; '#' starts a comment.
vercel-labs/skills find-skills
EOF
}

@test "config prints the starter config to stdout and exits 0" {
    run_sync --root "$SANDBOX" config
    assert_status 0
    starter_golden >"$SANDBOX/expected-out"
    assert_out_equals_file "$SANDBOX/expected-out"
    assert_err_equals_file /dev/null
}

@test "config works without a config file, git repo or skills binary" {
    # No skills.conf, no git init, no node_modules in the sandbox.
    run_sync --root "$SANDBOX" config
    assert_status 0
    starter_golden >"$SANDBOX/expected-out"
    assert_out_equals_file "$SANDBOX/expected-out"
}
