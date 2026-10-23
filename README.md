# NextNode Infrastructure

The deployment platform of NextNode projects: the pipeline CLI and the reusable GitHub Actions workflows that deploy a repository to Cloudflare Workers from its `nextnode.toml`.

Consumers install nothing from here. Their workflows call the reusable workflows at `main`, and the `setup` action checks this repository out into every pipeline job. `main` is the trust base of the secrets vault: pull requests only, no direct push. See [packages/infrastructure/README.md](packages/infrastructure/README.md) for the configuration reference, the secrets model and the trust boundary.

## Layout

| Path                                    | Role                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `.github/workflows/deploy.yml`          | Reusable: plan, quality, build, provision, migrate, deploy                  |
| `.github/workflows/plan-diff.yml`       | Reusable: Terraform plan comment on a pull request                          |
| `.github/workflows/teardown.yml`        | Manual: tear down one project's environment                                 |
| `.github/workflows/publish-package.yml` | Reusable, bound to this repository: release of its npm packages             |
| `.github/actions/setup`                 | Composite action every pipeline job starts with                             |
| `packages/infrastructure`               | The pipeline CLI, run from a checkout of `main`, never published            |
| `packages/worker-types`                 | `worker-types` CLI published to npm, built on the pipeline's library export |

## Calling the pipeline

```yaml
permissions:
    contents: read
    actions: read
    id-token: write

jobs:
    deploy:
        uses: NextNodeSolutions/infrastructure/.github/workflows/deploy.yml@main
        with:
            environment: development
```

`plan-diff.yml` takes the same inputs and posts the Terraform plan on the pull request. `teardown.yml` is dispatched by hand from this repository.

## Development

```sh
pnpm install
pnpm build
pnpm lint
pnpm type-check
pnpm format:check
```

The CLI has no test suite. A change to the pipeline is validated by a development deployment of a consumer repository.
