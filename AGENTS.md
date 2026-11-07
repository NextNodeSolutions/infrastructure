# Rules for changing this repository

These are the rules for changing the `Checks` workflow, for people and agents alike. The README explains what the workflow does; this file says what must stay true and why.

## What the workflow guarantees

A change that weakens one is wrong, even when it compiles.

1. **One workflow serves every project.** A project repository holds no workflow file; what a project must express goes through its root `package.json`. Reason: a per-project copy drifts, and a fleet-wide fix must land in one place.
2. **The workflow runs only what the repository declares.** No package.json means nothing to check and a green run; a script that does not exist is not a check; a workspace package is checked only when the change can reach it. Reason: a check that cannot apply either fails for a wrong reason or hides behind an "optional" flag, and both teach people to ignore red.
3. **Selection follows the package graph.** Changed packages and their transitive dependents, through the package manager's own filter; a root file selects everything. Reason: path filters cannot see that a shared package feeds an app, and a workflow-level path filter leaves required checks pending forever.
4. **Discovery refuses before any job installs.** A missing `packageManager` or `engines.node` fails the Discover job with an annotation naming the field. Reason: one message that says what to add beats five jobs failing the same way.
5. **No secret enters the workflow.** Permissions are `contents: read`, no `secrets.` reference exists, and the checkout keeps no credential. Reason: the jobs run the project's code, its dependencies and their lifecycle scripts; whatever the job holds, that code holds too. A check that needs a secret belongs to the deployment pipeline.
6. **A value from a matrix, an output or an input reaches a shell step as an environment variable**, never as text of the command. Reason: package names and scripts come from the project; as command text they would be shell code written by the project.
7. **Every action is pinned by commit SHA** with the release tag beside it, the runner image by version, the Node version by the project's major. Reason: a tag can move; a SHA cannot.

## Trust boundary

| Trusted | Untrusted |
| --- | --- |
| The job, with the read-only repository token GitHub gives every run | The project's code, its dependencies and their lifecycle scripts, its `.npmrc`, its workspace file, its package names |

The token is never written into the checkout (`persist-credentials` is off) and never referenced by a step. Values the project controls travel as JSON read by `jq`, as `pnpm` arguments, or as quoted environment variables. A package name with shell characters stays a literal string. Reviewing a change means walking that table again: what new thing does the job hold, and which new value from the project reaches a shell.

## Architecture rules

- **Discovery is the only job that reads the repository's shape**, and it reads it with full history checked out. Every other job consumes its outputs. Reason: one place decides, so one job summary explains the decision.
- **The executor is chosen from what the repository contains**, in the order single package, workspace, workspace with `turbo.json`. Reason: a repository that adopts a task runner declares its task graph there, and the workflow should run through it rather than guess the graph.
- **The matrix is JSON produced by discovery and read with `fromJSON`**, with the check job guarded by an empty-matrix condition. Reason: an empty matrix is a workflow error, not a skipped job.
- **Statuses are named after the check and, in a workspace, the package.** The ruleset reads the run's conclusion, not a job name, so names can follow the project. Reason: names that vary per repository cannot be listed in a ruleset.
- **The known scripts live in one map in the discovery step.** Adding a check is adding a script name and its label there. Reason: the matrix, the summary and the statuses all derive from it.

## Code rules

- Shell steps start with `set -euo pipefail` and use bash arrays for arguments built from data.
- JSON is built and read with `jq`, never with string concatenation.
- A step that may not apply is skipped with `if:`, never made to pass with an `--if-present` on a check. `--if-present` is only used on `build` prerequisites, where "no build script" is the normal case.

## Checks

A change to the workflow is tested on the canaries before it merges: point the ruleset's workflow entry at the branch, open a pull request on each canary, cite the runs in this repository's pull request, then point the ruleset back at `main`. Two canaries exist because the workflow has two shapes: `canary` is a single package, `canary-workspace` is a pnpm workspace whose shared package feeds an app, so a pull request there shows the selection and the prerequisite build. A pull request on the workspace canary that changes one app must select that app alone; one that changes the shared package must select it and the app.

## Commits

One intention per commit, as a Conventional Commit: `ci(scope): what changed` for the workflow, `docs: what changed` for documentation alone. Documentation that a change makes wrong is updated in the same commit.

## Documentation

The README and this file describe intent and rules, never the current inventory: no action versions, no list of repositories, no copy of a value the workflow sets. Script names and `package.json` fields stay, because they are the contract a project writes against.

**The docs describe the intended behavior.** That covers the README and this file. When a change makes them wrong, do not just rewrite them to match. First check that the change is expected: the task asks for it, or the user confirms it.
- If it is expected, update the docs in the same commit as the change.
- If it is not, the docs win. Bring the code back in line with them, or stop and ask.

## Working against real systems

The organization ruleset and the canary repository are shared state. Pointing the ruleset at a branch changes what every listed repository runs; do it for a test, say so, and point it back at `main` when the test ends. A pull request opened on the canary for a test is closed afterwards.

## Extending

- **A new check**: add the script name and its label to the map in discovery. The status, the summary and the matrix follow.
- **A new executor**: add its detection to discovery and one arm to the `case` of the check and build steps. The arm receives the package and script as environment variables and must honor the project's task graph.
- **A new root file that invalidates everything**: add it to the root file list in discovery, with the reason every package depends on it.
