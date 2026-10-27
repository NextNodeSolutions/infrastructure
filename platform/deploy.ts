// Converges the Cloudflare resources of one environment, through Pulumi's Automation API.
//
//   node deploy.ts --spec <nextnode.json> --work <empty directory> [--preview]
//
// Environment: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, PULUMI_CONFIG_PASSPHRASE and
// NEXTNODE_STATE_BUCKET, as the deployment job exports them from the vault. The Pulumi
// CLI and the Cloudflare provider plugin are found through PATH and PULUMI_HOME.
// Progress goes to stderr; stdout receives the stack outputs as one JSON object.
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import * as automation from "@pulumi/pulumi/automation/index.js";
import { program } from "./src/program.ts";
import { isRecord } from "./src/record.ts";
import { readSpec } from "./src/spec.ts";

const { values: args } = parseArgs({
  options: {
    spec: { type: "string" },
    work: { type: "string" },
    preview: { type: "boolean", default: false },
  },
});
if (!args.spec || !args.work) throw new Error("usage: deploy.ts --spec <file> --work <dir> [--preview]");

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// Phase timings on stderr: the job's budget is measured in seconds.
const started = Date.now();
let last = started;
function lap(phase: string, since = last): void {
  const now = Date.now();
  process.stderr.write(`[${phase}: ${((now - since) / 1000).toFixed(1)}s]\n`);
  last = now;
}

const token = env("CLOUDFLARE_API_TOKEN");
const accountId = env("CLOUDFLARE_ACCOUNT_ID");
const passphrase = env("PULUMI_CONFIG_PASSPHRASE");
const bucket = env("NEXTNODE_STATE_BUCKET");
const spec = readSpec(args.spec);

// The state lives in the platform's R2 bucket, behind Pulumi's S3 backend. R2's S3 API
// accepts the API token itself as a key pair: the token's id as access key and the
// token's SHA-256 as secret key. One credential creates the resources and keeps their state.
async function tokenId(): Promise<string> {
  const response = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { authorization: `Bearer ${token}` },
  });
  const body: unknown = await response.json();
  const result = isRecord(body) && body.success === true && isRecord(body.result) ? body.result : undefined;
  if (typeof result?.id !== "string") throw new Error(`Cloudflare did not verify the token (HTTP ${response.status})`);
  return result.id;
}

const accessKeyId = await tokenId();
lap("token verified");

const stack = await automation.LocalWorkspace.createOrSelectStack(
  { stackName: spec.environment, projectName: spec.project, program: () => program(spec, accountId) },
  {
    workDir: args.work,
    secretsProvider: "passphrase",
    projectSettings: {
      name: spec.project,
      runtime: "nodejs",
      backend: { url: `s3://${bucket}?endpoint=${accountId}.r2.cloudflarestorage.com&region=auto&s3ForcePathStyle=true` },
    },
    envVars: {
      AWS_ACCESS_KEY_ID: accessKeyId,
      AWS_SECRET_ACCESS_KEY: createHash("sha256").update(token).digest("hex"),
      AWS_REGION: "auto",
      PULUMI_CONFIG_PASSPHRASE: passphrase,
      CLOUDFLARE_API_TOKEN: token,
    },
  },
);
lap("stack selected");

// Refreshed in the same run: what disappeared outside Pulumi, such as a domain that went
// with a deleted Worker, leaves the state instead of failing its own deletion. One run
// of the program, not two: each run starts a language host.
const onOutput = (out: string): void => { process.stderr.write(out); };
async function converge(): Promise<automation.OutputMap> {
  if (args.preview) {
    await stack.preview({ onOutput, diff: true, refresh: true });
    lap("preview");
    return stack.outputs();
  }
  const { outputs } = await stack.up({ onOutput, refresh: true });
  lap("up");
  return outputs;
}

const outputs = await converge();
lap("total", started);
process.stdout.write(`${JSON.stringify(Object.fromEntries(Object.entries(outputs).map(([key, output]) => [key, output.value])))}\n`);
