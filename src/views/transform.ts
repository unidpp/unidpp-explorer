/**
 * Transform view: the car battery lineage as a graph with quantities and a
 * mass-balance ledger. Nodes and edges come from the car fixture (dormant
 * cell-lot identifiers, the battery pack, the installation into the car);
 * quantities are annotations added by this view (see notes).
 */
import type { World } from "../data.ts";
import { esc, shortId } from "../fmt.ts";

interface LineageNode {
  id: string;
  title: string;
  qty: string;
  badges: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  dashed?: boolean;
}

interface LineageEdge {
  from: string;
  to: string;
  label: string[];
  points: string;
  dashed?: boolean;
  evidence: string;
}

const NODES: LineageNode[] = [
  {
    id: "urn:unidpp:id:cell-lot-c75-2026b-0001",
    title: "Cell lot 0001",
    qty: "61.4 kg",
    badges: ["dormant"],
    x: 30,
    y: 40,
    w: 210,
    h: 92,
  },
  {
    id: "urn:unidpp:id:cell-lot-c75-2026b-0002",
    title: "Cell lot 0002",
    qty: "36.9 kg",
    badges: ["dormant"],
    x: 30,
    y: 210,
    w: 210,
    h: 92,
  },
  {
    id: "urn:iso:std:iso-iec:15459:unidpp:passport:battery-pack-bp52-000841",
    title: "Battery pack BP52-000841",
    qty: "96.8 kg",
    badges: ["passport", "S2"],
    x: 350,
    y: 125,
    w: 240,
    h: 92,
  },
  {
    id: "urn:iso:std:iso-iec:15459:unidpp:passport:car-wvwzzz1jzxw000841",
    title: "Car WVWZZZ1JZXW000841",
    qty: "contains 96.8 kg pack",
    badges: ["passport", "S2"],
    x: 690,
    y: 125,
    w: 210,
    h: 92,
  },
  {
    id: "urn:unidpp:id:bp52-harvested-prospective",
    title: "Harvested pack (prospective)",
    qty: "96.2 kg",
    badges: ["harvestable", "with parent history"],
    x: 350,
    y: 320,
    w: 240,
    h: 92,
    dashed: true,
  },
];

const EDGES: LineageEdge[] = [
  {
    from: "urn:unidpp:id:cell-lot-c75-2026b-0001",
    to: "urn:iso:std:iso-iec:15459:unidpp:passport:battery-pack-bp52-000841",
    label: ["derivation (R2)", "welded-module-assembly", "absorbing"],
    points: "240,86 350,155",
    evidence: "absorption recorded at finest available granularity in the pack's manifest (dormant identifiers)",
  },
  {
    from: "urn:unidpp:id:cell-lot-c75-2026b-0002",
    to: "urn:iso:std:iso-iec:15459:unidpp:passport:battery-pack-bp52-000841",
    label: ["derivation (R2)", "welded-module-assembly", "absorbing"],
    points: "240,256 350,185",
    evidence: "same assembly event; lot-recorded inputs, count carried in the build record",
  },
  {
    from: "urn:iso:std:iso-iec:15459:unidpp:passport:battery-pack-bp52-000841",
    to: "urn:iso:std:iso-iec:15459:unidpp:passport:car-wvwzzz1jzxw000841",
    label: ["installation (R3)", "bolted-busbar · harvestable", "pairing: firmware · edge: blind"],
    points: "590,171 690,171",
    evidence: "evt-car-002 upgrade.install (2026-09-12); proof-of-binding commitment in the pack's log, parent withheld",
  },
  {
    from: "urn:iso:std:iso-iec:15459:unidpp:passport:battery-pack-bp52-000841",
    to: "urn:unidpp:id:bp52-harvested-prospective",
    label: ["prospective harvest", "E2 uninstall"],
    points: "470,217 470,320",
    dashed: true,
    evidence: "admitted by recoverability=harvestable; no harvest event exists in the fixture",
  },
];

interface LedgerRow {
  step: string;
  kind: string;
  inputs: string;
  outputs: string;
  inQty: number;
  outQty: number;
  unit: string;
}

const LEDGER: LedgerRow[] = [
  {
    step: "Module assembly (combine, N→1)",
    kind: "transformation",
    inputs: "lot 0001 (61.4 kg) + lot 0002 (36.9 kg)",
    outputs: "pack BP52-000841",
    inQty: 98.3,
    outQty: 96.8,
    unit: "kg",
  },
  {
    step: "Install in car (traction-battery-1)",
    kind: "installation, no mass change",
    inputs: "pack BP52-000841",
    outputs: "pack in car",
    inQty: 96.8,
    outQty: 96.8,
    unit: "kg",
  },
  {
    step: "Prospective harvest",
    kind: "prospective (E2 uninstall)",
    inputs: "pack in car",
    outputs: "harvested pack",
    inQty: 96.8,
    outQty: 96.2,
    unit: "kg",
  },
];

function nodeSvg(node: LineageNode): string {
  const cx = node.x + node.w / 2;
  return `
<g class="graph-node${node.dashed === true ? " graph-node-dashed" : ""}">
  <rect x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="6" />
  <text class="graph-title" x="${cx}" y="${node.y + 22}">${esc(node.title)}</text>
  <text class="graph-id" x="${cx}" y="${node.y + 40}">${esc(shortId(node.id))}</text>
  <text class="graph-qty" x="${cx}" y="${node.y + 60}">${esc(node.qty)}</text>
  ${node.badges.map((b, i) => `<rect class="graph-badge-box" x="${node.x + 12 + i * 108}" y="${node.y + 68}" width="${Math.min(104, 16 + b.length * 6.4)}" height="16" rx="8" /><text class="graph-badge" x="${node.x + 14 + i * 108} " y="${node.y + 79.5}">${esc(b)}</text>`).join("")}
</g>`;
}

function edgeLabelSvg(edge: LineageEdge): string {
  // Midpoint of the segment; small stacked labels.
  const pts = edge.points.split(" ").map((s) => s.split(",").map(Number));
  const from = pts[0] ?? [0, 0];
  const to = pts[1] ?? [0, 0];
  const mx = (from[0]! + to[0]!) / 2;
  const my = (from[1]! + to[1]!) / 2;
  const lines = edge.label
    .map((line, i) => `<text class="graph-edge-label" x="${mx}" y="${my - 6 + i * 13}" text-anchor="middle">${esc(line)}</text>`)
    .join("");
  return lines;
}

function graphSvg(): string {
  const defs = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" />
    </marker>
  </defs>`;
  const edges = EDGES.map(
    (e) => `<line class="graph-edge${e.dashed === true ? " graph-edge-dashed" : ""}" x1="${e.points.split(" ")[0]!.split(",")[0]}" y1="${e.points.split(" ")[0]!.split(",")[1]}" x2="${e.points.split(" ")[1]!.split(",")[0]}" y2="${e.points.split(" ")[1]!.split(",")[1]}" marker-end="url(#arrow)" />${edgeLabelSvg(e)}`,
  ).join("");
  return `<svg viewBox="0 0 930 440" role="img" aria-label="Battery transform lineage: cell lots to pack to installed pack, with a prospective harvest branch" class="graph">${defs}${edges}${NODES.map(nodeSvg).join("")}</svg>`;
}

function ledgerTable(): string {
  const rows = LEDGER.map(
    (r) => `<tr>
  <td>${esc(r.step)}<div class="cell-sub meta">${esc(r.kind)}</div></td>
  <td>${esc(r.inputs)}</td>
  <td>${esc(r.outputs)}</td>
  <td class="num">${r.inQty.toFixed(1)}</td>
  <td class="num">${r.outQty.toFixed(1)}</td>
  <td class="num">${(r.inQty - r.outQty).toFixed(1)}</td>
  <td>${esc(r.unit)}</td>
</tr>`,
  ).join("");
  const totalIn = LEDGER.reduce((s, r) => s + r.inQty, 0);
  const totalOut = LEDGER.reduce((s, r) => s + r.outQty, 0);
  return `<div class="tablewrap">
<table>
  <caption>Mass balance: inputs − outputs = loss per transformation. Losses are auditable process losses, never copies; a quantity leaving one ledger enters the next as a new measured fact with provenance "computed by transformation event".</caption>
  <thead><tr><th scope="col">Step</th><th scope="col">Inputs</th><th scope="col">Outputs</th><th scope="col" class="num">In (kg)</th><th scope="col" class="num">Out (kg)</th><th scope="col" class="num">Loss (kg)</th><th scope="col">Unit</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><th scope="row" colspan="3">Totals</th><td class="num">${totalIn.toFixed(1)}</td><td class="num">${totalOut.toFixed(1)}</td><td class="num">${(totalIn - totalOut).toFixed(1)}</td><td>kg</td></tr></tfoot>
</table>
</div>`;
}

function edgesEvidence(): string {
  return `<ul class="findings">${EDGES.map(
    (e) =>
      `<li><span class="mono finding-code">${esc(e.label[0] ?? "")}</span> ${esc(e.from.split(":").pop() ?? "")} → ${esc(e.to.split(":").pop() ?? "")}: ${esc(e.evidence)}</li>`,
  ).join("")}</ul>`;
}

export function renderTransform(world: World): string {
  const recallNote =
    world.carDownstream.length > 0
      ? `Recall traversal from the car (SDK <code>downstreamOf</code>) reaches: ${world.carDownstream
          .map((id) => `<span class="mono">${esc(shortId(id))}</span>`)
          .join(", ")}. The recall set is never enumerated centrally; each custodian evaluates the published predicate locally.`
      : "Recall traversal from the car reaches no downstream passports.";
  return `
<p class="eyebrow">Transform</p>
<h1>Battery lineage</h1>
<p class="lede">The car battery lineage from the car fixture: two dormant cell lots are absorbed into pack BP52-000841 (derivation, R2), the pack is installed in the car (installation, R3, harvestable, blind edge), and the recoverability class admits a future harvest that would restore a marketable object carrying its parent history.</p>
<div class="plate graph-plate">
  ${graphSvg()}
</div>
<h2>Mass-balance ledger</h2>
${ledgerTable()}
<h2>Edge evidence</h2>
${edgesEvidence()}
<h2>Notes</h2>
<ul class="findings">
  <li><span class="mono finding-code">quantities</span> Masses are annotations added by this view for the ledger demonstration. The fixture records identifiers, methods, and recoverability; <code>ChildReference</code> carries no counts. The unit "kg" is registry item <span class="mono">urn:unidpp:register:core/kg</span> (valid).</li>
  <li><span class="mono finding-code">dormant</span> The cell lots are dormant identifiers: no passport exists behind them under the current regime. A future cell-passport regime adopts these identifiers rather than minting new ones, which connects the installed base retroactively through the build record.</li>
  <li><span class="mono finding-code">recoverability</span> Disassembly that restores a marketable object with identity continuity is R3 (installation); identity dissolving into material is R2 (derivation). The pack's binding is harvestable — recovered but altered, continuing with harvested status plus parent history ("60 000 km in car X, removed because…").</li>
  <li><span class="mono finding-code">blind edge</span> The installation edge is blind: the pack's log carries a salted commitment to the car, verifiable as "validly installed in some parent" without revealing which. Disclosure only by ceremony.</li>
  <li><span class="mono finding-code">cross-fixture</span> The laptop fixture references <span class="mono">urn:unidpp:passport:battery-pack-bp52-000841</span> — the same lot/serial BP52-000841 under a different URN prefix. The join is noted here, not asserted: identifier equality is scheme-qualified.</li>
  <li><span class="mono finding-code">recall</span> ${recallNote}</li>
</ul>`;
}
