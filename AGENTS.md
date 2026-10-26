# Rules for changing this repository

These rules hold for people and agents alike. A directory whose rules differ adds its own `AGENTS.md`. How the platform works is explained in [docs/architecture.md](docs/architecture.md).

## What the project guarantees

A change that weakens one is wrong, even when it compiles.

1. **Every project runs the configuration from `main`.** A merge here is a release to every NextNode project at once. `main` accepts pull requests only, with a squash merge, under the organization rulesets.
2. **No secret value exists in this repository, in CircleCI, or in a log.** A job obtains secrets at run time by trading its OIDC token for a short-lived vault token. No CircleCI context exists, so nothing can be hidden in one.
3. **A branch pipeline touches no secret.** Only jobs that run on `main` log in to the vault, so a pull request from any author is safe to run.
4. **Project code never runs with the job token or the vault token in its environment.** Install, build and migration commands run after the vault step has ended, with the OIDC variables removed.
5. **An application's production secrets are read only by the production deployment job.** That job runs on `main` only, after the approval when the project has a development environment, and straight after the checks when it has none. The vault cannot tell the deployment jobs apart, so this configuration is what does.
6. **A project repository holds no CI file.** Its pipeline definition points at this repository. Anything a project must express goes through `nextnode.toml` or its package scripts.

## Architecture rules

- **Keep the configuration one static file, plus the setup stage that reads `nextnode.toml`.** Every project runs the same workflow. Behavior differs through the pipeline parameters the setup stage produces, never through a second file or a per-project branch of the configuration. The Pulumi program is the platform package of this repository, cloned by the deployment job at the `program_ref` pipeline parameter, which the canary script sets to the pull request's branch.
- **Pulumi owns every resource it can express. Wrangler only bundles and uploads the Worker.** Resource creation that happens outside Pulumi is invisible to the state and will be fought by the next run. Wrangler is the Cloudflare port of the deployment, and another target gets its own port behind the same job.
- **Project code runs as the project user, platform tools as the platform user.** A new step that runs anything from the project repository goes through `project-run`. A step that holds a platform credential never runs project code and reads only what the repository committed, which is why the committed Wrangler configuration is restored and named to Wrangler before it runs, and why a build command in it is refused.
- **A value the project controls never reaches a shell as code.** Values from `nextnode.toml` or from a deployment go through the platform's JSON files and `nn`, never into `BASH_ENV`, an `eval`, or an unquoted expansion. The one exception is the migration command, which is the project's own command run as the project user. A file the platform writes once the project user exists goes under the platform user's own directory, never in a shared place, and a directory the platform loads code from is recreated empty first.
- **Migrations are the project's command, named in `nextnode.toml`.** The platform does not know the project's migration tool and must not guess it.
- **Identifiers that are not secret still never reach a project repository as copies.** They live in the vault, in the registration script, or in this configuration, so that a rename happens in one place.
- **A vendor workaround is written next to the vendor fact that forced it.** The constraints table in the architecture page names where to re-check each fact. Remove the workaround when the fact changes, in the same change.

## Code rules

- **In a `run` step, escape a heredoc marker as `\<<`.** CircleCI reserves `<<` in configuration files and fails the pipeline otherwise.
- **Write a `run` step on one line when its name would repeat its command.** A named step earns its name by explaining something the command does not.
- **Pin the executor image by tag and every platform tool by exact version.** A floating version changes the toolchain under every project at once. The cache key is made of those versions, so a bump rebuilds the cache on its own. The Pulumi CLI and the Cloudflare plugin are pinned in the pipeline file at the versions the platform package pins for their SDKs: bump the four together, the driver refuses a drift.
- **The platform package is checked with its own tooling before a pull request.** Its type check runs locally, and the driver runs locally against the canary's stack in preview mode with the platform's secrets in the environment.
- **Comments are in English and explain intent, not syntax.** The file is read by people who did not write it, in every project's pipeline view.
- **Keep the install step strict.** The pnpm version comes from the project's `packageManager` field, accepted only as a plain version, and the lockfile is frozen. A project that drifts fails loudly at the first step instead of deploying something else.

## Checks

There is no local validator for the configuration in this repository. A change to a pipeline file is checked by running the canary's pipeline from the branch, through the CircleCI API with the configuration branch set to the pull request branch and the checkout set to the canary's `main`, and by reading the job outputs. A green canary run is the check that a pull request cites.

A documentation change is checked with the docs checker of the `project-docs` skill, which renders every Mermaid block and follows every relative link.

## Commits

One intention per commit, in the conventional form the history shows, such as `ci:` for pipeline files and `docs:` for documentation. Pull requests are squash-merged, so the pull request title becomes the commit on `main` and must read as one.

## Documentation

The docs carry concepts, flows, states, rules and reasons. They never copy what the repository already says. A line fails if the code can change without a change of intent and make the line false. Identifiers of shared external resources are the one exception, kept on the architecture page until the registration script owns them.

**The docs describe the intended behavior.** That covers `docs/`, the README and the `AGENTS.md` files. When a change makes them wrong, do not just rewrite them to match. First check that the change is expected: the task asks for it, or the user confirms it.
- If it is expected, update the docs in the same commit as the change.
- If it is not, the docs win. Bring the code back in line with them, or stop and ask.

## Working against real systems

- **The canary repository is free to use, always.** Push, merge, rerun, break it. It exists for end-to-end runs of this configuration and holds nothing else.
- **The CircleCI organization, the Infisical organization and the Cloudflare account are shared state.** Creating, renaming or deleting anything there that is not the canary's needs the user's go-ahead first, and a cleanup afterwards. List before acting, act on exact identifiers, list again to show the result.
- **Secret values enter through the Infisical dashboard or a non-echoing prompt, never through a chat, an argument, a log or a file.** Verify a write by its name, never by its value. A value that was displayed is compromised and gets rotated.
- **Deleting an Infisical identity that has delete protection takes two calls.** Send its name together with `hasDeleteProtection: false`, because the flag alone is ignored, then delete.

## Extending

- **A new job** goes into the single workflow with its `requires` chain and, when it needs the vault, the same login and export steps as the deployment job. It is validated on the canary before merge.
- **A new resource kind** is a Pulumi resource keyed by a `nextnode.toml` entry, written in the platform package's program, with its identifier returned as a stack output for the Worker bindings. Its failure mode is added to the table on the architecture page.
- **A new deployment target** is a port beside the Wrangler one, behind the same job and the same `nextnode.toml` keys where they apply.
- **A new project** is registered by the registration script, never by clicking through the three dashboards.
