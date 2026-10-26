// The Cloudflare resources of one environment of one project. Each resource kind is
// keyed by an entry of nextnode.toml, carried by the spec. The program runs inline in
// the driver's process, so it keeps everything inside this function.
import * as cloudflare from "@pulumi/cloudflare";
import type { Spec } from "./spec.ts";

export async function program(spec: Spec, accountId: string): Promise<Record<string, unknown>> {
  // The zone is the longest registered name of the account that the domain belongs to.
  const zone = cloudflare.getZonesOutput({ account: { id: accountId } }).apply(({ results }) => {
    const holding = results.filter((z) => spec.domain === z.name || spec.domain.endsWith(`.${z.name}`));
    if (holding.length === 0) throw new Error(`${spec.domain}: no zone of the account holds this domain`);
    return holding.reduce((longest, zone) => (zone.name.length > longest.name.length ? zone : longest));
  });

  // The environment's domain, attached to the Worker Wrangler has just uploaded. The
  // driver runs after that upload, so the Worker exists and a domain that was serving
  // moves to its replacement only once the replacement is there.
  new cloudflare.WorkersCustomDomain("domain", {
    accountId,
    zoneId: zone.id,
    hostname: spec.domain,
    service: spec.worker_name,
  });

  return { domain: spec.domain, zone: zone.name };
}
