/** Formatting helpers shared by all views. Plain labels, no marketing language. */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape dynamic text before HTML interpolation. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/** Shorten a URN to its last two segments; the full value rides in `title`. */
export function shortId(value: string): string {
  const parts = value.split(":");
  if (parts.length <= 2) return value;
  return "…" + parts.slice(-2).join(":");
}

/** Register URN -> short register label ("core", "jp"). */
export function shortRegister(register: string): string {
  const parts = register.split(":");
  return parts[parts.length - 1] ?? register;
}

/** "2026-08-03T09:15:00Z" -> "2026-08-03 09:15 UTC". */
export function fmtDateTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Commitment hash -> first 12 hex digits (full value in `title`). */
export function shortHash(hash: string): string {
  return hash === "" ? "—" : `${hash.slice(0, 12)}…`;
}

export const TRUST_MARKERS = [
  "unsigned",
  "self-declared",
  "third-party-attested",
  "multi-signed",
  "log-anchored",
] as const;

export function markerRank(marker: string): number {
  const index = (TRUST_MARKERS as readonly string[]).indexOf(marker);
  return index === -1 ? 0 : index;
}

/** Five-step strength meter plus label. */
export function trustMeter(marker: string): string {
  const rank = markerRank(marker);
  let squares = "";
  for (let i = 0; i < TRUST_MARKERS.length; i++) {
    squares += `<span class="sq${i < rank ? " on" : ""}"></span>`;
  }
  return `<span class="trust">${squares}<span class="trust-label">${esc(marker)}</span></span>`;
}

export type BadgeTone = "valid" | "muted" | "warn" | "navy";

export function badge(text: string, tone: BadgeTone, title?: string): string {
  return `<span class="badge badge-${tone}"${title ? ` title="${esc(title)}"` : ""}>${esc(text)}</span>`;
}

/** Status badge for registry items / passport status. */
export function statusBadge(status: string): string {
  switch (status) {
    case "valid":
    case "active":
      return badge(status, "valid");
    case "superseded":
    case "archived":
    case "dormant":
    case "consumed":
      return badge(status, "muted");
    case "retired":
      return badge(status, "muted", "item withdrawn from the register");
    default:
      return badge(status, "navy");
  }
}

/** Recoverability spectrum (R3): informational, not good/bad. */
export function recoverabilityBadge(recoverability: string): string {
  return badge(recoverability, "navy", "recoverability class of the installation binding");
}

/** Edge visibility class (I12). */
export function visibilityBadge(edge: string, audiences?: string[]): string {
  const title =
    edge === "restricted" && audiences && audiences.length > 0
      ? `audiences: ${audiences.join(", ")}`
      : edge === "blind"
        ? "proof-of-binding without knowledge-of-parent"
        : edge;
  return badge(`edge: ${edge}`, edge === "blind" ? "warn" : "muted", title);
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
