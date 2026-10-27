// What the read step extracted from nextnode.toml for one environment. The read step
// writes it as JSON in the platform's directory; every later step of the job, and the
// program, read this file and never the project's files again.
import { readFileSync } from "node:fs";
import * as v from "valibot";
import { Environment, HealthPath, Hostname } from "./nextnode-toml.ts";

const filled = v.pipe(v.string(), v.nonEmpty("is empty"));

export const Spec = v.object({
  // The repository's name, which names the project everywhere the platform keeps state for it: the Pulumi project and the vault project.
  project: filled,
  // Environment being deployed, also the stack name.
  environment: Environment,
  // Route the smoke request targets after each upload.
  health: HealthPath,
  // The project's migration command, empty when it declares none.
  migrate: v.string(),
  // Hostname of the environment, attached to its Worker as a custom domain.
  domain: Hostname,
  // Name of the environment's Worker, the repository's name suffixed with the environment.
  worker_name: filled,
  // The bundled entry point, relative to the checkout root, that the upload takes as it is; empty for a Worker of static assets only.
  bundle: v.string(),
});
export type Spec = v.InferOutput<typeof Spec>;

export function readSpec(path: string): Spec {
  const parsed = v.safeParse(Spec, JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) throw new Error(`${path}: ${v.summarize(parsed.issues)}`);
  return parsed.output;
}
