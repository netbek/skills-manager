#!/bin/bash
set -euo pipefail

usage() {
    echo "usage: skills-sync init [--force] [--config FILE] [--root DIR]
       skills-sync install [--force] [--config FILE] [--root DIR] [--checksum FILE]
       skills-sync uninstall [--config FILE] [--root DIR] [--checksum FILE]" >&2
}

action=
force=0
opt_config=
opt_root=
opt_checksum=
while [ $# -gt 0 ]; do
    case $1 in
        init | install | uninstall)
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
    init | install | uninstall) ;;
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

# init stops here: it only seeds the config, so the missing-config error below never applies to it.
if [ "$action" = init ]; then
    example_dir=$(dirname "$(realpath "${BASH_SOURCE[0]}")")
    if [ ! -f "$example_dir/skills.conf.example" ]; then
        echo "error: no skills.conf.example beside $example_dir/skills-sync.sh" >&2
        exit 1
    fi
    if [ -e "$config_file" ] && [ "$force" -eq 0 ]; then
        echo "error: $root_dir/$config_file exists; use --force to overwrite" >&2
        exit 1
    fi
    cp "$example_dir/skills.conf.example" "$config_file"
    echo "created $root_dir/$config_file"
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
