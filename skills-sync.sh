#!/bin/bash
set -euo pipefail

usage() {
    echo "usage: skills-sync config
       skills-sync install [--force] [--config FILE] [--root DIR] [--checksum FILE]
       skills-sync uninstall [--config FILE] [--root DIR] [--checksum FILE]
       skills-sync agents-md [--config FILE] [--root DIR]" >&2
}

action=
force=0
opt_config=
opt_root=
opt_checksum=
while [ $# -gt 0 ]; do
    case $1 in
        config | install | uninstall | agents-md)
            if [ -n "$action" ]; then
                usage
                exit 1
            fi
            action=$1
            ;;
        --force) force=1 ;;
        --config)
            if [ $# -lt 2 ]; then
                usage
                exit 1
            fi
            opt_config=$2
            shift
            ;;
        --root)
            if [ $# -lt 2 ]; then
                usage
                exit 1
            fi
            opt_root=$2
            shift
            ;;
        --checksum)
            if [ $# -lt 2 ]; then
                usage
                exit 1
            fi
            opt_checksum=$2
            shift
            ;;
        *)
            usage
            exit 1
            ;;
    esac
    shift
done
case $action in
    config | install | uninstall | agents-md) ;;
    *)
        usage
        exit 1
        ;;
esac

# Nearest ancestor holding .git or package.json; falls back to the working directory.
find_root() {
    local dir=$PWD
    while :; do
        if [ -e "$dir/.git" ] || [ -f "$dir/package.json" ]; then
            printf '%s\n' "$dir"
            return 0
        fi
        if [ "$dir" = / ]; then
            printf '%s\n' "$PWD"
            return 0
        fi
        dir=$(dirname "$dir")
    done
}

# Find the skills CLI: the repo's own copy first, else one bundled beside this script.
find_skills() {
    local dir
    if [ -x "$root_dir/node_modules/.bin/skills" ]; then
        printf '%s\n' "$root_dir/node_modules/.bin/skills"
        return 0
    fi
    # Walk up from this install, so bundled copies work under pnpm's isolated node_modules.
    dir=$(dirname "$(realpath "${BASH_SOURCE[0]}")")
    while :; do
        if [ -x "$dir/node_modules/.bin/skills" ]; then
            printf '%s\n' "$dir/node_modules/.bin/skills"
            return 0
        fi
        if [ "$dir" = / ]; then
            return 1
        fi
        dir=$(dirname "$dir")
    done
}

root_dir=$(realpath "${opt_root:-$(find_root)}")
cd "$root_dir"

config_file=${opt_config:-skills.conf}

# config stops here: it only prints a starter config, so the missing-config error below never
# applies to it.
if [ "$action" = config ]; then
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
    exit 0
fi

if [ ! -f "$config_file" ]; then
    echo "error: no config at $root_dir/$config_file" >&2
    exit 1
fi
config_file=$(realpath "$config_file")

checksum_file=${opt_checksum:-.skills.checksum}

# Directives may repeat; values on one line split on spaces. Everything else is a skill entry.
agents=()
skills_dirs=()
links_dirs=()
skill_lines=()
while IFS= read -r line || [ -n "$line" ]; do
    case $line in
        '' | \#*) continue ;;
        'agents:'* | 'skills-dir:'* | 'links-dir:'*)
            key=${line%%:*}
            read -r -a values <<<"${line#*:}"
            case $key in
                agents) agents+=("${values[@]}") ;;
                skills-dir) skills_dirs+=("${values[@]}") ;;
                links-dir) links_dirs+=("${values[@]}") ;;
            esac
            ;;
        *) skill_lines+=("$line") ;;
    esac
done <"$config_file"

# The first skills-dir anchors first-party detection and backs the maintained links.
skills_dir=
for dir in "${skills_dirs[@]}"; do
    if [ -n "$dir" ]; then
        skills_dir=$dir
        break
    fi
done
if [ -z "$skills_dir" ]; then
    echo "error: $config_file declares no skills-dir" >&2
    exit 1
fi

# Print the names of first-party skills: subdirectories of the first skills-dir that git does not
# ignore. Needs a work tree; without one nothing counts as first-party.
first_party_names() {
    local entry
    [ "$first_party_guard" -eq 1 ] || return 0
    for entry in "$skills_dir"/*/; do
        [ -d "$entry" ] || continue
        if ! git check-ignore -q "$entry"; then
            basename "$entry"
        fi
    done
}

# Refresh the maintained links for a first-party skill so its committed copy stays visible.
refresh_links() {
    local skill=$1 dir target
    for dir in "${links_dirs[@]}"; do
        [ -n "$dir" ] || continue
        target=$(realpath --relative-to="$dir" "$skills_dir")/"$skill"
        ln -sfn "$target" "$dir/$skill"
    done
}

# Sweep link directories first, while their targets still exist, so the two failure modes stay
# distinct: a dangling link means the target skill is gone; a git-ignored link absent from the
# desired list is excess. Committed first-party links are neither, so they survive both tests.
prune_links() {
    local desired=$1 dir entry name
    for dir in "${links_dirs[@]}"; do
        [ -n "$dir" ] || continue
        for entry in "$dir"/*; do
            # No -e test for symlinks: a dangling link fails -e but still needs pruning.
            [ -e "$entry" ] || [ -L "$entry" ] || continue
            name=$(basename "$entry")
            if [ -L "$entry" ] && [ ! -e "$entry" ]; then
                echo "removing dangling skill link: $name" >&2
            elif git check-ignore -q "$entry" && ! printf '%s' "$desired" | grep -qFx "$name"; then
                echo "uninstalling excess skill link: $name" >&2
            else
                continue
            fi
            rm -rf "$entry"
        done
    done
}

# Remove git-ignored skills absent from the desired list. First-party directories are not
# git-ignored, so they are never touched here.
prune_skill_dirs() {
    local desired=$1 dir name
    for dir in "${skills_dirs[@]}"; do
        [ -n "$dir" ] || continue
        for entry in "$dir"/*/; do
            [ -d "$entry" ] || continue
            name=$(basename "$entry")
            git check-ignore -q "$entry" || continue
            if ! printf '%s' "$desired" | grep -qFx "$name"; then
                echo "uninstalling excess skill: $name" >&2
                rm -rf "$entry"
            fi
        done
    done
}

# Print stdin with every occurrence of $1 replaced by $2.
fill() {
    local from=$1 to=$2 body
    body=$(cat)
    printf '%s\n' "${body//$from/$to}"
}

# Print names of direct node_modules dependencies shipping a skills directory, sorted. Scoped
# packages sit one level deeper; globs skip dot-directories like .pnpm.
discover_packages() {
    local entry
    for entry in node_modules/* node_modules/@*/*; do
        [ -d "$entry/skills" ] || continue
        printf '%s\n' "${entry#node_modules/}"
    done | LC_ALL=C sort -u
}

# True when $1 holds at least one skill folder with a SKILL.md.
has_skills() {
    local f
    for f in "$1"/*/SKILL.md; do
        [ -f "$f" ] && return 0
    done
    return 1
}

# Print the name of the first skill under $1: the frontmatter name of its first SKILL.md in glob
# order, else the folder basename.
first_skill_name() {
    local f
    for f in "$1"/*/SKILL.md; do
        [ -f "$f" ] || continue
        awk -v base="$(basename "${f%/SKILL.md}")" '
            NR == 1 && /^---\r?$/ { fm = 1; next }
            !fm { exit }
            /^---\r?$/ || /^\.\.\.\r?$/ { exit }
            {
                sub(/\r$/, "")
                if ($0 ~ /^name:/) {
                    n = $0
                    sub(/^name:[ \t]*/, "", n)
                    gsub(/^"/, "", n)
                    gsub(/"[ \t]*$/, "", n)
                }
            }
            END {
                sub(/[ \t]+$/, "", n)
                if (n == "") n = base
                print n
            }
        ' "$f"
        return
    done
}

# Emit a markdown table row per skill folder under $1 holding a SKILL.md: name and description
# parsed from the YAML frontmatter, path relative to the repo root. The folder name stands in for
# a missing name; multiline descriptions fold onto one line; pipes are escaped.
emit_skills_table() {
    local dir=$1 f
    printf '| Skill | Path | Description |\n'
    printf '|-------|------|-------------|\n'
    for f in "$dir"/*/SKILL.md; do
        [ -f "$f" ] || continue
        awk -v path="${f%/SKILL.md}" -v base="$(basename "${f%/SKILL.md}")" '
            NR == 1 && /^---\r?$/ { fm = 1; next }
            !fm { exit }
            /^---\r?$/ || /^\.\.\.\r?$/ { exit }
            {
                sub(/\r$/, "")
                if ($0 ~ /^name:/) {
                    n = $0
                    sub(/^name:[ \t]*/, "", n)
                    gsub(/^"/, "", n)
                    gsub(/"[ \t]*$/, "", n)
                } else if ($0 ~ /^description:/) {
                    d = $0
                    sub(/^description:[ \t]*([>|][+-]?)?[ \t]*/, "", d)
                    collecting = 1
                } else if (collecting && /^[ \t]/) {
                    sub(/^[ \t]+/, "")
                    d = (d == "" ? $0 : d " " $0)
                } else {
                    collecting = 0
                }
            }
            END {
                sub(/[ \t]+$/, "", n)
                sub(/[ \t]+$/, "", d)
                if (n == "") n = base
                gsub(/\|/, "\\|", d)
                printf "| `%s` | `%s` | %s |\n", n, path, d
            }
        ' "$f"
    done
}

# Render the AGENTS.md skill catalog to stdout: fixed prose around a table of first-party skills,
# then one section per package that ships skills under node_modules.
render_agents_md() {
    local pkg dir
    printf '# AGENTS.md\n\n'
    printf '## Project skills\n\n'
    fill '{SKILLS_DIR}' "$skills_dir" <<'EOF'
Load any skill below with the `skill` tool by name (e.g., `skill find-skills`), or read its `SKILL.md` directly (e.g., `read {SKILLS_DIR}/find-skills/SKILL.md`). If `{SKILLS_DIR}/` is empty, run `pnpm exec skills-sync install` to populate it (see [skills-sync docs](https://github.com/netbek/skills-sync)).
EOF
    if has_skills "$skills_dir"; then
        printf '\n'
        emit_skills_table "$skills_dir"
    fi
    while IFS= read -r pkg; do
        [ -n "$pkg" ] || continue
        dir="node_modules/$pkg/skills"
        has_skills "$dir" || continue
        printf '\n## Package skills: %s\n\n' "$pkg"
        fill '{PACKAGE_NAME}' "$pkg" <<'EOF' | fill '{SKILL}' "$(first_skill_name "$dir")"
The `{PACKAGE_NAME}` package ships skills under `node_modules/{PACKAGE_NAME}/skills/`. Use the `read` tool to load `SKILL.md` files directly (e.g., `read node_modules/{PACKAGE_NAME}/skills/{SKILL}/SKILL.md`).
EOF
        printf '\n'
        emit_skills_table "$dir"
    done < <(discover_packages)
}

if [ "$action" = agents-md ]; then
    # Pin collation, so glob-expanded skill tables render identically on every machine.
    export LC_ALL=C
    render_agents_md
    exit 0
fi

if [ "$action" = uninstall ]; then
    # git check-ignore tells first-party from installed skills; needs a work tree. Without one,
    # removals cannot spare committed skills, so do nothing.
    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        echo "warning: outside a git work tree; refusing to uninstall any skills" >&2
        exit 0
    fi
    prune_links ""
    prune_skill_dirs ""
    # Drop the checksum, so the next install rebuilds from scratch instead of trusting stale state.
    rm -f "$checksum_file"
    # The lock file tracks installed skills; once they are gone it is stale.
    rm -f skills-lock.json
    exit 0
fi

# git check-ignore tells first-party from installed skills; needs a work tree.
first_party_guard=1
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || first_party_guard=0

# Hash the config bytes and the first-party names, so edits to either trigger a pass while edits
# elsewhere never do.
hash=$(sha256sum "$config_file" | cut -d " " -f 1)
fp_hash=$(first_party_names | sha256sum | cut -d " " -f 1)
up_to_date=0
if [ "$force" -eq 0 ] && [ -f "$checksum_file" ] && grep -qx "$hash" "$checksum_file" &&
    grep -qx "$fp_hash" "$checksum_file"; then
    up_to_date=1
    for dir in "${skills_dirs[@]}"; do
        [ -n "$dir" ] || continue
        if [ ! -d "$dir" ]; then
            up_to_date=0
            break
        fi
    done
fi
if [ "$up_to_date" -eq 1 ]; then
    exit 0
fi

skills_bin=$(find_skills) || {
    echo "warning: no skills binary here or beside skills-sync; install dependencies first" >&2
    exit 0
}

for dir in "${skills_dirs[@]}" "${links_dirs[@]}"; do
    [ -n "$dir" ] || continue
    mkdir -p "$dir"
done

agent_args=()
for agent in "${agents[@]}"; do
    [ -n "$agent" ] || continue
    agent_args+=(-a "$agent")
done
agent_args+=(-y)

failed=0
desired=""
for line in "${skill_lines[@]}"; do
    read -r repo names <<<"$line"
    case $repo in "" | \#*) continue ;; esac
    if [ -z "$names" ]; then
        echo "warning: $repo lists no skill names; entry skipped" >&2
        continue
    fi
    args=("${agent_args[@]}")
    selected=0
    for skill in $names; do
        dest="$skills_dir/$skill"
        if [ "$first_party_guard" -eq 1 ] && [ -d "$dest" ] && ! git check-ignore -q "$dest"; then
            # First-party skill: never reinstalled; the sweep below maintains its links.
            continue
        fi
        args+=(--skill "$skill")
        desired="$desired$skill"$'\n'
        selected=$((selected + 1))
    done
    if [ "$selected" -eq 0 ]; then
        continue
    fi
    # </dev/null stops the CLI from consuming the rest of the config, which the loop reads.
    if ! "$skills_bin" add "$repo" "${args[@]}" </dev/null; then
        echo "warning: could not install skills from $repo (offline?)" >&2
        failed=1
    fi
done

# Every committed skill gets a refreshed link in each links-dir, whether or not the config lists
# it, and its name joins the desired list so pruning spares the fresh links.
for skill in $(first_party_names); do
    refresh_links "$skill"
    desired="$desired$skill"$'\n'
done

prune_links "$desired"
prune_skill_dirs "$desired"

mkdir -p "$(dirname "$checksum_file")"
printf '%s\n%s\n' "$hash" "$fp_hash" >"$checksum_file"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && ! git check-ignore -q "$checksum_file"; then
    echo "warning: add $checksum_file to .gitignore" >&2
fi

if [ "$failed" -ne 0 ]; then
    echo "warning: some skills failed to install; check your connection and rerun" >&2
fi
exit 0
