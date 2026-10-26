# The project's contract

This page lists what a project repository supplies to the pipeline and how a mistake is reported. The pipeline itself is explained in [architecture.md](architecture.md).

```mermaid
flowchart LR
    T[nextnode.toml] --> R[Read step of the deployment job]
    W[Wrangler configuration at the entry] --> R
    R --> S[Spec of the environment, a JSON file of the platform user]
    S --> M[Migration command, run as the project user]
    S --> U[Wrangler upload of the environment's section]
    S --> P[Platform package, the domain and the resources]
    S --> H[Smoke request on the health route]
    K[package.json scripts and packageManager] --> C[Checks job and the build]
```

The read step runs once per deployment job, before any project code. It reads `nextnode.toml` and the committed Wrangler configuration, refuses what the platform cannot accept, and writes one spec for the environment. Every later step reads that spec, never the files again, so a project script that rewrites them during the build changes nothing.

## nextnode.toml

The file lives at the repository root and holds names only, never a secret value. It does not name the project: the repository's name, as CircleCI checked it out, names the Pulumi project that holds the project's state and the Infisical project that holds its secrets. A value of the file could name another project's, so none does. The repository name must be one Pulumi accepts as a project name: a letter or digit, then letters, digits, dots, dashes or underscores, a hundred characters at most.

| Key | Role | When absent |
| --- | --- | --- |
| `deploy.entry` | Directory that holds the Wrangler configuration, relative to the root and inside the repository. | The root. |
| `deploy.health` | Route the pipeline requests after each upload. It must answer with a success status on a fresh deployment, even against an empty database. | The root route. |
| `deploy.migrate` | Command that applies the project's migrations, run as the project user after the build with the application's secrets in its environment. The platform never guesses a migration tool. | No migration step. |
| `environments.development.domain` | Hostname of the development environment, attached to its Worker as a custom domain. The zone must belong to the platform's Cloudflare account. | Refused when the section exists. When the whole `environments.development` section is absent, the project has no development environment: the development job halts and the pipeline waits for the approval. |
| `environments.production.domain` | Hostname of the production environment. | Refused. |

The presence of `environments.development` is the project's choice. A development environment with a database has its own cost and lifecycle, so the platform does not force one.

## The Wrangler configuration

Wrangler runs as the platform user with the Cloudflare credential, on the configuration the repository committed. The read step keeps that copy aside before any project command runs, and the deployment restores it, so a build cannot alter what Wrangler reads. Four rules follow, each checked by the read step.

- **Exactly one configuration file at the entry**, in JSON, JSONC or TOML. Two files would leave Wrangler to choose.
- **A section per deployment environment**, under `env`, and a name for the Worker. Wrangler deploys that section, and the Worker is named after it, or after the top-level name suffixed with the environment when the section gives no name. The platform attaches the domain to that Worker, so it needs the name to be the one Wrangler uses, and refuses a configuration that names nothing.
- **No build command.** The configuration is read with the platform credential, and a build command in it would run project code with that credential. The build is the project's `build` script, run as the project user.
- **No route and no custom domain.** Domains come from `nextnode.toml` and are attached by the platform package after each upload. A route declared to Wrangler would be fought over by every deployment.
- **Every path stays inside the repository.** The entry point, the assets directory and any other string Wrangler would read as a path resolve from the entry to somewhere under the repository's root, and no link of the checkout, after the build, resolves outside it. Wrangler reads and uploads as the platform user, so a path or a link that reaches out of the checkout would upload a file of the platform.

A production Worker keeps preview URLs enabled. The pipeline checks a production version on its preview URL before promoting it, and fails the deployment when the upload yields none.

## The package manifest

The `packageManager` field pins pnpm as a plain version, with an optional integrity hash. A URL, a tag or a path is refused, because the pipeline installs what the field says, globally, before anything else.

The scripts the pipeline calls:

| Script | Called by | Required |
| --- | --- | --- |
| `lint`, `format:check`, `type-check` | The checks job, on every push. | Yes. |
| `test` | The checks job, when declared. | No. |
| `build` | The deployment job, as the project user, before the migrations and the upload. | Yes. |

The install is frozen: a lockfile that does not match the manifest fails the first step rather than installing something else.

## What a project command sees

Every script runs as a user of its own, in an environment built from a list rather than inherited from the job. The list is the contract: `PATH`, `HOME`, `CI`, the pnpm store location, and when they are set `NEXTNODE_ENVIRONMENT`, `CIRCLE_BRANCH`, `CIRCLE_SHA1`, `CIRCLE_BUILD_URL` and `CIRCLE_PROJECT_REPONAME`. In the deployment job the application's secrets of the environment being deployed are added, from the Infisical project named after the repository. Nothing else is there: not the job's tokens, not the platform's credentials, not a variable another step exported. A script that needs another variable of CircleCI's asks for the list to grow, through a pull request on this repository.

## How a mistake is reported

A refusal of `nextnode.toml` or of the Wrangler configuration happens in the read step, with a message that names the key or the rule, before any secret is fetched and before any project code runs. The other mistakes show in the step that meets them.

| Mistake | Where it shows |
| --- | --- |
| A missing or malformed key of `nextnode.toml`, a Wrangler configuration that breaks a rule above, a repository name Pulumi refuses | The read step of the deployment job, which prints the key or the rule. The checks job does not read these files, so the error appears on `main` only. |
| A link of the checkout that resolves outside it, left by the build or committed | The seal step of the deployment job, after the build and before the upload, which names each link. |
| No Infisical project named after the repository, or two | The secrets step of the deployment job, before any project code runs. |
| An unpinned or malformed `packageManager` | The install step of the checks job, on the first push. |
| A lockfile out of date | The project's install step, on the first push. On `main`, the deployment job fails at the same step, before the build. |
| A domain whose zone is not in the platform's account | The resources step of the deployment job, from the platform package, after the upload: the Worker serves on its workers.dev URL and the domain is not attached. |
| A health route that does not answer | The smoke step. Development has already been replaced; a production version is never promoted. |
