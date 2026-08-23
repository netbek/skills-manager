#!/usr/bin/env bats
# Argument-parsing behavior shared by all four commands.

load 'helpers.sh'

setup() {
    setup_sandbox
}

teardown() {
    teardown_sandbox
}

usage_golden() {
    cat <<'EOF'
usage: skills-sync config
       skills-sync install [--force] [--config FILE] [--root DIR] [--checksum FILE]
       skills-sync uninstall [--config FILE] [--root DIR] [--checksum FILE]
       skills-sync agents-md [--config FILE] [--root DIR]
EOF
}

@test "no command prints usage to stderr and exits 1" {
    run_sync
    assert_status 1
    assert_out_equals_file /dev/null
    usage_golden >"$SANDBOX/expected-err"
    assert_err_equals_file "$SANDBOX/expected-err"
}

@test "unknown command prints usage and exits 1" {
    run_sync deploy
    assert_status 1
    assert_err_contains 'usage: skills-sync config'
    assert_out_equals_file /dev/null
}

@test "unknown flag prints usage and exits 1" {
    run_sync install --frobnicate
    assert_status 1
    assert_err_contains 'usage: skills-sync config'
}

@test "second command prints usage and exits 1" {
    run_sync config uninstall
    assert_status 1
    assert_err_contains 'usage: skills-sync config'
}

@test "missing option value prints usage and exits 1" {
    run_sync install --config
    assert_status 1
    assert_err_contains 'usage: skills-sync config'

    run_sync uninstall --root
    assert_status 1
    assert_err_contains 'usage: skills-sync config'

    run_sync install --checksum
    assert_status 1
    assert_err_contains 'usage: skills-sync config'
}
