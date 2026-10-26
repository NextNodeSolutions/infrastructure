// Converges the Cloudflare resources of one environment, through Pulumi's Automation API.
//
//   node deploy.ts --spec <nextnode.json> --work <empty directory> [--preview]
//
// Environment: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, PULUMI_CONFIG_PASSPHRASE and
// NEXTNODE_STATE_BUCKET, as the deployment job exports them from the vault. The Pulumi
// CLI and the Cloudflare provider plugin are found through PATH and PULUMI_HOME.
// Progress goes to stderr; stdout receives the stack outputs as one JSON object.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import * as automation from "@pulumi/pulumi/automation/index.js";
import { program } from "./src/program.ts";
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
  const body = (await response.json()) as { success: boolean; result?: { id?: string } };
  if (!body.success || !body.result?.id) throw new Error(`Cloudflare did not verify the token (HTTP ${response.status})`);
  return body.result.id;
}

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
      AWS_ACCESS_KEY_ID: await tokenId(),
      AWS_SECRET_ACCESS_KEY: createHash("sha256").update(token).digest("hex"),
      AWS_REGION: "auto",
      PULUMI_CONFIG_PASSPHRASE: passphrase,
      CLOUDFLARE_API_TOKEN: token,
    },
  },
);

// The CLI and the SDK are released together: the job installs the CLI at the version
// this package pins, and a drift between the two is a mistake to fix, not to run with.
const sdkVersion: string = createRequire(import.meta.url)("@pulumi/pulumi/package.json").version;
const cliVersion = stack.workspace.pulumiVersion;
if (cliVersion !== sdkVersion) {
  throw new Error(`Pulumi CLI ${cliVersion} does not match @pulumi/pulumi ${sdkVersion}: pin both to one version`);
}

const onOutput = (out: string) => process.stderr.write(out);
// Refreshed first: what disappeared outside Pulumi, such as a domain that went with a
// deleted Worker, leaves the state instead of failing its own deletion.
await stack.refresh({ onOutput });
if (args.preview) {
  await stack.preview({ onOutput, diff: true });
} else {
  await stack.up({ onOutput });
}
const outputs = await stack.outputs();
process.stdout.write(`${JSON.stringify(Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, v.value])))}\n`);
