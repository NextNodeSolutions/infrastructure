import { lstatSync, readlinkSync } from "node:fs";
import { dirname, isAbsolute, join, sep } from "node:path";

const LINK_DEPTH = 40;

export function within(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep);
}

// Where a link leads once every link on its way is followed, as the kernel will follow
// it: a part that does not exist yet is taken as a plain directory, so a link that
// dangles now and resolves once a later step writes its target is judged on that target.
export function destination(link: string): string {
  return follow(dirname(link), readlinkSync(link), 0);
}

function follow(base: string, target: string, depth: number): string {
  if (depth > LINK_DEPTH) throw new Error("too many levels of symbolic links");
  let current = isAbsolute(target) ? sep : base;
  for (const part of target.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      current = dirname(current);
      continue;
    }
    current = step(join(current, part), depth);
  }
  return current;
}

function step(path: string, depth: number): string {
  try {
    if (!lstatSync(path).isSymbolicLink()) return path;
  } catch {
    return path;
  }
  return follow(dirname(path), readlinkSync(path), depth + 1);
}
