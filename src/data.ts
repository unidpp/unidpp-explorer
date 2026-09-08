/**
 * Data layer. Loads the @unidpp/model fixtures (laptop, car) and derives
 * everything the views render:
 *
 * - passport records (manifest + events + links + resolved profiles),
 * - verdicts for the three verification readings, computed with the SDK's
 *   own helpers (verifyChain, markerAtLeast, compareDurations,
 *   outcomeForFreshness, coverageRatio),
 * - an ISO 19135 registry dataset (RegistryItem[]) synthesized in this app:
 *   the SDK ships the type and the registry client, but no item fixtures,
 * - the battery transform lineage with quantities (explorer-side
 *   annotations; see transform view notes).
 */
import {
  CLASS_CAPABILITY,
  combineOutcome,
  compareDurations,
  downstreamOf,
  markerAtLeast,
  outcomeForFreshness,
  verifyChain,
} from "@unidpp/model";
import { buildCar, buildLaptop } from "@unidpp/model/fixtures";
import type {
  CoverageReport,
  DomainEvent,
  Finding,
  Freshness,
  PassportLink,
  PassportManifest,
  ProfileBinding,
  ProfileDefinition,
  RegistryItem,
  RegistryItemRef,
  TrustMarker,
  Verdict,
  VerdictOutcome,
  VerificationReading,
} from "@unidpp/model";
import type { CarFixture, LaptopFixture } from "@unidpp/model/fixtures";
import type { PackRecord } from "./packs.ts";
import { buildPackRecords } from "./packs.ts";

// ---------------------------------------------------------------------------
// Passport records
// ---------------------------------------------------------------------------

export interface PassportRecord {
  key: string;
  label: string;
  fixture: "laptop" | "car";
  manifest: PassportManifest;
  events: DomainEvent[];
  /** Links where this passport is either endpoint. */
  links: PassportLink[];
  /** Profile definitions resolved from the manifest bindings. */
  profiles: ProfileDefinition[];
  chainValid: boolean;
  verdicts: Verdict[];
}

export interface World {
  passports: PassportRecord[];
  profilesById: Map<string, ProfileDefinition>;
  registry: RegistryItem[];
  allLinks: PassportLink[];
  /** Recall traversal from the car passport (SDK downstreamOf). */
  carDownstream: string[];
  /** Tier-A pack fixtures with their graded slots (multi-suite honesty). */
  packs: PackRecord[];
}

function linksFor(value: string, links: PassportLink[]): PassportLink[] {
  return links.filter((l) => l.from === value || l.to === value);
}

function profilesFor(manifest: PassportManifest, byId: Map<string, ProfileDefinition>): ProfileDefinition[] {
  const out: ProfileDefinition[] = [];
  for (const binding of manifest.profiles) {
    const def = byId.get(binding.profileId);
    if (def !== undefined && def.version === binding.version) out.push(def);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verdicts (three readings)
// ---------------------------------------------------------------------------

/** ISO 8601 duration string for a millisecond age. */
function durationFromMs(ms: number): string {
  return `PT${Math.max(0, Math.round(ms / 1000))}S`;
}

interface FreshnessAssessment {
  freshness: Freshness;
  detail: string;
  deviceStale: boolean;
}

function assessFreshness(manifest: PassportManifest, events: DomainEvent[]): FreshnessAssessment {
  const cap = CLASS_CAPABILITY[manifest.capabilityClass];
  const last = events.length === 0 ? undefined : events[events.length - 1]!;
  const asOfMs = Date.parse(manifest.asOf);
  const lastMs = last === undefined ? asOfMs : Date.parse(last.occurredAt);

  // Device-commitment freshness: the last milestone.record declares its own
  // freshWithin bound (edge segment, S2/S3).
  let deviceStale = false;
  let deviceDetail = "no device milestones recorded";
  for (const ev of events) {
    if (ev.type !== "milestone.record") continue;
    const payload = ev.payload as { freshWithin?: string };
    const bound = payload.freshWithin;
    if (typeof bound !== "string") continue;
    const ageMs = asOfMs - Date.parse(ev.occurredAt);
    const fresh = compareDurations(durationFromMs(ageMs), bound) <= 0;
    deviceDetail = fresh
      ? `device commitment within ${bound} (last ${ev.occurredAt.slice(0, 10)})`
      : `device commitment stale: last milestone ${ev.occurredAt.slice(0, 10)}, bound ${bound} exceeded`;
    if (!fresh) deviceStale = true;
  }

  if (cap.maxFreshness === undefined) {
    return {
      freshness: deviceStale ? "stale" : "unknown",
      detail: `class ${manifest.capabilityClass} declares no freshness bound; ${deviceDetail}`,
      deviceStale,
    };
  }
  const ageMs = asOfMs - lastMs;
  const fresh = compareDurations(durationFromMs(ageMs), cap.maxFreshness) <= 0;
  return {
    // A stale device commitment degrades the passport-level freshness even
    // when the log head is within the class bound: degradation is explicit.
    freshness: fresh && !deviceStale ? "fresh" : "stale",
    detail: fresh
      ? `log head within class bound ${cap.maxFreshness}; ${deviceDetail}`
      : `log head older than class bound ${cap.maxFreshness}; ${deviceDetail}`,
    deviceStale,
  };
}

function strictestMinimum(profiles: ProfileDefinition[]): TrustMarker {
  let best: TrustMarker = "unsigned";
  for (const p of profiles) {
    const min = p.trustRequirements?.minimumMarker;
    if (min !== undefined && markerAtLeast(min, best)) best = min;
  }
  return best;
}

function strongestMarker(events: DomainEvent[]): TrustMarker {
  let best: TrustMarker = "unsigned";
  for (const ev of events) {
    if (markerAtLeast(ev.trustMarker, best)) best = ev.trustMarker;
  }
  return best;
}

function findingsFor(rec: {
  manifest: PassportManifest;
  events: DomainEvent[];
  profiles: ProfileDefinition[];
  registry: RegistryItem[];
  chainValid: boolean;
  freshness: FreshnessAssessment;
}): Finding[] {
  const out: Finding[] = [];
  const minimum = strictestMinimum(rec.profiles);

  const belowMinimum = rec.events.filter((ev) => !markerAtLeast(ev.trustMarker, minimum)).length;
  if (rec.profiles.length > 0 && belowMinimum > 0) {
    out.push({
      severity: "warning",
      code: "trust-below-minimum",
      message: `${belowMinimum} of ${rec.events.length} events carry a trust marker below the strictest bound profile minimum (${minimum}).`,
    });
  }
  if (!rec.chainValid) {
    out.push({
      severity: "error",
      code: "chain-invalid",
      message: "Commitment chain verification failed: the log has been tampered with or forked.",
    });
  }
  if (rec.freshness.deviceStale) {
    out.push({
      severity: "warning",
      code: "device-commitment-stale",
      message: `Edge-segment commitment is stale at the manifest as-of (${rec.manifest.asOf.slice(0, 10)}): ${rec.freshness.detail}.`,
    });
  }
  for (const ev of rec.events) {
    if (ev.type === "recall.campaign") {
      const payload = ev.payload as { campaignRef?: string; predicate?: string };
      out.push({
        severity: "warning",
        code: "recall-campaign",
        message: `Recall campaign ${payload.campaignRef ?? "?"} declared (log-anchored). Predicate evaluated locally by custodians: ${payload.predicate ?? "?"}.`,
      });
    }
  }
  const dormant = rec.manifest.children.filter((c) => c.dormant === true).length;
  if (dormant > 0) {
    out.push({
      severity: "info",
      code: "dormant-children",
      message: `${dormant} child reference(s) point at dormant identifiers (absorbed under the current regime; issuable by adoption later).`,
    });
  }
  const blind = rec.manifest.children.filter((c) => c.visibility.edge === "blind").length;
  if (blind > 0) {
    out.push({
      severity: "info",
      code: "blind-edges",
      message: `${blind} child reference(s) carry blind edge visibility: proof-of-binding without knowledge-of-parent.`,
    });
  }
  out.push({
    severity: "info",
    code: "no-revocations",
    message: "No revocation records are declared in the fixtures, so the evidentiary and current-state readings coincide.",
  });
  return out;
}

function computeVerdicts(
  manifest: PassportManifest,
  events: DomainEvent[],
  profiles: ProfileDefinition[],
  registry: RegistryItem[],
  chainValid: boolean,
): Verdict[] {
  const freshness = assessFreshness(manifest, events);
  const minimum = strictestMinimum(profiles);
  const checks = events.length;
  const passedEvents = chainValid
    ? events.filter((ev) => markerAtLeast(ev.trustMarker, minimum)).length
    : 0;
  const signedTotal = events.filter((ev) => markerAtLeast(ev.trustMarker, "third-party-attested")).length;

  // Anchor coverage: share of bound profiles whose trust list resolves to a
  // valid registry item in the local anchor bundle.
  const withTrust = profiles.filter((p) => p.trustRequirements !== undefined);
  const anchored = withTrust.filter((p) => {
    const item = p.trustRequirements!.trustList.replace("urn:unidpp:trustlist:", "trustlist-");
    const found = registry.find((r) => r.item === item && r.status === "valid");
    return found !== undefined;
  }).length;
  const anchorCoverage = withTrust.length === 0 ? 1 : anchored / withTrust.length;

  const trustCoverage = checks === 0 ? 1 : passedEvents / checks;
  const findings = findingsFor({ manifest, events, profiles, registry, chainValid, freshness });
  const achieved = strongestMarker(events);

  const readings: VerificationReading[] = ["evidentiary", "current-state", "cryptographic"];
  return readings.map((reading) => {
    let coverage: CoverageReport;
    let outcome: VerdictOutcome;
    let fresh: Freshness;
    if (reading === "cryptographic") {
      // Signature/chain validity alone: no legal retroactivity, no freshness.
      coverage = {
        checks: signedTotal,
        passed: chainValid ? signedTotal : 0,
        signatures: {
          total: signedTotal,
          verified: chainValid ? signedTotal : 0,
          failed: chainValid ? 0 : signedTotal,
          unsupported: 0,
        },
        anchorCoverage,
        trustCoverage: chainValid ? 1 : 0,
      };
      outcome = chainValid ? "pass" : "fail";
      fresh = "unknown";
    } else {
      coverage = {
        checks,
        passed: passedEvents,
        signatures: {
          total: signedTotal,
          verified: chainValid ? signedTotal : 0,
          failed: chainValid ? 0 : signedTotal,
          unsupported: 0,
        },
        anchorCoverage: chainValid ? anchorCoverage : 0,
        trustCoverage,
      };
      outcome = combineOutcome([
        chainValid ? "pass" : "fail",
        outcomeForFreshness(freshness.freshness),
        freshness.deviceStale ? "degraded" : "pass",
        trustCoverage < 1 ? "degraded" : "pass",
      ]);
      fresh = freshness.freshness;
    }
    return { reading, outcome, freshness: fresh, coverage, findings, asOf: manifest.asOf, achievedMarker: achieved };
  });
}

export function freshnessDetail(manifest: PassportManifest, events: DomainEvent[]): string {
  return assessFreshness(manifest, events).detail;
}

// ---------------------------------------------------------------------------
// Registry dataset (synthesized; typed with the SDK's RegistryItem)
// ---------------------------------------------------------------------------

/** Deterministic 64-hex placeholder checksum (display only). */
function checksum64(seed: string): string {
  let out = "";
  let h = 0x811c9dc5;
  while (out.length < 64) {
    for (const ch of seed + out.length) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

interface ItemSpec {
  register: string;
  item: string;
  versions: Array<{
    version: string;
    status: "valid" | "superseded" | "retired";
    registered: string;
    off?: string; // superseded/retired date
    supersededBy?: string;
  }>;
}

const REGISTERS = {
  core: "urn:unidpp:register:core",
  jp: "urn:unidpp:register:jp",
} as const;

const ITEM_SPECS: ItemSpec[] = [
  // Profiles (L2) as registry items, with supersession chains.
  {
    register: REGISTERS.core,
    item: "eu-espr-electronics",
    versions: [
      { version: "1.2.0", status: "superseded", registered: "2026-06-01", off: "2026-11-15", supersededBy: "1.3.0" },
      { version: "1.3.0", status: "valid", registered: "2026-11-15" },
    ],
  },
  {
    register: REGISTERS.jp,
    item: "jp-meti-pse",
    versions: [
      { version: "2026.1", status: "superseded", registered: "2026-01-20", off: "2026-09-20", supersededBy: "2026.2" },
      { version: "2026.2", status: "valid", registered: "2026-09-20" },
    ],
  },
  {
    register: REGISTERS.core,
    item: "eu-vehicle-type-approval",
    versions: [
      { version: "2.0.0", status: "superseded", registered: "2025-03-10", off: "2026-08-30", supersededBy: "2.1.0" },
      { version: "2.1.0", status: "valid", registered: "2026-08-30" },
    ],
  },
  {
    register: REGISTERS.core,
    item: "eu-battery-2023-1542",
    versions: [{ version: "1.0.0", status: "valid", registered: "2026-08-15" }],
  },
  // Data elements referenced by the fixture profiles.
  {
    register: REGISTERS.core,
    item: "de.dpp.operator-id",
    versions: [
      { version: "0.9.0", status: "superseded", registered: "2025-11-02", off: "2026-01-15", supersededBy: "1.0.0" },
      { version: "1.0.0", status: "valid", registered: "2026-01-15" },
    ],
  },
  {
    register: REGISTERS.core,
    item: "de.dpp.reparability-score",
    versions: [
      { version: "1.0.0", status: "retired", registered: "2025-09-01", off: "2026-06-30" },
      { version: "1.1.0", status: "valid", registered: "2026-06-30" },
    ],
  },
  {
    register: REGISTERS.core,
    item: "de.dpp.carbon-footprint",
    versions: [
      { version: "1.1.0", status: "retired", registered: "2026-02-01", off: "2026-10-01" },
      { version: "1.2.0", status: "valid", registered: "2026-10-01" },
    ],
  },
  {
    register: REGISTERS.jp,
    item: "de.jp.pse-mark",
    versions: [
      { version: "1.0.0", status: "superseded", registered: "2025-04-15", off: "2026-05-10", supersededBy: "2.0.0" },
      { version: "2.0.0", status: "valid", registered: "2026-05-10" },
    ],
  },
  {
    register: REGISTERS.jp,
    item: "de.jp.top-runner-class",
    versions: [
      { version: "2025.2", status: "superseded", registered: "2025-08-01", off: "2026-04-01", supersededBy: "2026.1" },
      { version: "2026.1", status: "valid", registered: "2026-04-01" },
    ],
  },
  {
    register: REGISTERS.jp,
    item: "tr.jp.top-runner-binning",
    versions: [
      { version: "2025.2", status: "retired", registered: "2025-08-01", off: "2026-04-01" },
      { version: "2026.1", status: "valid", registered: "2026-04-01" },
    ],
  },
  {
    register: REGISTERS.core,
    item: "de.vehicle.type-approval-no",
    versions: [
      { version: "0.9.0", status: "superseded", registered: "2024-10-01", off: "2025-03-10", supersededBy: "1.0.0" },
      { version: "1.0.0", status: "valid", registered: "2025-03-10" },
    ],
  },
  {
    register: REGISTERS.core,
    item: "de.battery.chemistry",
    versions: [{ version: "1.0.0", status: "valid", registered: "2026-07-01" }],
  },
  {
    register: REGISTERS.core,
    item: "de.battery.carbon-footprint",
    versions: [
      { version: "1.2.0", status: "superseded", registered: "2026-01-05", off: "2026-05-30", supersededBy: "1.3.0" },
      { version: "1.3.0", status: "valid", registered: "2026-05-30" },
    ],
  },
  {
    register: REGISTERS.core,
    item: "de.battery.recycled-content",
    versions: [
      { version: "1.0.0", status: "superseded", registered: "2026-01-05", off: "2026-07-15", supersededBy: "1.1.0" },
      { version: "1.1.0", status: "valid", registered: "2026-07-15" },
    ],
  },
  {
    register: REGISTERS.core,
    item: "de.battery.due-diligence",
    versions: [{ version: "1.0.0", status: "valid", registered: "2026-07-01" }],
  },
  // Cryptographic suites (L4 agility registry).
  { register: REGISTERS.core, item: "ecdsa-p384-sha384", versions: [{ version: "1.0.0", status: "valid", registered: "2025-01-10" }] },
  { register: REGISTERS.core, item: "ecdsa-p256-sha256", versions: [{ version: "1.0.0", status: "valid", registered: "2025-01-10" }] },
  { register: REGISTERS.core, item: "ml-dsa-65", versions: [{ version: "1.0.0", status: "valid", registered: "2025-10-01" }] },
  // Trust anchors / trust lists.
  { register: REGISTERS.core, item: "trustlist-eu", versions: [{ version: "2026.3", status: "valid", registered: "2026-03-01" }] },
  { register: REGISTERS.jp, item: "trustlist-jp", versions: [{ version: "2026.2", status: "valid", registered: "2026-02-01" }] },
  // Units (ISO 80000 / UnitsDB bindings).
  { register: REGISTERS.core, item: "kg", versions: [{ version: "1.0.0", status: "valid", registered: "2025-01-01" }] },
  { register: REGISTERS.core, item: "kwh", versions: [{ version: "1.0.0", status: "valid", registered: "2025-01-01" }] },
];

function buildRegistry(): RegistryItem[] {
  const out: RegistryItem[] = [];
  for (const spec of ITEM_SPECS) {
    for (const v of spec.versions) {
      const itemClass: RegistryItem["itemClass"] = spec.item.startsWith("de.")
        ? "data-element"
        : spec.item.startsWith("tr.")
          ? "transform"
          : spec.item === "eu-espr-electronics" ||
              spec.item === "jp-meti-pse" ||
              spec.item === "eu-vehicle-type-approval" ||
              spec.item === "eu-battery-2023-1542"
            ? "profile"
            : spec.item.startsWith("trustlist-")
              ? "trust-anchor"
              : spec.item === "kg" || spec.item === "kwh"
                ? "unit"
                : "cryptographic-suite";
      out.push({
        register: spec.register,
        item: spec.item,
        version: v.version,
        itemClass,
        status: v.status,
        dates: { proposed: v.registered, registered: v.registered, superseded: v.status === "superseded" ? v.off : undefined, retired: v.status === "retired" ? v.off : undefined },
        supersededBy:
          v.supersededBy === undefined
            ? undefined
            : { register: spec.register, item: spec.item, version: v.supersededBy },
        definition: {
          uri: `https://registry.unidpp.org/${spec.register.split(":").pop()}/${spec.item}/${v.version}.cddal`,
          mediaType: "application/cddal",
          checksum: checksum64(`${spec.register}:${spec.item}:${v.version}`),
        },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// World assembly
// ---------------------------------------------------------------------------

export async function buildWorld(): Promise<World> {
  const laptop: LaptopFixture = await buildLaptop();
  const car: CarFixture = await buildCar();

  const profilesById = new Map<string, ProfileDefinition>();
  for (const p of [...laptop.profiles, ...car.profiles]) profilesById.set(p.profileId, p);

  const allLinks = [...laptop.links, ...car.links];
  const registry = buildRegistry();

  const specs: Array<{ key: string; label: string; fixture: "laptop" | "car"; manifest: PassportManifest; events: DomainEvent[] }> = [
    {
      key: "laptop",
      label: "Laptop — Nordwave LAT-7",
      fixture: "laptop",
      manifest: laptop.manifest,
      events: laptop.events,
    },
    {
      key: "car",
      label: "Car — Autowerke EV-C1",
      fixture: "car",
      manifest: car.car.manifest,
      events: car.car.events,
    },
    {
      key: "battery",
      label: "Battery pack — Cellco BP52-000841",
      fixture: "car",
      manifest: car.battery.manifest,
      events: car.battery.events,
    },
  ];

  const passports: PassportRecord[] = [];
  for (const spec of specs) {
    const chainValid = await verifyChain(spec.events);
    const profiles = profilesFor(spec.manifest, profilesById);
    passports.push({
      key: spec.key,
      label: spec.label,
      fixture: spec.fixture,
      manifest: spec.manifest,
      events: spec.events,
      links: linksFor(spec.manifest.passportId.value, allLinks),
      profiles,
      chainValid,
      verdicts: computeVerdicts(spec.manifest, spec.events, profiles, registry, chainValid),
    });
  }

  const carPassport = passports.find((p) => p.key === "car")!;
  const carDownstream = [...downstreamOf(allLinks, carPassport.manifest.passportId.value)];
  const packs = await buildPackRecords();

  return { passports, profilesById, registry, allLinks, carDownstream, packs };
}

// ---------------------------------------------------------------------------
// Registry lookups + applicability (as-of queries)
// ---------------------------------------------------------------------------

export function findRegistryItem(ref: RegistryItemRef, registry: RegistryItem[]): RegistryItem | undefined {
  return registry.find((r) => r.register === ref.register && r.item === ref.item && r.version === ref.version);
}

export function profileRegistryItem(profileId: string, version: string, registry: RegistryItem[]): RegistryItem | undefined {
  const item = profileId.split(":").pop() ?? profileId;
  return registry.find((r) => r.item === item && r.version === version);
}

export type BindingState = "applies" | "not-yet" | "ended";

export function bindingStateAt(binding: ProfileBinding, at: string): BindingState {
  if (at < binding.effective.from) return "not-yet";
  if (binding.effective.until !== undefined && at >= binding.effective.until) return "ended";
  return "applies";
}

/** Supersession chains: item groups with more than one version, oldest first. */
export function supersessionChains(registry: RegistryItem[]): RegistryItem[][] {
  const groups = new Map<string, RegistryItem[]>();
  for (const item of registry) {
    const key = `${item.register}::${item.item}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.values()]
    .filter((list) => list.length > 1)
    .map((list) => list.sort((a, b) => (a.dates.registered ?? a.dates.proposed).localeCompare(b.dates.registered ?? b.dates.proposed)));
}
