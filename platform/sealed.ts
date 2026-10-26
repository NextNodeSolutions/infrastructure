// Refuses a checkout in which a symbolic link resolves outside it. Wrangler reads the
// checkout as the platform user and uploads what it finds there, and a link is how a
// file of the platform, or of a process, would get in. Runs once every process of the
// project user has ended, so what it saw is what Wrangler reads.
//
//   node sealed.ts --root <checkout>
import { readdirSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({ options: { root: { type: "string" } } });
if (!args.root) throw new Error("usage: sealed.ts --root <checkout>");
const root = realpathSync(args.root);

function resolved(link: string): string | undefined {
  try {
    return realpathSync(link);
  } catch {
    // A dangling link reads nothing.
    return undefined;
  }
}

function escapes(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const target = resolved(path);
      return target === undefined || target === root || target.startsWith(root + sep) ? [] : [`${path} -> ${target}`];
    }
    return entry.isDirectory() ? escapes(path) : [];
  });
}

const found = escapes(root);
if (found.length > 0) {
  console.error(`${found.length} link(s) of the checkout resolve outside it:\n${found.join("\n")}`);
  process.exit(1);
}
