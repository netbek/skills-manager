#!/usr/bin/env bats
# skills-sync agents-md: renders the AGENTS.md catalog from the first skills-dir
# and node_modules packages shipping skills. Needs a config but no git repo.

load 'helpers'

setup() {
    setup_sandbox
    write_config skills.conf <<'EOF'
skills-dir: .agents/skills
EOF
}

teardown() {
    teardown_sandbox
}

write_skill() { # write_skill <dir> <name> <description>
    mkdir -p "$SANDBOX/$1"
    cat >"$SANDBOX/$1/SKILL.md" <<EOF
---
name: $2
description: $3
---
Body of $2.
EOF
}

@test "renders header prose with the skills dir substituted and no table when empty" {
    mkdir -p "$SANDBOX/.agents/skills"

    run_sync --root "$SANDBOX" agents-md
    assert_status 0

    assert_out_contains '# AGENTS.md'
    assert_out_contains '## Project skills'
    assert_out_contains 'read .agents/skills/find-skills/SKILL.md'
    assert_out_not_contains '{SKILLS_DIR}'
    assert_out_not_contains '|-------|'
}

@test "renders a table row per first-party skill with names and descriptions" {
    write_skill .agents/skills/alpha alpha 'Alpha does things'
    write_skill .agents/skills/beta beta 'Beta | escapes pipes'

    run_sync --root "$SANDBOX" agents-md
    assert_status 0

    assert_out_contains '| Skill | Path | Description |'
    assert_out_contains '| `alpha` | `.agents/skills/alpha` | Alpha does things |'
    assert_out_contains '| `beta` | `.agents/skills/beta` | Beta \| escapes pipes |'
}

@test "renders one section per package that ships skills, none for bare packages" {
    write_skill node_modules/pkg-a/skills/wizard wizard 'Wizard casts spells'
    write_skill 'node_modules/@scope/pkg-b/skills/gadget' gadget 'Gadget tinkers'
    mkdir -p "$SANDBOX/node_modules/pkg-c/lib"

    run_sync --root "$SANDBOX" agents-md
    assert_status 0

    assert_out_contains '## Package skills: pkg-a'
    assert_out_contains 'The `pkg-a` package ships skills under `node_modules/pkg-a/skills/`.'
    assert_out_contains 'read node_modules/pkg-a/skills/wizard/SKILL.md'
    assert_out_contains '| `wizard` | `node_modules/pkg-a/skills/wizard` | Wizard casts spells |'

    assert_out_contains '## Package skills: @scope/pkg-b'
    assert_out_contains 'read node_modules/@scope/pkg-b/skills/gadget/SKILL.md'

    assert_out_not_contains 'pkg-c'
}

@test "folds multiline descriptions and falls back to folder names" {
    # No name field: the folder basename stands in; folded description joins with spaces.
    mkdir -p "$SANDBOX/.agents/skills/gamma"
    cat >"$SANDBOX/.agents/skills/gamma/SKILL.md" <<'EOF'
---
description: >
  Folded one.
  Folded two.
---
Body.
EOF
    # No frontmatter at all: empty description cell, folder name as skill name.
    mkdir -p "$SANDBOX/.agents/skills/delta"
    printf 'Plain body.\n' >"$SANDBOX/.agents/skills/delta/SKILL.md"

    run_sync --root "$SANDBOX" agents-md
    assert_status 0

    assert_out_contains '| `gamma` | `.agents/skills/gamma` | Folded one. Folded two. |'
    assert_out_contains '| `delta` | `.agents/skills/delta` |  |'
}
