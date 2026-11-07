# Rules for changing this repository

These are the rules for changing the `Checks` workflow and the program behind it, for people and agents alike. The README says what a run does and [docs/architecture.md](docs/architecture.md) how the parts fit. This file says what must stay true and why.

## What the project guarantees

A change that weakens one is wrong, even when it compiles.

1. **One workflow serves every project.** A project repository holds no workflow file. What a project must express goes through its root `package.json`. Reason: a per-project copy drifts, and a fleet-wide fix must land in one place.
2. **The workflow file carries no logic.** It names when the workflow runs, what it may touch, which jobs exist, how they depend on each other, the actions it pins, and one line per job that calls the program. Every decision, from reading the manifest to choosing the command a check runs, is made by the program. Reason: the program is type-checked and linted on every pull request of this repository, by this very workflow. Shell written in YAML is checked by nothing until it runs inside every project.
3. **A job runs the program committed beside the workflow file it executes.** Each job fetches this repository at the commit GitHub reports for the workflow that defines the job, and runs the program from that checkout. Reason: a branch under test then runs the branch's program and `main` runs the program of `main`, with no reference to bump and no second copy to publish.
4. **The workflow runs only what the repository declares.** No `package.json` means nothing to check and a green run. A script that does not exist is not a check. A workspace package is checked only when the change can reach it. Reason: a check that cannot apply either fails for a wrong reason or hides behind an "optional" flag, and both teach people to ignore red.
5. **Selection follows the package graph.** Changed packages and their transitive dependents, through the package manager's own filter. A root file selects everything. Reason: path filters cannot see that a shared package feeds an app, and a workflow-level path filter leaves required checks pending forever.
6. **Discovery refuses before any job installs.** A manifest that cannot be read, a missing `packageManager`, a missing or too old `engines.node` fails the Discover job with an annotation on `package.json` naming the field. Reason: one message that says what to add beats five jobs failing the same way.
7. **No secret enters the workflow.** Permissions are `contents: read`, no `secrets.` reference exists, and neither checkout keeps a credential. Reason: the jobs run the project's code, its dependencies and their lifecycle scripts. Whatever the job holds, that code holds too. A check that needs a secret belongs to the deployment pipeline.
8. **A value the project controls never reaches a shell.** Package names, script names and the matrix travel as JSON that a decoder reads and as argument arrays that a child process receives. The one `run` line of a job names no project value. Reason: as command text, a package name would be shell code written by the project.
9. **Everything is pinned.** Actions by commit SHA with the release tag beside it, the runner image by version, the program's own Node by the exact version in `.node-version`, the project's Node by the major its manifest declares. Reason: a tag can move, a SHA cannot.

## Architecture rules

- **The workflow file holds what only GitHub can read.** Triggers, permissions, concurrency, the jobs with their `needs`, `if` and matrix, the pinned actions with their inputs, and an `env` block that hands a matrix entry or an output to the program as one variable. A `run` step is one line that names a command of the program. A second line, a pipe, a condition, a default or a variable set in shell is logic, and logic moves to the program. Reason: guarantee 2 is kept by the shape of the file, which a reviewer checks at a glance.
- **The program runs from its checkout with Node alone.** No runtime dependency, no install, no build step. Node strips the types as it loads the files, so only erasable syntax is allowed and import specifiers carry their `.ts` extension. Reason: an install would run under the project's `.npmrc`, and a build output would be a second copy of the code that the type checker does not see.
- **The program leaves the project tree before anything of the project runs.** Its checkout lands inside the workspace, because that is where GitHub lets a checkout land, and the program's first act moves it to the runner's scratch directory. Reason: the project's lint, format and test tools walk the tree they run in, and a platform file in that tree is a project file to them.
- **The program is in layers, and a dependency points inward.** The domain takes data and returns data: manifests, selections, plans, commands as argument arrays, outputs, the summary. It imports nothing outside itself. An adapter holds one kind of IO, such as files, child processes, git, pnpm or the GitHub channels, and may read the domain's types. A command wires adapters and domain for one job, and the entry point dispatches on the command name. The lint configuration enforces the direction, so a new import that crosses it is a design change, never a rule to relax. Reason: the domain is what a test runs without a runner, and the adapters are what a test replaces.
- **Discovery is the only job that reads the repository's shape**, with full history checked out. Every other job consumes its outputs. Reason: one place decides, so one job summary explains the decision.
- **Discovery acquires pnpm after it has validated the manifest**, at the declared version, through the npm that Node ships. The check and build jobs take pnpm from the pinned action instead, because the dependency cache must find pnpm before Node is set up. Reason: the refusal of a bad `packageManager` must come from the program, with its annotation, not from a tool that read the field first.
- **The executor is chosen from what the repository contains**, in the order single package, workspace, workspace with `turbo.json`. Reason: a repository that adopts a task runner declares its task graph there, and the workflow should run through it rather than guess the graph.
- **The matrix is JSON produced by discovery and read with `fromJSON`**, with the check job guarded by an empty-matrix condition. Reason: an empty matrix is a workflow error, not a skipped job.
- **Statuses are named after the check and, in a workspace, the package.** The ruleset reads the run's conclusion, not a job name, so names can follow the project. Reason: names that vary per repository cannot be listed in a ruleset.
- **The known scripts live in one catalogue in the domain.** Adding a check is adding a script name and its label there. Reason: the matrix, the summary and the statuses all derive from it.
- **Outputs and workflow commands go through the GitHub adapter.** An output is one line, and the adapter refuses a value with a line break. An annotation or a log group escapes its text. Reason: both channels are line protocols that GitHub parses, and a project value with a newline would otherwise write a second output or a second command.

## Code rules

- Formatting, lint rules and compiler options come from the shared standards package. The three config files at the root extend its presets, and the lint config adds the layer restrictions. Fix a finding by redesign, never by disabling the rule.
- A comment states an invariant, an external constraint or a workaround with its reason, in one sentence. Everything else is said by names.
- A child process receives its arguments as an array and never a shell. A command is a value of the domain, built by a table keyed by executor, so the type checker lists every table a new executor must cover.
- Unknown input, which is a manifest, a pnpm listing or a job variable, is decoded at its boundary into a typed value. The rest of the program takes the typed value.
- In the workflow file, a pinned action keeps its release tag in a trailing comment, and a value a job hands to the program goes through `env`, never into the `run` line.

## Checks

- `pnpm lint`, `pnpm format:check` and `pnpm type-check` pass. The repository's own pull requests run this very workflow, so the scripts its manifest declares and the catalogue knows run there too.
- The program runs locally against the canary checkouts before a push. Set the variables a job would have (`GITHUB_WORKSPACE`, `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`, `GITHUB_EVENT_NAME`, `GITHUB_BASE_REF`, `RUNNER_TEMP`), make the project the working directory and run the `discover`, `check` and `build` commands of the entry point. A workspace scenario is a commit on a scratch branch of the workspace canary: one app changed selects that app, the shared package changed selects it and its dependents, a root file changed selects everything, Markdown alone selects nothing.
- A change to the workflow or the program is tested on the canaries before it merges. Point the ruleset's workflow entry at the branch, open a pull request on each canary, cite the runs in this repository's pull request, then point the ruleset back. Two canaries exist because the workflow has two shapes: `canary` is a single package, `canary-workspace` a pnpm workspace whose shared package feeds an app.
- Reviewing a change means walking the trust boundary table of the architecture page again: what new thing does the job hold, and which new value from the project reaches a process, a file or a channel.

## Commits

One intention per commit, as a Conventional Commit: `ci(scope): what changed` for the workflow and the program, `chore: what changed` for tooling, `docs: what changed` for documentation alone. Documentation that a change makes wrong is updated in the same commit. Pull requests are squash-merged, so the title reads as one commit.

## Documentation

The README, the architecture page and this file describe intent and rules, never the current inventory: no action versions, no list of repositories, no copy of a value the workflow or the program sets. Script names, `package.json` fields and the command names of the program stay, because they are the contract a project and the workflow write against.

**The docs describe the intended behavior.** That covers `docs/`, the README and this file. When a change makes them wrong, do not just rewrite them to match. First check that the change is expected: the task asks for it, or the user confirms it.

- If it is expected, update the docs in the same commit as the change.
- If it is not, the docs win. Bring the code back in line with them, or stop and ask.

## Working against real systems

The organization ruleset and the canary repositories are shared state. Pointing the ruleset at a branch changes what every listed repository runs. Do it for a test, say so, and point it back when the test ends. A pull request opened on a canary for a test is closed afterwards.

## Extending

- **A new check**: add the script name and its label to the catalogue in the domain. The status, the summary and the matrix follow.
- **A new executor**: add it to the executor union and to its detection. The type checker then names the command tables that need an arm. The arm receives the package and the script as values and must honor the project's task graph.
- **A new root file that invalidates everything**: add it to the root file list in the domain, with the reason every package depends on it.
- **A new job**: a job in the workflow file with its pinned setup steps and one `run` line naming a new command. The command is a module beside the existing ones, wired in the entry point's dispatch table.
