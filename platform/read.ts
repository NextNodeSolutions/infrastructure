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
import { copyFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import jsonc from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import { within } from "./src/paths.ts";
import { isRecord, type Spec } from "./src/spec.ts";

const NOT_DECLARED = 3;
const ROOT = realpathSync(".");
// The repository name becomes the Pulumi project name, which Pulumi restricts to this shape.
const PROJECT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const WRANGLER_CONFIG = /^wrangler\.(jsonc?|toml)$/;
// The keys Wrangler reads as a file or a directory, relative to its configuration. The
// upload reads them with the platform credential, so they stay inside the repository.
// Rules are globs evaluated under base_dir and need no check of their own.
const PATH_KEYS = ["main", "tsconfig", "base_dir"];
const PATH_TABLES = ["text_blobs", "data_blobs", "wasm_modules"];
// Where Wrangler writes the bundle, relative to the entry, and the name it gives it.
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

function workerName(wrangler: unknown, section: Record<string, unknown>, file: string): string {
  // Wrangler names the Worker after the environment's section, or after the top-level
  // name suffixed with the environment.
  if (typeof section.name === "string") return section.name;
  const top = isRecord(wrangler) ? wrangler.name : undefined;
  if (typeof top !== "string") return refuse(`${file} declares no name for env.${environment} and no top-level name`);
  return `${top}-${environment}`;
}

function paths(scope: Record<string, unknown>): [string, unknown][] {
  return [
    ...PATH_KEYS.map((key): [string, unknown] => [key, scope[key]]),
    ["assets.directory", table(scope, "assets").directory],
    ["site.bucket", table(scope, "site").bucket],
    ...PATH_TABLES.flatMap((key) => Object.entries(table(scope, key)).map(([name, value]): [string, unknown] => [`${key}.${name}`, value])),
  ];
}

function insideRepository(scope: Record<string, unknown>, entry: string, file: string): void {
  for (const [key, value] of paths(scope)) {
    if (typeof value === "string" && !within(ROOT, resolve(entry, value))) refuse(`${file}: ${key} leaves the repository: ${value}`);
  }
}

// The upload takes the bundle Wrangler wrote for the project, named after the entry point.
function bundleOf(main: unknown): string {
  return typeof main === "string" ? join(BUNDLE_DIRECTORY, `${basename(main, extname(main))}.js`) : "";
}

function readWrangler(entry: string): Pick<Spec, "wrangler_config" | "worker_name" | "bundle"> {
  const configs = readdirSync(entry).filter((name) => WRANGLER_CONFIG.test(name));
  const file = configs[0];
  if (file === undefined || configs.length !== 1) refuse(`expected one Wrangler configuration in ${entry}, found ${configs.length}`);
  const source = readFileSync(join(entry, file), "utf8");
  const wrangler: unknown = file.endsWith(".toml") ? parseToml(source) : jsonc.parse(source, [], { allowTrailingComma: true });
  // Wrangler deploys the environment's section of its configuration, so the section must exist.
  const section = table(wrangler, "env")[environment];
  if (!isRecord(section)) refuse(`${file} declares no env.${environment}: the platform deploys that section`);
  const top = table({ top: wrangler }, "top");
  for (const scope of [top, section]) {
    insideRepository(scope, entry, file);
    // A build command would run project code with the platform credential: the build is
    // the project's build script, run as the project user.
    if (table(scope, "build").command) refuse(`${file} declares a build command: the platform runs the project's build script instead`);
    // Routes and domains are Pulumi's: a route here would be fought over by every deployment.
    if (scope.routes || scope.route) refuse(`${file} declares routes: domains come from nextnode.toml, through Pulumi`);
  }
  return { wrangler_config: file, worker_name: workerName(wrangler, section, file), bundle: bundleOf(section.main ?? top.main) };
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
function entryDirectory(path: string): string {
  try {
    return statSync(path).isDirectory() ? realpathSync(path) : "";
  } catch {
    return "";
  }
}
if (isAbsolute(entry) || entry.split(/[\\/]/).includes("..") || !within(ROOT, entryDirectory(entry) || "/")) {
  refuse(`nextnode.toml: deploy.entry must be a directory of the repository, relative to its root: ${entry}`);
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
