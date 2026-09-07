/**
 * UniDPP explorer entry point: hash router + shell. Vanilla TypeScript,
 * no framework. Data loads once from the @unidpp/model fixtures.
 */
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./style.css";
import { buildWorld } from "./data.ts";
import type { World } from "./data.ts";
import { renderPassportDetail, renderPassportList } from "./views/passports.ts";
import { bindRegistry, renderRegistry } from "./views/registry.ts";
import { renderTransform } from "./views/transform.ts";
import { esc } from "./fmt.ts";

const app = document.querySelector<HTMLElement>("#app");
let world: World | undefined;

const NAV: Array<{ href: string; label: string; match: (route: string) => boolean }> = [
  { href: "#/", label: "Passports", match: (r) => r === "/" || r.startsWith("/passport") },
  { href: "#/registry", label: "Registry", match: (r) => r === "/registry" },
  { href: "#/transform", label: "Transform", match: (r) => r === "/transform" },
];

function navHtml(route: string): string {
  return NAV.map((n) => `<a href="${n.href}"${n.match(route) ? ' class="active" aria-current="page"' : ""}>${n.label}</a>`).join("");
}

function shell(route: string, bodyHtml: string): string {
  return `
<header class="site-head">
  <div class="head-inner">
    <div>
      <p class="eyebrow">UniDPP explorer</p>
      <p class="head-title">Passports, profiles, registry</p>
    </div>
    <nav class="site-nav" aria-label="Views">${navHtml(route)}</nav>
  </div>
</header>
<main id="main">${bodyHtml}</main>
<footer class="site-foot">
  <span>Fixtures: @unidpp/model (laptop, car). Commitments and chains recomputed in the browser with WebCrypto SHA-256.</span>
  <a href="https://www.unidpp.org/">unidpp.org</a>
  <a href="https://github.com/unidpp">github.com/unidpp</a>
</footer>`;
}

function route(): string {
  const hash = window.location.hash.replace(/^#/, "");
  return hash === "" ? "/" : hash;
}

function render(): void {
  if (app === null) return;
  if (world === undefined) {
    app.innerHTML = shell("/", `<p class="meta">Loading fixtures…</p>`);
    return;
  }
  const r = route();
  let body: string;
  if (r === "/") {
    body = renderPassportList(world);
  } else if (r.startsWith("/passport/")) {
    body = renderPassportDetail(world, r.slice("/passport/".length));
  } else if (r === "/registry") {
    body = renderRegistry(world);
  } else if (r === "/transform") {
    body = renderTransform(world);
  } else {
    body = `<p class="note">No view at ${esc(r)}. <a href="#/">Back to the passport list.</a></p>`;
  }
  app.innerHTML = shell(r, body);
  if (r === "/registry") {
    const main = app.querySelector<HTMLElement>("main");
    if (main !== null) bindRegistry(main, world);
  }
  window.scrollTo(0, 0);
}

async function boot(): Promise<void> {
  try {
    world = await buildWorld();
  } catch (err) {
    if (app !== null) {
      app.innerHTML = shell(
        "/",
        `<p class="note neg">Failed to load fixtures: ${esc(err instanceof Error ? err.message : String(err))}</p>`,
      );
    }
    return;
  }
  render();
  window.addEventListener("hashchange", render);
}

void boot();
