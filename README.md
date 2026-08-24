# skills-manager

Install and uninstall third-party agent skills from a declarative config.

## Why

The `skills` CLI installs skills but keeps no per-repo record of what should be installed.
`skills-manager` adds that record: a committed `skills-manager.yaml` lists the agents and skills a repo wants.
Running install brings the checkout back in line — installing what's missing and removing what's
gone from the list. If nothing changed, it does nothing.

## Install

Add the package as a dev dependency:

```shell
pnpm add -D @netbek/skills-manager   # or: npm i -D / yarn add -D
```

## Configure

1. Run `skills-manager config > skills-manager.yaml` to write a starter config to your repo root:

    ```yaml
    # Agents to install skills for. See https://github.com/netbek/skills-manager#supported-agents
    agents:
      - opencode
      - claude-code

    # Directories the CLI fills with skills. At least one is required.
    # git-ignored entries absent from the list below are pruned.
    skills-dirs:
      - .agents/skills

    # Symlink dirs that mirror the first skills-dirs entry. The CLI removes
    # dangling or leftover git-ignored links and refreshes links to committed
    # first-party skills.
    links-dirs:
      - .claude/skills

    # Third-party skills. Each entry needs a repo, an optional ref, and at least
    # one skill. See https://github.com/netbek/skills-manager#source-formats
    repos:
      - repo: vercel-labs/skills
        # ref: v1.2.3
        skills:
          - find-skills
    ```

    Rules:

    * At least one `skills-dirs` entry is required. It anchors first-party detection: a skill directory that
      is committed (not git-ignored) is never overwritten or removed.
    * `skills-dirs` entries are swept for git-ignored skills absent from the config; those are removed.
    * `links-dirs` entries mirror the first `skills-dirs` entry via symlinks. Dangling links are pruned; excess
      git-ignored links are pruned; every first-party skill gets a refreshed link in each directory,
      whether or not the config lists it. Commit a link to make its skill first-party for Claude Code
      too.
    * Each `repos` entry is installed via the underlying CLI as `<repo>` or `<repo>#<ref>` when a ref is set.
      `repo` accepts any `skills` source; see [Source formats](#source-formats) for the complete list.
    * The config is validated strictly: unknown keys, missing fields and malformed values fail with an error.

2. **Optional:** Disable telemetry. The underlying `skills` CLI sends [anonymous usage telemetry](https://github.com/vercel-labs/skills/blob/v1.5.16/README.md#telemetry).
    Because `skills-manager` shells out to that CLI, disable it by setting an environment variable wherever `skills-manager install` runs:

    ```shell
    export DISABLE_TELEMETRY=1      # preferred
    export DO_NOT_TRACK=1           # alternative
    ```

    mise (`mise.toml`):

    ```toml
    [env]
    DISABLE_TELEMETRY = "1"
    ```

    Nix flake (`flake.nix` devShell):

    ```nix
    devShells.default = pkgs.mkShell {
      env.DISABLE_TELEMETRY = "1";
    };
    ```

3. Run `skills-manager install` to install the skills listed in `skills-manager.yaml`.

4. Configure `.gitignore`:

    ```gitignore
    # Generated state
    skills-lock.json

    # Third-party agent skills are ignored
    .agents/skills/*

    # First-party agent skills are un-ignored and committed. Uncomment one line per skill:
    # !.agents/skills/my-skill/

    # Generated links are ignored
    .claude/skills/*
    ```

5. **Optional:** Run `skills-manager agents-md > AGENTS.md` to write an `AGENTS.md` to your repo root.

### Supported agents

Each `agents` entry is passed to the underlying `skills` CLI as an `-a` flag. Any name from its
[supported agents list](https://github.com/vercel-labs/skills#supported-agents) works.

### Source formats

`repos[].repo` accepts any source the underlying `skills` CLI accepts:

* GitHub shorthand: `vercel-labs/skills`, optionally followed by a skill path,
  e.g. `vercel-labs/skills/skills/find-skills`
* Full GitHub URL: `https://github.com/vercel-labs/skills`
* Direct path to a skill in a repo: `https://github.com/vercel-labs/skills/tree/main/skills/find-skills`
* GitLab URL: `https://gitlab.com/group/repo`
* Any git URL: `git@github.com:vercel-labs/skills.git`
* Local path: `./my-local-skills`

## Commands

| Command      | Purpose                                                        |
|--------------|----------------------------------------------------------------|
| `config`     | Print a starter `skills-manager.yaml` to stdout                |
| `install`    | Install listed skills; prune dropped git-ignored ones          |
| `uninstall`  | Remove all git-ignored skills and generated state              |
| `agents-md`  | Print a markdown catalog of installed skills for `AGENTS.md`   |

### `skills-manager config`

```shell
skills-manager config
```

Print a starter `skills-manager.yaml` to stdout. Redirect it into a file, e.g.
`skills-manager config > skills-manager.yaml`.

### `skills-manager install`

```shell
skills-manager install [--force] [--config FILE] [--root DIR] [--checksum FILE]
```

Install listed skills; prune git-ignored ones the config dropped. Skips all work when the hashes
in `node_modules/.skills-manager.checksum` (config bytes, first-party skill names) match and the
`skills-dirs` exist. `--force` reinstalls.
Safe to run on shell entry: without `node_modules` or a network it warns and exits 0.

### `skills-manager uninstall`

```shell
skills-manager uninstall [--config FILE] [--root DIR] [--checksum FILE]
```

Remove every git-ignored skill, its links, `node_modules/.skills-manager.checksum`, and
`skills-lock.json`. First-party skills survive. Refuses to act outside a git work tree, where
first-party detection fails.

### `skills-manager agents-md`

```shell
skills-manager agents-md [--config FILE] [--root DIR]
```

Print markdown cataloging installed skills for `AGENTS.md`: a table of the first `skills-dirs`
entry's skills, then a section per `node_modules` package that ships a `skills/` directory. Redirect it
into a file, e.g. `skills-manager agents-md > AGENTS.md`.

## Layout assumptions

The repo root is found by walking up from the working directory to the nearest ancestor holding
`.git` or `package.json`. Agents other than the defaults need no code changes unless they keep
skills outside a declared `skills-dirs` or `links-dirs` entry.

## License

Copyright (c) 2026 Hein Bekker. Licensed under the GNU Affero General Public License, version 3.
