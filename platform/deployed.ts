// Reads what Wrangler wrote to its output file during the deployment step and prints the
// deployment record as JSON: the uploaded version, empty when the Worker was deployed
// directly and already serves, and the URL the smoke request targets.
//
//   node deployed.ts --wrangler-output <file> --domain <hostname>
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { isRecord } from "./src/spec.ts";

const { values: args } = parseArgs({
  options: { "wrangler-output": { type: "string" }, domain: { type: "string" } },
});
if (!args["wrangler-output"] || !args.domain) throw new Error("usage: deployed.ts --wrangler-output <file> --domain <hostname>");

// One JSON entry per line, one per command Wrangler ran.
const entries = readFileSync(args["wrangler-output"], "utf8")
  .split("\n")
  .filter((line) => line !== "")
  .map((line): unknown => JSON.parse(line))
  .filter(isRecord);
const uploaded = entries.find((entry) => entry.type === "version-upload");
const deployed = entries.find((entry) => entry.type === "deploy");

function record(): { version: string; url: string } {
  if (uploaded) {
    if (typeof uploaded.version_id !== "string") throw new Error("Wrangler reported no version id for the upload");
    if (typeof uploaded.preview_url !== "string") throw new Error("Wrangler reported no preview URL: the production Worker needs preview_urls");
    return { version: uploaded.version_id, url: uploaded.preview_url };
  }
  if (!deployed) throw new Error("Wrangler reported neither a deployment nor a version upload");
  // The health check targets the workers.dev URL when there is one, else the declared domain.
  const targets = Array.isArray(deployed.targets) ? deployed.targets.filter((target): target is string => typeof target === "string") : [];
  return { version: "", url: targets.find((target) => target.endsWith(".workers.dev")) ?? `https://${args.domain}` };
}

process.stdout.write(`${JSON.stringify(record())}\n`);
