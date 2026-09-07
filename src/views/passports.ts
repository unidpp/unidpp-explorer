/**
 * Passport list and detail views. The detail view renders: core fields,
 * the profile manifest (axes, effective windows, capability class), typed
 * links (installation bindings with recoverability + visibility badges),
 * the event log timeline (blind-edge entries carry their commitment hash
 * and a "parent withheld" state), and the verdict panel (three readings,
 * coverage, freshness).
 */
import type { DomainEvent, PassportLink } from "@unidpp/model";
import type { PassportRecord, World } from "../data.ts";
import { freshnessDetail } from "../data.ts";
import {
  badge,
  esc,
  fmtDate,
  fmtDateTime,
  pct,
  recoverabilityBadge,
  shortHash,
  shortId,
  statusBadge,
  trustMeter,
  visibilityBadge,
} from "../fmt.ts";

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function renderPassportList(world: World): string {
  const rows = world.passports
    .map((p) => {
      const subject = p.manifest.subjectId;
      return `<tr>
  <td><a href="#/passport/${esc(p.key)}">${esc(p.label)}</a><div class="cell-sub mono">${esc(shortId(subject.value))}</div></td>
  <td><span class="mono">${esc(subject.scheme)}</span><div class="cell-sub">${esc(subject.granularity)} · ${statusBadge(subject.state)}</div></td>
  <td>${statusBadge(p.manifest.status)}</td>
  <td><span class="mono">${esc(p.manifest.capabilityClass)}</span></td>
  <td>${p.manifest.profiles.length}</td>
  <td>${p.events.length}</td>
  <td>${p.chainValid ? badge("chain verified", "valid") : badge("chain invalid", "warn")}</td>
</tr>`;
    })
    .join("");
  return `
<p class="lede">Three passports come from the two SDK fixtures: the laptop pilot (EU + JP profiles on one neutral core) and the car pilot (car + independently regulated battery pack). Select a passport to read its manifest, links, event log, and verdicts.</p>
<div class="tablewrap">
<table>
  <caption>Passports loaded from @unidpp/model fixtures. Commitments are recomputed in the browser with WebCrypto SHA-256.</caption>
  <thead><tr><th scope="col">Passport</th><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Class</th><th scope="col">Profiles</th><th scope="col">Events</th><th scope="col">Chain</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>`;
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function coreFields(p: PassportRecord): string {
  const m = p.manifest;
  const cap = m.capabilityClass;
  const typeRef = m.typeRef;
  return `
<h2>Core fields</h2>
<div class="tablewrap"><table class="kv">
  <tr><th scope="row">Passport ID</th><td class="mono" title="${esc(m.passportId.value)}">${esc(m.passportId.value)}</td></tr>
  <tr><th scope="row">Subject ID</th><td class="mono" title="${esc(m.subjectId.value)}">${esc(m.subjectId.value)}</td></tr>
  <tr><th scope="row">Subject scheme</th><td>${esc(m.subjectId.scheme)} · granularity ${esc(m.subjectId.granularity)} · ${statusBadge(m.subjectId.state)}</td></tr>
  <tr><th scope="row">Type reference</th><td>${
    typeRef === undefined
      ? '<span class="meta">none (one-off or commissioned orphan object)</span>'
      : `<span class="mono" title="${esc(typeRef.typeId.value)}">${esc(shortId(typeRef.typeId.value))}</span> @ ${esc(typeRef.typeVersion)}${
          typeRef.configurationVector ? `<div class="cell-sub">configuration vector: ${typeRef.configurationVector.map((c) => `<span class="chip">${esc(c)}</span>`).join(" ")}</div>` : ""
        }`
  }</td></tr>
  <tr><th scope="row">Status</th><td>${statusBadge(m.status)}</td></tr>
  <tr><th scope="row">Capability class</th><td><span class="mono">${esc(cap)}</span> — truth modes: ${cap === "S0" ? "silent, testimony-only" : cap === "S1" ? "passive authentication, no logs" : cap === "S2" ? "logged-contact, dumps on physical read" : "connected, full edge segments"}</td></tr>
  <tr><th scope="row">Event log</th><td><a href="${esc(m.eventLog.logUri)}">${esc(m.eventLog.logUri)}</a> · height ${m.eventLog.height} · head commitment <span class="mono" title="${esc(m.eventLog.commitment)}">${esc(shortHash(m.eventLog.commitment))}</span></td></tr>
  <tr><th scope="row">Manifest rendered as of</th><td>${esc(fmtDateTime(m.asOf))}</td></tr>
</table></div>`;
}

function profileManifestSection(p: PassportRecord, world: World): string {
  const m = p.manifest;
  const rows = m.profiles
    .map((binding) => {
      const def = p.profiles.find((d) => d.profileId === binding.profileId);
      const axis = def?.axis ?? {};
      const window = `${fmtDate(binding.effective.from)} → ${binding.effective.until ? fmtDate(binding.effective.until) : "open"}${binding.effective.retroactive === true ? " (retroactive)" : ""}`;
      const trust = def?.trustRequirements;
      const dataPoints =
        def === undefined
          ? '<span class="meta">definition not found in fixture</span>'
          : def.dataPoints
              .map((ref) => {
                const item = world.registry.find(
                  (r) => r.register === ref.register && r.item === ref.item && r.version === ref.version,
                );
                return `<span class="chip" title="${esc(`${ref.register} / ${ref.item} @ ${ref.version}`)}">${esc(ref.item)} @ ${esc(ref.version)}${item ? ` · ${item.status}` : " · unregistered"}</span>`;
              })
              .join(" ");
      return `<tr>
  <td><a href="#/registry" class="mono">${esc(shortId(binding.profileId))}</a><div class="cell-sub mono">${esc(binding.version)}</div></td>
  <td>${esc(axis.jurisdiction ?? "—")}${axis.sector ? ` × ${esc(axis.sector)}` : ""}${axis.characteristic ? ` × ${esc(axis.characteristic)}` : ""}</td>
  <td>${esc(window)}</td>
  <td><span class="mono">${esc(m.capabilityClass)}</span></td>
  <td>${trust ? `${trust.suites.map((s) => `<span class="chip mono">${esc(s)}</span>`).join(" ")}<div class="cell-sub">trust list ${esc(shortId(trust.trustList))} · minimum ${esc(trust.minimumMarker ?? "none")}</div>` : '<span class="meta">none declared</span>'}</td>
  <td>${dataPoints}</td>
</tr>`;
    })
    .join("");
  const cap = CLASS_LABEL[m.capabilityClass];
  return `
<h2>Profile manifest</h2>
<p class="meta">Profile-set growth is dated binding, never new identity. Each binding cites the registry applicability event that added it.</p>
<div class="tablewrap">
<table>
  <caption>Subject capability class ${esc(m.capabilityClass)} (${cap}); profiles declare no freshness bound of their own, so freshness follows the class.</caption>
  <thead><tr><th scope="col">Profile</th><th scope="col">Axes</th><th scope="col">Effective window</th><th scope="col">Class</th><th scope="col">Trust requirements</th><th scope="col">Data points</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>`;
}

const CLASS_LABEL: Record<string, string> = {
  S0: "silent",
  S1: "passive-auth",
  S2: "logged-contact",
  S3: "connected",
};

function childLinksTable(p: PassportRecord): string {
  if (p.manifest.children.length === 0) {
    return `<p class="meta">No child references.</p>`;
  }
  const rows = p.manifest.children
    .map((child) => {
      return `<tr>
  <td>${badge(child.relationship, "navy")}</td>
  <td class="mono" title="${esc(child.childId)}">${esc(shortId(child.childId))}${child.dormant === true ? `<div class="cell-sub">${badge("dormant identifier", "muted", "no passport behind it yet; adopted, never re-minted")}</div>` : ""}</td>
  <td>${child.slotId ? `<span class="mono">${esc(child.slotId)}</span>` : "—"}</td>
  <td>${child.pairing ? esc(child.pairing) : "—"}</td>
  <td>${child.binding ? `${esc(child.binding.method)}<div class="cell-sub">${recoverabilityBadge(child.binding.recoverability)}</div>` : "—"}</td>
  <td>${visibilityBadge(child.visibility.edge, child.visibility.audiences)}</td>
</tr>`;
    })
    .join("");
  return `
<div class="tablewrap">
<table>
  <caption>Child references in this passport's manifest (composition by reference; children resolve elsewhere).</caption>
  <thead><tr><th scope="col">Relationship</th><th scope="col">Child</th><th scope="col">Slot</th><th scope="col">Pairing</th><th scope="col">Binding</th><th scope="col">Visibility</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>`;
}

function ownLinksTable(p: PassportRecord): string {
  if (p.links.length === 0) {
    return `<p class="meta">No typed links reference this passport.</p>`;
  }
  const self = p.manifest.passportId.value;
  const rows = p.links
    .map((link) => {
      const isChildSide = link.direction === "up" && link.to === self;
      const other = link.from === self ? link.to : link.from;
      return `<tr>
  <td>${badge(link.type, "navy")} <span class="meta">${esc(link.direction)}</span></td>
  <td>${isChildSide ? "this passport is installed in" : link.type === "custody" ? "custody held by" : "connected to"} <span class="mono" title="${esc(other)}">${esc(shortId(other))}</span></td>
  <td>${link.slotId ? `<span class="mono">${esc(link.slotId)}</span>` : "—"}</td>
  <td>${link.binding ? `${esc(link.binding.method)}<div class="cell-sub">${recoverabilityBadge(link.binding.recoverability)}</div>` : "—"}${link.pairing ? `<div class="cell-sub">pairing: ${esc(link.pairing)}</div>` : ""}${link.alteration && link.alteration.length > 0 ? `<div class="cell-sub">alteration: ${link.alteration.map(esc).join(", ")}</div>` : ""}</td>
  <td>${visibilityBadge(link.visibility.edge, link.visibility.audiences)}${
    link.visibility.edge === "blind" && link.parentCommitment
      ? `<div class="cell-sub">proof of binding: <span class="mono" title="${esc(link.parentCommitment)}">${esc(shortHash(link.parentCommitment))}</span> ${badge("parent withheld", "warn", "salted commitment to the parent; disclosure only by ceremony")}</div>`
      : ""
  }</td>
  <td>${esc(fmtDate(link.interval.from))} → ${link.interval.until ? esc(fmtDate(link.interval.until)) : "open"}</td>
</tr>`;
    })
    .join("");
  return `
<div class="tablewrap">
<table>
  <caption>Typed links (R1–R7 algebra) recorded in the fixtures where this passport is an endpoint.</caption>
  <thead><tr><th scope="col">Type</th><th scope="col">Counterparty</th><th scope="col">Slot</th><th scope="col">Binding</th><th scope="col">Visibility</th><th scope="col">Interval</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>`;
}

// ---------------------------------------------------------------------------
// Event timeline
// ---------------------------------------------------------------------------

const TAXONOMY: Record<string, string> = {
  "passport.created": "issuance",
  "profile.binding": "profile binding",
  "custody.transfer": "E1 custody transfer",
  "part.replace": "E2 part replace",
  "repair.perform": "E3 repair",
  "product.modify": "E4 modify",
  "software.update": "E5 software update",
  "upgrade.install": "E6 install",
  "refurbish.perform": "E7 refurbish",
  "consumable.replace": "E8 consumable",
  "recall.campaign": "E9 recall",
  "correction.record": "E10 correction",
  "status.change": "E11 status",
  "flag.security": "E12 security flag",
  "material.decompose": "E13 decompose",
  "inspection.stamp": "E14 stamp",
  "milestone.record": "E15 milestone",
};

function actorLabel(actor: { actorId: string; role: string }): string {
  return `<span class="mono" title="${esc(actor.actorId)}">${esc(shortId(actor.actorId))}</span><div class="cell-sub">${esc(actor.role)}</div>`;
}

function payloadSummary(event: DomainEvent): string {
  const p = event.payload as Record<string, unknown>;
  const str = (key: string): string => (typeof p[key] === "string" ? (p[key] as string) : "");
  const short = (key: string): string => {
    const v = p[key];
    return typeof v === "string" ? shortId(v) : "";
  };
  switch (event.type) {
    case "passport.created":
      return `profiles: ${Array.isArray(p.profileIds) ? (p.profileIds as string[]).map((x) => shortId(x)).join(", ") : "?"}${p.typeRef ? ` · type ${shortId(String(p.typeRef))}` : ""}`;
    case "profile.binding":
      return `${shortId(str("profileId"))} @ ${str("version")} from ${str("from")}${p.until ? ` until ${str("until")}` : ""}${p.retroactive === true ? " (retroactive)" : ""}`;
    case "custody.transfer": {
      const from = p.fromActor as { actorId: string } | undefined;
      const to = p.toActor as { actorId: string } | undefined;
      return `${str("conveyance") || "transfer"}: ${from ? shortId(from.actorId) : "?"} → ${to ? shortId(to.actorId) : "?"}`;
    }
    case "software.update":
      return `${str("component")} ${str("fromVersion")} → ${str("toVersion")}${p.featureUnlock === true ? " · feature unlock" : ""}`;
    case "part.replace":
      return `${str("slotId") || "slot"}: removed ${short("removedChildId") || "—"}, installed ${short("installedChildId") || "—"}${p.likeForLike === false ? " · not like-for-like" : " · like-for-like"}`;
    case "upgrade.install":
      return `${str("parentSlot")}: ${short("childId")} · ${str("method")} · ${str("recoverability")} · pairing ${str("pairing")} · edge ${str("visibilityEdge")}`;
    case "recall.campaign":
      return `${str("campaignRef")} — predicate: ${str("predicate")}`;
    case "milestone.record":
      return `device ${short("deviceKeyId")} · fresh within ${str("freshWithin")} · commitment <span class="mono">${esc(shortHash(str("commitment")))}</span>`;
    default:
      return Object.entries(p)
        .slice(0, 4)
        .map(([k, v]) => `${k}=${typeof v === "string" ? (v.length > 40 ? `${v.slice(0, 40)}…` : v) : JSON.stringify(v)}`)
        .join(" · ");
  }
}

interface TimelineRow {
  at: string;
  kind: "event" | "edge";
  event?: DomainEvent;
  edge?: PassportLink;
}

function timelineRows(p: PassportRecord): TimelineRow[] {
  const rows: TimelineRow[] = p.events.map((event) => ({ at: event.occurredAt, kind: "event", event }));
  // Blind installation edges recorded against this passport (the child's
  // proof-of-binding) enter the timeline at their interval start.
  for (const link of p.links) {
    if (link.type === "installation" && link.visibility.edge === "blind" && link.direction === "up" && link.to === p.manifest.passportId.value) {
      rows.push({ at: link.interval.from, kind: "edge", edge: link });
    }
  }
  return rows.sort((a, b) => a.at.localeCompare(b.at));
}

function eventTimeline(p: PassportRecord): string {
  const rows = timelineRows(p)
    .map((row) => {
      if (row.kind === "edge" && row.edge !== undefined) {
        const link = row.edge;
        return `<tr class="row-edge">
  <td>${esc(fmtDateTime(row.at))}</td>
  <td>${badge("installation edge", "navy")}<div class="cell-sub meta">R3, blind</div></td>
  <td><span class="meta">recorded by child custodian</span></td>
  <td><span class="mono trust-label">commitment</span></td>
  <td>Installed in a parent (identity withheld): slot <span class="mono">${esc(link.slotId ?? "—")}</span>, ${esc(link.binding?.method ?? "—")}, ${esc(link.binding?.recoverability ?? "—")}. Proof of binding: <span class="mono" title="${esc(link.parentCommitment ?? "")}">${esc(shortHash(link.parentCommitment ?? ""))}</span> ${badge("parent withheld", "warn", "salted commitment to the parent in the child log; verifiable as validly-installed-in-some-parent without revealing which")}</td>
  <td class="mono" title="${esc(link.parentCommitment ?? "")}">${esc(shortHash(link.parentCommitment ?? ""))}</td>
</tr>`;
      }
      const ev = row.event!;
      const isRecall = ev.type === "recall.campaign";
      return `<tr${isRecall ? ' class="row-warn"' : ""}>
  <td>${esc(fmtDateTime(ev.occurredAt))}</td>
  <td><span class="mono">${esc(ev.type)}</span><div class="cell-sub">${esc(TAXONOMY[ev.type] ?? "")}</div></td>
  <td>${actorLabel(ev.actor)}</td>
  <td>${trustMeter(ev.trustMarker)}</td>
  <td>${payloadSummary(ev)}</td>
  <td class="mono" title="${esc(ev.commitment)}">${esc(shortHash(ev.commitment))}</td>
</tr>`;
    })
    .join("");
  return `
<h2>Event log</h2>
<p class="meta">Append-only; each row hash-links to the previous commitment. The chain is re-verified in the browser: ${
    p.chainValid ? '<span class="ok">verified</span>' : '<span class="neg">verification failed</span>'
  }. Nothing is edited in place; every change is an appended event.</p>
<div class="tablewrap">
<table>
  <thead><tr><th scope="col">Occurred at</th><th scope="col">Event</th><th scope="col">Actor</th><th scope="col">Trust</th><th scope="col">Detail</th><th scope="col">Commitment</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>`;
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

function verdictPanel(p: PassportRecord, world: World): string {
  const rows = p.verdicts
    .map((v) => {
      const outcomeBadge =
        v.outcome === "pass" ? badge("pass", "valid") : v.outcome === "degraded" ? badge("degraded", "warn") : badge("fail", "warn");
      const cov = v.coverage;
      return `<tr>
  <td><span class="mono">${esc(v.reading)}</span><div class="cell-sub meta">${READING_GLOSS[v.reading]}</div></td>
  <td>${outcomeBadge}</td>
  <td><span class="mono">${esc(v.freshness)}</span><div class="cell-sub meta">${esc(freshnessDetail(p.manifest, p.events))}</div></td>
  <td>${cov.checks === 0 ? "—" : `${cov.passed}/${cov.checks} checks (${pct(cov.passed / cov.checks)})`}<div class="cell-sub meta">signatures ${cov.signatures.verified}/${cov.signatures.total} verified, ${cov.signatures.failed} failed</div></td>
  <td>${pct(cov.trustCoverage)} trust · ${pct(cov.anchorCoverage)} anchors</td>
  <td class="mono">${esc(v.achievedMarker)}<div class="cell-sub meta">as of ${esc(fmtDate(v.asOf))}</div></td>
</tr>`;
    })
    .join("");
  const findings = p.verdicts[0]?.findings ?? [];
  const findingRows = findings
    .map((f) => {
      const tone = f.severity === "error" ? "neg" : f.severity === "warning" ? "warn-text" : "meta";
      return `<li><span class="mono finding-code ${tone}">${esc(f.code)}</span> ${esc(f.message)}</li>`;
    })
    .join("");
  return `
<h2>Verdicts</h2>
<p class="meta">Verification is coverage-based, not boolean. Each verdict states which reading it answers; staleness and partial coverage degrade, only integrity failures fail.</p>
<div class="tablewrap">
<table>
  <caption>Computed in the browser from the event log: chain verification (WebCrypto), trust-marker coverage against the strictest bound profile, anchor resolution against the registry view.</caption>
  <thead><tr><th scope="col">Reading</th><th scope="col">Outcome</th><th scope="col">Freshness</th><th scope="col">Coverage</th><th scope="col">Shares</th><th scope="col">Strongest marker</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>
<h3>Findings</h3>
<ul class="findings">${findingRows}</ul>`;
}

const READING_GLOSS: Record<string, string> = {
  evidentiary: "what a diligent verifier could know at the as-of date",
  "current-state": "fraud voids ab initio",
  cryptographic: "signature and chain validity alone",
};

// ---------------------------------------------------------------------------
// Detail assembly
// ---------------------------------------------------------------------------

export function renderPassportDetail(world: World, key: string): string {
  const p = world.passports.find((x) => x.key === key);
  if (p === undefined) {
    return `<p class="note">No passport named ${esc(key)}. <a href="#/">Back to the passport list.</a></p>`;
  }
  return `
<p class="eyebrow">Passport · fixture: ${esc(p.fixture)}</p>
<h1>${esc(p.label)}</h1>
${coreFields(p)}
${profileManifestSection(p, world)}
<h2>Typed links</h2>
${childLinksTable(p)}
${ownLinksTable(p)}
${eventTimeline(p)}
${verdictPanel(p, world)}`;
}
