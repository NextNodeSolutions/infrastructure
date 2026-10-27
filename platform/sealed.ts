// Refuses a checkout in which a symbolic link leads outside it. Wrangler reads the
// checkout as the platform user and uploads what it finds there, and a link is how a
// file of the platform, or of a process, would get in. A link is judged on where it
// leads, whether its target exists now or appears once a later step writes it. Runs
// once every process of the project user has ended, so what it saw is what Wrangler reads.
//
//   node sealed.ts --root <checkout>
import { readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { destination, within } from "./src/paths.ts";

const { values: args } = parseArgs({ options: { root: { type: "string" } } });
if (!args.root) throw new Error("usage: sealed.ts --root <checkout>");
const root = realpathSync(args.root);

function leads(link: string): string {
  try {
    return destination(link);
  } catch (error: unknown) {
    return `nowhere (${error instanceof Error ? error.message : String(error)})`;
  }
}

function escapes(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const target = leads(path);
      return within(root, target) ? [] : [`${path} -> ${target}`];
    }
    return entry.isDirectory() ? escapes(path) : [];
  });
}

const found = escapes(root);
if (found.length > 0) {
  console.error(`${found.length} link(s) of the checkout lead outside it:\n${found.join("\n")}`);
  process.exit(1);
}
