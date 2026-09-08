/**
 * Tier-A pack view (multi-suite honesty): render the co-signed pack
 * (P-256 slot verified, SM2 slot deferred with its reason) and the
 * pure-SM2 pack (wholly degraded) using the same verdict/degradation
 * language as the passport verdict panel — outcome badges, coverage
 * counts, and the findings list. A suite this browser cannot compute is
 * shown as deferred with the documented reason, never as a failure and
 * never as a silent pass.
 */
import type { SlotCheck } from "@unidpp/verify";
import type { PackRecord, PackSlotView } from "../packs.ts";
import { badge, esc, fmtDate, pct, shortHash, shortId } from "../fmt.ts";

const SLOT_BADGE: Record<SlotCheck["kind"], { text: string; tone: "valid" | "warn" | "muted" }> = {
  verified: { text: "verified", tone: "valid" },
  deferred: { text: "deferred", tone: "warn" },
  "unknown-key": { text: "no anchor", tone: "warn" },
  invalid: { text: "invalid", tone: "warn" },
  voided: { text: "voided", tone: "warn" },
};

/** The human-facing detail line for one graded slot (reasons are visible, not tooltips). */
function slotDetail(view: PackSlotView): string {
  const check = view.check;
  switch (check.kind) {
    case "verified":
      return `signature verified (${check.suite}, ${check.keyId}) against the pinned anchor`;
    case "deferred":
      return `degraded with reason — ${check.reason}`;
    case "unknown-key": {
      const pinned = check.anchorKeyIds.length === 0 ? "nothing" : check.anchorKeyIds.join(", ");
      return `slot names key ${check.keyId} but the anchor set pins ${pinned}: the trust configuration does not cover this signer`;
    }
    case "invalid":
      return `<span class="neg">${esc(check.why)}</span>`;
    case "voided":
      return esc(check.reason);
  }
}

function slotRows(record: PackRecord): string {
  return record.slots
    .map((view) => {
      const b = SLOT_BADGE[view.check.kind];
      return `<tr>
  <td><span class="mono">${esc(view.framing.suite)}</span><div class="cell-sub meta">signed ${esc(fmtDate(view.framing.signedAt))}</div></td>
  <td class="mono" title="${esc(view.framing.keyId)}">${esc(shortId(view.framing.keyId))}</td>
  <td>${badge(b.text, b.tone, view.check.kind === "deferred" ? "framing-only suite in this build: computation deferred to a binding, the verdict degrades" : undefined)}</td>
  <td>${slotDetail(view)}</td>
</tr>`;
    })
    .join("");
}

function verdictLine(record: PackRecord): string {
  const v = record.verdict;
  const outcome =
    v.outcome === "pass" ? badge("pass", "valid") : v.outcome === "degraded" ? badge("degraded", "warn") : badge("fail", "warn");
  const cov = v.coverage.signatures;
  return `<div class="tablewrap"><table class="kv">
  <tr><th scope="row">Verdict (${esc(v.reading)} reading)</th><td>${outcome}</td></tr>
  <tr><th scope="row">Signature slots</th><td>${cov.verified}/${cov.total} verified, ${cov.failed} failed, ${cov.unsupported} deferred</td></tr>
  <tr><th scope="row">Coverage</th><td>${cov.total === 0 ? "—" : `${v.coverage.passed}/${v.coverage.checks} checks`}</td></tr>
  <tr><th scope="row">Anchors pinned</th><td>${[...record.anchors.keys()].map((id) => `<span class="chip mono" title="${esc(id)}">${esc(shortId(id))}</span>`).join(" ")}<div class="cell-sub meta">${pct(v.coverage.anchorCoverage)} of slot key material resolved against the anchor set</div></td></tr>
  <tr><th scope="row">Strongest marker</th><td><span class="mono">${esc(v.achievedMarker)}</span><div class="cell-sub meta">verified as of ${esc(fmtDate(v.asOf))}</div></td></tr>
</table></div>`;
}

function findingsList(record: PackRecord): string {
  if (record.verdict.findings.length === 0) {
    return `<p class="meta">No findings — every slot verified.</p>`;
  }
  const rows = record.verdict.findings
    .map((f) => {
      const tone = f.severity === "error" ? "neg" : f.severity === "warning" ? "warn-text" : "meta";
      return `<li><span class="mono finding-code ${tone}">${esc(f.code)}</span> ${esc(f.message)}</li>`;
    })
    .join("");
  return `<h3>Findings</h3>
<ul class="findings">${rows}</ul>`;
}

function packSection(record: PackRecord): string {
  const p = record.pack;
  return `
<p class="eyebrow">Tier-A pack · ${esc(record.key)}</p>
<h2>${esc(record.label)}</h2>
<p class="meta">${esc(record.provenance)}. Subject <span class="mono">${esc(p.subjectId.value)}</span>, log head <span class="mono" title="${esc(p.logCommitment.commitment)}">${esc(shortHash(p.logCommitment.commitment))}</span>, validity ${esc(fmtDate(p.validity.notBefore))} → ${esc(fmtDate(p.validity.notAfter))}.</p>
${verdictLine(record)}
<h3>Signature slots</h3>
<p class="meta">Each filled slot is graded per suite against the anchor set (routed by key id): P-256 verifies through WebCrypto; SM2 is framing-only in this browser and defers with its reason.</p>
<div class="tablewrap">
<table>
  <caption>One pack body, sovereign suites side by side — degradation is scoped to the slot, never global.</caption>
  <thead><tr><th scope="col">Suite</th><th scope="col">Key id</th><th scope="col">Outcome</th><th scope="col">Detail</th></tr></thead>
  <tbody>${slotRows(record)}</tbody>
</table>
</div>
${findingsList(record)}`;
}

export function renderPacks(records: PackRecord[]): string {
  return `
<p class="lede">Offline Tier-A carriers carry the multi-suite co-signature model: one pack body, several signature slots. The issuer mints P-256 + SM2 co-signed packs and pure-SM2 packs; this browser verifies what it can compute (WebCrypto ECDSA) and reports every other suite as deferred with its reason — a CN-anchored verifier uses a CN-capable terminal.</p>
${records.map(packSection).join("")}`;
}
