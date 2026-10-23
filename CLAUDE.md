# NextNode Infrastructure

This repository is the deployment pipeline of every NextNode project. Consumers run its workflows and CLI from `main`, so a merge here is a release to all of them.

- Read [packages/infrastructure/CLAUDE.md](packages/infrastructure/CLAUDE.md) before changing the CLI, and [packages/infrastructure/README.md](packages/infrastructure/README.md) before changing a workflow or the secrets model.
- `main` is the trust base of the vault: pull requests only, no direct push, no workflow that runs caller code with `id-token: write`.
- `packages/infrastructure` is never published to npm. `packages/worker-types` is the only published package.
- Validate a pipeline change with a development deployment of a consumer repository, not with a claim of test coverage.
