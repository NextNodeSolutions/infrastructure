# Rules for changing this repository

- **One workflow, loaded by the organization.** Every project runs the same `Checks` workflow from `main`. Behavior differs through the project's package scripts, never through a per-project copy.
- **A project repository holds no workflow file.** What a project must express goes through its package scripts.
- **Pin every action by commit SHA**, with the release tag beside it, the runner image by version, and the Node version by major.
- **A value from a matrix or an input reaches a step as an environment variable**, never as text of its command.
- **A change to the workflow is tested on the canary** before it merges: point the ruleset at the branch, open a pull request on the canary, cite the run.
