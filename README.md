# NextNode infrastructure

The CI of every NextNode project, kept in one place. A project repository holds no workflow file: an organization ruleset requires the `Checks` workflow of this repository on every pull request, and GitHub runs it inside the project.

## Checks

`.github/workflows/checks.yml` runs five jobs in parallel, then the build:

| Job | Project script | Required |
| --- | --- | --- |
| Lint | `lint` | Yes |
| Unit tests | `test:unit` | Yes |
| Integration tests | `test:integration` | When declared |
| End-to-end tests | `test:e2e` | When declared; a placeholder until the end-to-end setup exists |
| TypeScript | `type-check` | Yes |
| Build | `build`, after every check passed | Yes |

A project pins pnpm in the `packageManager` field of its `package.json`; the install is frozen. The Node version is this workflow's.

## Loading it into a repository

The organization ruleset "Checks required on pull requests" names the repositories it applies to. Adding a repository is adding its name to the ruleset's include list.

## Testing a change

A change to the workflow is tested on the canary repository before it reaches `main`: a ruleset entry can point at a branch of this repository, and the canary's pull request shows the result.
