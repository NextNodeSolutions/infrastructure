// What the read step extracted from nextnode.toml and the Wrangler configuration for one
// environment. The read step writes it as JSON in the platform's directory; every later
// step of the job, and the program, read this file and never the project's files again.
import { readFileSync } from "node:fs";

export type Spec = {
  /** The repository's name, which names the project everywhere the platform keeps state for it: the Pulumi project and the vault project. */
  readonly project: string;
  /** Environment being deployed, also the stack name. */
  readonly environment: string;
  /** Directory of the Wrangler configuration, relative to the checkout. */
  readonly entry: string;
  /** Route the smoke request targets after each upload. */
  readonly health: string;
  /** The project's migration command, empty when it declares none. */
  readonly migrate: string;
  /** Hostname of the environment, attached to its Worker as a custom domain. */
  readonly domain: string;
  /** File name of the Wrangler configuration at the entry. */
  readonly wrangler_config: string;
  /** Name of the Worker Wrangler deploys for the environment. */
  readonly worker_name: string;
  /** The bundled entry point, relative to the entry, that the upload takes as it is; empty for a Worker of static assets only. */
  readonly bundle: string;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readSpec(path: string): Spec {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(raw)) throw new Error(`${path}: not a JSON object`);
  const text = (key: keyof Spec): string => {
    const value = raw[key];
    if (typeof value !== "string") throw new Error(`${path}: missing ${key}`);
    return value;
  };
  const filled = (key: keyof Spec): string => {
    const value = text(key);
    if (value === "") throw new Error(`${path}: empty ${key}`);
    return value;
  };
  return {
    project: filled("project"),
    environment: filled("environment"),
    entry: filled("entry"),
    health: filled("health"),
    migrate: text("migrate"),
    domain: filled("domain"),
    wrangler_config: filled("wrangler_config"),
    worker_name: filled("worker_name"),
    bundle: text("bundle"),
  };
}
