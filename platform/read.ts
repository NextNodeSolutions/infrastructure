// Reads nextnode.toml for one environment into the spec, and generates from its Wrangler
// keys the Wrangler configuration of the environment's Worker.
//
//   node read.ts --repository <name> --environment <name> --platform <directory>
//
// Runs in the project checkout as the platform user, before any project code. The
// repository's name, as CircleCI checked it out, names the project everywhere the
// platform keeps state for it, and names its Workers: a value of the project's files
// never does. A refusal names the key or the rule and exits 1. Exit 3 means the
// environment is not declared, which the development job turns into a halt: a missing
// development environment is the project's choice, not an error.
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseToml } from "smol-toml";
import { within } from "./src/paths.ts";
import { isRecord, type Spec } from "./src/spec.ts";

const NOT_DECLARED = 3;
const ROOT = realpathSync(".");
// The repository name names the Pulumi project and, suffixed with the environment, the
// Worker, which Cloudflare restricts to lowercase letters, digits and dashes.
const WORKER_NAME = /^[a-z0-9][a-z0-9-]*$/;
const WORKER_NAME_LENGTH = 63;
// The tables of nextnode.toml that are the platform's, and the environments' sections.
const PLATFORM_TABLES = ["deploy", "environments", "env"];
// Every other key of nextnode.toml is Wrangler's own. Wrangler
// reads the generated configuration with the platform credential, in the account every
// project shares, so only keys that describe this Worker's own code and runtime are
// accepted. A key that names, builds or routes the Worker, or binds to or creates another
// resource, is the platform's, and a key Wrangler adds later stays refused until accepted here.
const ACCEPTED = new Set([
  "main",
  "base_dir",
  "tsconfig",
  "compatibility_date",
  "compatibility_flags",
  "assets",
  "vars",
  "define",
  "observability",
  "limits",
  "placement",
  "triggers",
  "workers_dev",
  "preview_urls",
  "minify",
  "keep_names",
  "version_metadata",
  "ai",
  "browser",
  "images",
  "durable_objects",
  "migrations",
]);
// The keys Wrangler reads as a file or a directory. The generated configuration lives
// outside the checkout, so they are anchored to the checkout root, and stay inside it.
const PATH_KEYS = ["main", "base_dir", "tsconfig"];
// Where the project user's bundle lands, relative to the checkout root.
const BUNDLE_DIRECTORY = ".nextnode";

const { values: args } = parseArgs({
  options: { repository: { type: "string" }, environment: { type: "string" }, platform: { type: "string" } },
});
if (!args.repository || !args.environment || !args.platform) throw new Error("usage: read.ts --repository <name> --environment <name> --platform <directory>");
const environment = args.environment;

function refuse(message: string): never {
  console.error(message);
  process.exit(1);
}

function table(parent: unknown, key: string): Record<string, unknown> {
  const value = isRecord(parent) ? parent[key] : undefined;
  return isRecord(value) ? value : {};
}

function text(record: Record<string, unknown>, key: string, fallback: string | undefined): string {
  const value = record[key] ?? fallback;
  if (typeof value !== "string" || value === "") refuse(`nextnode.toml: missing ${key}`);
  return value;
}

function checkKeys(scope: string, keys: Record<string, unknown>): void {
  for (const key of Object.keys(keys)) {
    if (!ACCEPTED.has(key)) refuse(`nextnode.toml: ${scope}${key} is refused. The Wrangler keys the platform accepts: ${[...ACCEPTED].join(", ")}`);
  }
  if (Object.keys(table(keys, "triggers")).some((key) => key !== "crons")) refuse(`nextnode.toml: ${scope}triggers accepts crons only`);
  const bindings = table(keys, "durable_objects").bindings;
  if (Array.isArray(bindings) && bindings.some((binding) => isRecord(binding) && binding.script_name !== undefined)) {
    refuse(`nextnode.toml: ${scope}durable_objects binds to this Worker's own classes only, script_name is refused`);
  }
}

// A path the configuration names, as an absolute path of the checkout.
function anchored(key: string, value: unknown): unknown {
  if (typeof value !== "string") return value;
  const path = resolve(ROOT, value);
  if (!within(ROOT, path)) refuse(`nextnode.toml: ${key} leaves the repository: ${value}`);
  return path;
}

// The one environment, flat: Wrangler does not carry vars and bindings from the top level
// into an environment's section, so each key of the section replaces the top-level one, whole.
function wranglerConfig(keys: Record<string, unknown>, worker: string): Record<string, unknown> {
  const config: Record<string, unknown> = { ...keys, name: worker };
  for (const key of PATH_KEYS) config[key] = anchored(key, config[key]);
  if (isRecord(config.assets)) config.assets = { ...config.assets, directory: anchored("assets.directory", config.assets.directory) };
  return config;
}

// The upload takes the bundle Wrangler wrote for the project, named after the entry point.
function bundleOf(main: unknown): string {
  return typeof main === "string" ? join(BUNDLE_DIRECTORY, `${basename(main, extname(main))}.js`) : "";
}

const toml = parseToml(readFileSync("nextnode.toml", "utf8"));
const shared = Object.fromEntries(Object.entries(toml).filter(([key]) => !PLATFORM_TABLES.includes(key)));
if (!isRecord(table(toml, "environments")[environment])) {
  console.error(`nextnode.toml declares no environment "${environment}"`);
  process.exit(environment === "development" ? NOT_DECLARED : 1);
}
const worker = `${args.repository}-${environment}`;
if (!WORKER_NAME.test(args.repository) || worker.length > WORKER_NAME_LENGTH) {
  refuse(`the repository name ${JSON.stringify(args.repository)} names the Pulumi project and the Worker ${worker}: lowercase letters, digits and dashes, ${WORKER_NAME_LENGTH} characters at most with the environment`);
}
const section = table(table(toml, "env"), environment);
checkKeys("", shared);
checkKeys(`env.${environment}.`, section);
const wrangler = wranglerConfig({ ...shared, ...section }, worker);
const settings = table(toml, "deploy");
if (settings.migrate !== undefined && typeof settings.migrate !== "string") refuse("nextnode.toml: deploy.migrate must be a string, the command to run");
const spec: Spec = {
  project: args.repository,
  environment,
  health: text(settings, "health", "/"),
  migrate: settings.migrate ?? "",
  domain: text(table(table(toml, "environments"), environment), "domain", undefined),
  worker_name: worker,
  bundle: bundleOf(wrangler.main),
};

for (const [key, value] of Object.entries(spec)) console.log(`${key}=${value}`);
console.log(`wrangler configuration: ${JSON.stringify(wrangler)}`);
writeFileSync(join(args.platform, "nextnode.json"), JSON.stringify(spec));
writeFileSync(join(args.platform, "wrangler.json"), JSON.stringify(wrangler));
