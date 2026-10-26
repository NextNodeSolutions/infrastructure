// What the deployment job read from nextnode.toml and the Wrangler configuration,
// for one environment. The job writes it as JSON; this is the only input of the program.
import { readFileSync } from "node:fs";

export interface Spec {
  /** Project name, also the Pulumi project name. */
  readonly project: string;
  /** Environment being deployed, also the stack name. */
  readonly environment: string;
  /** Hostname declared for the environment in nextnode.toml. */
  readonly domain: string;
  /** Name of the Worker Wrangler deploys for the environment. */
  readonly worker_name: string;
}

const required = ["project", "environment", "domain", "worker_name"] as const;

export function readSpec(path: string): Spec {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof raw !== "object" || raw === null) throw new Error(`${path}: not a JSON object`);
  const values = raw as Record<string, unknown>;
  for (const key of required) {
    if (typeof values[key] !== "string" || values[key] === "") throw new Error(`${path}: missing ${key}`);
  }
  return values as unknown as Spec;
}
