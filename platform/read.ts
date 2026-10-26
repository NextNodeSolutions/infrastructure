// Reads nextnode.toml and the committed Wrangler configuration of one environment into the
// spec, and keeps a copy of that configuration aside for Wrangler.
//
//   node read.ts --repository <name> --environment <name> --platform <directory>
//
// Runs in the project checkout as the platform user, before any project code. The
// repository's name, as CircleCI checked it out, names the project everywhere the
// platform keeps state for it: a value of the project's files never does. A refusal
// names the key or the rule and exits 1. Exit 3 means the environment is not declared,
// which the development job turns into a halt: a missing development environment is the
// project's choice, not an error.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import jsonc from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import { isRecord, type Spec } from "./src/spec.ts";

const NOT_DECLARED = 3;
const ROOT = realpathSync(".");
// The repository name becomes the Pulumi project name, which Pulumi restricts to this shape.
const PROJECT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const WRANGLER_CONFIG = /^wrangler\.(jsonc?|toml)$/;

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

function workerName(wrangler: unknown, section: Record<string, unknown>, file: string): string {
  // Wrangler names the Worker after the environment's section, or after the top-level
  // name suffixed with the environment.
  if (typeof section.name === "string") return section.name;
  const top = isRecord(wrangler) ? wrangler.name : undefined;
  if (typeof top !== "string") return refuse(`${file} declares no name for env.${environment} and no top-level name`);
  return `${top}-${environment}`;
}

// Every string of the configuration that Wrangler would take as a path, such as the
// entry point or the assets directory, must stay inside the repository: Wrangler reads
// and uploads it as the platform user. A string that is no path resolves inside anyway.
function insideRepository(value: unknown, entry: string, file: string): void {
  if (typeof value === "string") {
    const target = resolve(entry, value);
    if (target !== ROOT && !target.startsWith(ROOT + sep)) refuse(`${file} names a path outside the repository: ${value}`);
  } else if (Array.isArray(value)) {
    for (const item of value) insideRepository(item, entry, file);
  } else if (isRecord(value)) {
    for (const item of Object.values(value)) insideRepository(item, entry, file);
  }
}

function readWrangler(entry: string): Pick<Spec, "wrangler_config" | "worker_name"> {
  const configs = readdirSync(entry).filter((name) => WRANGLER_CONFIG.test(name));
  const file = configs[0];
  if (file === undefined || configs.length !== 1) refuse(`expected one Wrangler configuration in ${entry}, found ${configs.length}`);
  const source = readFileSync(join(entry, file), "utf8");
  const wrangler: unknown = file.endsWith(".toml") ? parseToml(source) : jsonc.parse(source, [], { allowTrailingComma: true });
  insideRepository(wrangler, entry, file);
  // Wrangler deploys the environment's section of its configuration, so the section must exist.
  const section = table(wrangler, "env")[environment];
  if (!isRecord(section)) refuse(`${file} declares no env.${environment}: the platform deploys that section`);
  for (const scope of [table({ top: wrangler }, "top"), section]) {
    // A build command would run project code with the platform credential: the build is
    // the project's build script, run as the project user.
    if (table(scope, "build").command) refuse(`${file} declares a build command: the platform runs the project's build script instead`);
    // Routes and domains are Pulumi's: a route here would be fought over by every deployment.
    if (scope.routes || scope.route) refuse(`${file} declares routes: domains come from nextnode.toml, through Pulumi`);
  }
  return { wrangler_config: file, worker_name: workerName(wrangler, section, file) };
}

const toml: unknown = parseToml(readFileSync("nextnode.toml", "utf8"));
if (!isRecord(table(toml, "environments")[environment])) {
  console.error(`nextnode.toml declares no environment "${environment}"`);
  process.exit(environment === "development" ? NOT_DECLARED : 1);
}
if (!PROJECT_NAME.test(args.repository)) refuse(`the repository name ${JSON.stringify(args.repository)} cannot name a Pulumi project: a letter or digit, then letters, digits, dots, dashes or underscores, 100 characters at most`);
const deploy = table(toml, "deploy");
const entry = text(deploy, "entry", ".");
// The entry is a directory of the checkout: the platform reads and copies nothing outside it.
if (isAbsolute(entry) || entry.split(/[\\/]/).includes("..") || !(realpathSync(entry) === ROOT || realpathSync(entry).startsWith(ROOT + sep))) {
  refuse("nextnode.toml: deploy.entry must be a directory of the repository, relative to its root");
}
if (deploy.migrate !== undefined && typeof deploy.migrate !== "string") refuse("nextnode.toml: deploy.migrate must be a string, the command to run");
const spec: Spec = {
  project: args.repository,
  environment,
  entry,
  health: text(deploy, "health", "/"),
  migrate: deploy.migrate ?? "",
  domain: text(table(table(toml, "environments"), environment), "domain", undefined),
  ...readWrangler(entry),
};

for (const [key, value] of Object.entries(spec)) console.log(`${key}=${value}`);
mkdirSync(join(args.platform, "wrangler"), { recursive: true });
writeFileSync(join(args.platform, "nextnode.json"), JSON.stringify(spec));
copyFileSync(join(entry, spec.wrangler_config), join(args.platform, "wrangler", spec.wrangler_config));
