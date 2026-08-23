# skills-sync

Install and uninstall third-party agent skills from a declarative config.

## Why

The `skills` CLI installs skills but keeps no per-repo record of what should be installed.
`skills-sync` adds that record: a committed `skills.conf` lists the agents and skills a repo wants.
Running install brings the checkout back in line — installing what's missing and removing what's
gone from the list. If nothing changed, it does nothing.

## Install

Add the package as a dev dependency:

```shell
pnpm add -D @netbek/skills-sync   # or: npm i -D / yarn add -D
```

## Configure

1. Run `skills-sync config > skills.conf` to write a starter config to your repo root:

    ```shell
    agents: opencode claude-code      # passed to the skills CLI as -a flags
    skills-dir: .agents/skills        # repeatable; CLI-filled directories this tool prunes
    links-dir: .claude/skills         # repeatable; link directories this tool maintains

    owner/repo [#ref] skill ...       # third-party entries; '#' starts a comment
    ```

    Rules:

    * At least one `skills-dir` is required. It anchors first-party detection: a skill directory that
      is committed (not git-ignored) is never overwritten or removed.
    * `skills-dir` entries are swept for git-ignored skills absent from the config; those are removed.
    * `links-dir` entries hold links into the first `skills-dir`. Dangling links are pruned; excess
      git-ignored links are pruned; every first-party skill gets a refreshed link in each directory,
      whether or not the config lists it. Commit a link to make its skill first-party for Claude Code
      too.

2. **Optional:** Disable telemetry. The underlying `skills` CLI sends [anonymous usage telemetry](https://github.com/vercel-labs/skills/blob/v1.5.16/README.md#telemetry).
    Because `skills-sync` shells out to that CLI, disable it by setting an environment variable wherever `skills-sync install` runs:

    ```shell
    export DISABLE_TELEMETRY=1      # preferred
    export DO_NOT_TRACK=1           # alternative
    ```

    **mise** (`mise.toml`):

    ```toml
    [env]
    DISABLE_TELEMETRY = "1"
    ```

    **Nix flake** (`flake.nix` devShell):

    ```nix
    devShells.default = pkgs.mkShell {
      env.DISABLE_TELEMETRY = "1";
    };
    ```

3. Run `skills-sync install` to install the skills listed in `skills.conf`.

4. Configure `.gitignore`:

    ```gitignore
    # Generated state
    .skills.checksum
    skills-lock.json

    # Third-party agent skills are ignored
    .agents/skills/*

    # First-party agent skills are un-ignored and committed. Uncomment one line per skill:
    # !.agents/skills/my-skill/

    # Generated links are ignored
    .claude/skills/*
    ```

5. **Optional:** Run `skills-sync agents-md > AGENTS.md` to write an `AGENTS.md` to your repo root.

## Commands

| Command      | Purpose                                                        |
|--------------|----------------------------------------------------------------|
| `config`     | Print a starter `skills.conf` to stdout                        |
| `install`    | Install listed skills; prune dropped git-ignored ones          |
| `uninstall`  | Remove all git-ignored skills and generated state              |
| `agents-md`  | Print a markdown catalog of installed skills for `AGENTS.md`   |

### `skills-sync config`

```shell
skills-sync config
```

Print a starter `skills.conf` to stdout. Redirect it into a file, e.g. `skills-sync config >
skills.conf`.

### `skills-sync install`

```shell
skills-sync install [--force] [--config FILE] [--root DIR] [--checksum FILE]
```

Install listed skills; prune git-ignored ones the config dropped. Skips all work when the
hashes in `.skills.checksum` (config bytes, first-party skill names) match and the `skills-dirs`
exist. `--force` reinstalls.
Safe to run on shell entry: without `node_modules` or a network it warns and exits 0.

### `skills-sync uninstall`

```shell
skills-sync uninstall [--config FILE] [--root DIR] [--checksum FILE]
```

Remove every git-ignored skill, its links, `.skills.checksum`, and `skills-lock.json`. First-party
skills survive. Refuses to act outside a git work tree, where first-party detection fails.

### `skills-sync agents-md`

```shell
skills-sync agents-md [--config FILE] [--root DIR]
```

Print markdown cataloging installed skills for AGENTS.md: a table of the first `skills-dir`'s
skills, then a section per `node_modules` package that ships a `skills/` directory. Redirect it
into a file, e.g. `skills-sync agents-md > AGENTS.md`.

## Layout assumptions

The repo root is found by walking up from the working directory to the nearest ancestor holding
`.git` or `package.json`. Agents other than the defaults need no code changes unless they keep
skills outside a declared `skills-dir` or `links-dir`.

## License

Copyright (c) 2026 Hein Bekker. Licensed under the GNU Affero General Public License, version 3.
