/**
 * Registry view: ISO 19135 items with status (valid/superseded/retired) and
 * supersession chains, plus the applicability timeline ("which profiles
 * applied at T") driven by the passports' dated profile bindings and the
 * registry items' lifecycle dates.
 */
import type { RegistryItem } from "@unidpp/model";
import { itemEffectiveAt } from "@unidpp/model";
import {
  bindingStateAt,
  profileRegistryItem,
  supersessionChains,
} from "../data.ts";
import type { World } from "../data.ts";
import { esc, fmtDate, shortId, statusBadge } from "../fmt.ts";

const DAY_MS = 86_400_000;
const SLIDER_MIN_ISO = "2026-08-01T00:00:00Z";
const SLIDER_MAX_ISO = "2027-07-01T00:00:00Z";
const DEFAULT_ISO = "2026-12-01T00:00:00Z";

/** Module-level view state, survives re-renders of other routes. */
let selectedClass = "all";
let selectedStatus = "all";
let sliderIso = DEFAULT_ISO;

function toDay(iso: string): number {
  return Math.floor(Date.parse(iso) / DAY_MS);
}
function fromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10) + "T00:00:00Z";
}

const CLASSES = [
  "all",
  "data-element",
  "profile",
  "transform",
  "cryptographic-suite",
  "trust-anchor",
  "unit",
];
const STATUSES = ["all", "valid", "superseded", "retired"];

function itemsTable(world: World): string {
  const items = world.registry.filter(
    (i) =>
      (selectedClass === "all" || i.itemClass === selectedClass) &&
      (selectedStatus === "all" || i.status === selectedStatus),
  );
  const rows = items
    .map((i) => {
      const dates = [
        i.dates.registered ? `registered ${fmtDate(i.dates.registered)}` : `proposed ${fmtDate(i.dates.proposed)}`,
        i.dates.superseded ? `superseded ${fmtDate(i.dates.superseded)}` : undefined,
        i.dates.retired ? `retired ${fmtDate(i.dates.retired)}` : undefined,
      ]
        .filter((x) => x !== undefined)
        .join(" · ");
      const sup = i.supersededBy
        ? `→ <span class="mono">${esc(i.supersededBy.version)}</span>`
        : i.status === "retired"
          ? '<span class="meta">no successor</span>'
          : "—";
      return `<tr>
  <td class="mono" title="${esc(i.register)}">${esc(i.item)}</td>
  <td>${esc(i.register.split(":").pop() ?? i.register)}</td>
  <td class="mono">${esc(i.version)}</td>
  <td>${esc(i.itemClass)}</td>
  <td>${statusBadge(i.status)}</td>
  <td class="meta">${esc(dates)}</td>
  <td>${sup}</td>
</tr>`;
    })
    .join("");
  return `<div class="tablewrap">
<table>
  <caption>${items.length} of ${world.registry.length} items shown. Per-version items are immutable and mirrorable; only register status is mutable. Definition checksums are anchored (CDDAL canonicalization, host-stable).</caption>
  <thead><tr><th scope="col">Item</th><th scope="col">Register</th><th scope="col">Version</th><th scope="col">Class</th><th scope="col">Status</th><th scope="col">Dates</th><th scope="col">Superseded by</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>`;
}

function chainsSection(world: World): string {
  const chains = supersessionChains(world.registry);
  const rows = chains
    .map((chain) => {
      const nodes = chain
        .map(
          (i, index) =>
            `${index > 0 ? '<span class="chain-arrow">→</span> ' : ""}<span class="chain-node"><span class="mono">${esc(i.version)}</span> ${statusBadge(i.status)}</span>`,
        )
        .join(" ");
      const first = chain[0]!;
      return `<tr>
  <td class="mono" title="${esc(first.register)}">${esc(first.item)}</td>
  <td>${esc(first.register.split(":").pop() ?? first.register)}</td>
  <td>${nodes}</td>
  <td class="meta">${chain[chain.length - 1]!.dates.registered ? `current since ${fmtDate(chain[chain.length - 1]!.dates.registered!)}` : ""}</td>
</tr>`;
    })
    .join("");
  return `<h2>Supersession chains</h2>
<p class="meta">resolveCurrent follows these chains to the valid item version. Superseded versions stay resolvable: profiles pin exact versions, and as-of queries must still reach the version that was in force.</p>
<div class="tablewrap">
<table>
  <thead><tr><th scope="col">Item</th><th scope="col">Register</th><th scope="col">Chain</th><th scope="col">Note</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</div>`;
}

function bindingRowsAt(world: World, at: string): string {
  const rows: string[] = [];
  for (const passport of world.passports) {
    for (const binding of passport.manifest.profiles) {
      const state = bindingStateAt(binding, at);
      const item = profileRegistryItem(binding.profileId, binding.version, world.registry);
      const itemState =
        item === undefined
          ? '<span class="meta">not registered</span>'
          : itemEffectiveAtStr(item, at);
      const stateBadge =
        state === "applies"
          ? '<span class="ok">applies</span>'
          : state === "not-yet"
            ? '<span class="meta">not yet</span>'
            : '<span class="meta">ended</span>';
      rows.push(`<tr>
  <td><a href="#/passport/${esc(passport.key)}">${esc(passport.label)}</a></td>
  <td class="mono" title="${esc(binding.profileId)}">${esc(shortId(binding.profileId))}</td>
  <td class="mono">${esc(binding.version)}</td>
  <td>${esc(fmtDate(binding.effective.from))} → ${binding.effective.until ? esc(fmtDate(binding.effective.until)) : "open"}${binding.effective.retroactive === true ? " · retroactive" : ""}</td>
  <td>${stateBadge}</td>
  <td>${itemState}</td>
</tr>`);
    }
  }
  return rows.join("");
}

function itemEffectiveAtStr(item: RegistryItem, at: string): string {
  const usable = itemEffectiveAt(item, at);
  return usable
    ? `<span class="ok">valid at T</span> <span class="meta">(status ${esc(item.status)})</span>`
    : `<span class="meta">not effective at T</span> (status ${esc(item.status)})`;
}

function applicabilitySection(world: World): string {
  const minDay = toDay(SLIDER_MIN_ISO);
  const maxDay = toDay(SLIDER_MAX_ISO);
  const valueDay = toDay(sliderIso);
  return `<h2>Applicability timeline</h2>
<p class="meta">Move the slider to a date T. The table lists every dated profile binding across the three passports and whether it applied at T, together with the registry item's own lifecycle state at T (itemEffectiveAt). Legal "as-of" queries read exactly this reconstruction.</p>
<div class="slider-row">
  <label class="mono" for="asof-slider">T</label>
  <input type="range" id="asof-slider" min="${minDay}" max="${maxDay}" value="${valueDay}" step="1" />
  <output class="mono" id="asof-readout" for="asof-slider">${esc(fmtDate(sliderIso))}</output>
</div>
<div class="tablewrap" id="asof-table">
<table>
  <thead><tr><th scope="col">Passport</th><th scope="col">Profile</th><th scope="col">Version</th><th scope="col">Window</th><th scope="col">Binding at T</th><th scope="col">Registry item at T</th></tr></thead>
  <tbody>${bindingRowsAt(world, sliderIso)}</tbody>
</table>
</div>`;
}

export function renderRegistry(world: World): string {
  return `
<p class="eyebrow">Registry</p>
<h1>ISO 19135 items</h1>
<p class="lede">FERIN federated registers: data elements, profiles, transforms, crypto suites, trust anchors, units. Items follow the 19135 lifecycle — valid, superseded, retired — and supersession is a chain, not a deletion. The dataset below is synthesized in this explorer around the identifiers the fixtures reference; the SDK ships the RegistryItem model and the registry client, not item fixtures.</p>
<div class="filter-row">
  <label>Class
    <select id="filter-class">${CLASSES.map((c) => `<option value="${c}"${c === selectedClass ? " selected" : ""}>${c}</option>`).join("")}</select>
  </label>
  <label>Status
    <select id="filter-status">${STATUSES.map((s) => `<option value="${s}"${s === selectedStatus ? " selected" : ""}>${s}</option>`).join("")}</select>
  </label>
</div>
${itemsTable(world)}
${chainsSection(world)}
${applicabilitySection(world)}`;
}

/** Wire up filters and the as-of slider after the HTML is in the DOM. */
export function bindRegistry(container: HTMLElement, world: World): void {
  const classSelect = container.querySelector<HTMLSelectElement>("#filter-class");
  const statusSelect = container.querySelector<HTMLSelectElement>("#filter-status");
  const slider = container.querySelector<HTMLInputElement>("#asof-slider");
  const readout = container.querySelector<HTMLElement>("#asof-readout");

  if (classSelect !== null) {
    classSelect.addEventListener("change", () => {
      selectedClass = classSelect.value;
      rerenderItems(container, world);
    });
  }
  if (statusSelect !== null) {
    statusSelect.addEventListener("change", () => {
      selectedStatus = statusSelect.value;
      rerenderItems(container, world);
    });
  }
  if (slider !== null && readout !== null) {
    slider.addEventListener("input", () => {
      sliderIso = fromDay(Number(slider.value));
      readout.textContent = fmtDate(sliderIso);
      const table = container.querySelector("#asof-table");
      const tbody = container.querySelector("#asof-table tbody");
      if (table !== null && tbody !== null) {
        tbody.innerHTML = bindingRowsAt(world, sliderIso);
      }
    });
  }
}

function rerenderItems(container: HTMLElement, world: World): void {
  // Replace the first tablewrap (the items table) without touching the rest.
  const tables = container.querySelectorAll(".tablewrap");
  const first = tables[0];
  if (first !== undefined) {
    const wrap = document.createElement("div");
    wrap.innerHTML = itemsTable(world).trim();
    const replacement = wrap.firstElementChild;
    if (replacement !== null) first.replaceWith(replacement);
  }
}
