/**
 * Headless smoke test: loads the app's data pipeline (src/data.ts) through
 * Vite's SSR module loader, so the same code path the browser runs —
 * @unidpp/model fixtures, commitment-chain verification, verdict
 * computation, registry dataset — executes in Node and is asserted here.
 *
 * Run: npm run smoke   (after npm install)
 */
import { createServer } from "vite";

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) {
    console.log(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures++;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const server = await createServer({
  configFile: "vite.config.ts",
  server: { middlewareMode: true },
  logLevel: "error",
});

try {
  const data = await server.ssrLoadModule("/src/data.ts");
  const world = await data.buildWorld();

  const byKey = Object.fromEntries(world.passports.map((p) => [p.key, p]));

  check("three passports load from fixtures", world.passports.length === 3, world.passports.map((p) => p.key).join(", "));
  check("laptop has 5 events", byKey.laptop.events.length === 5);
  check("car has 3 events", byKey.car.events.length === 3);
  check("battery has 3 events", byKey.battery.events.length === 3);

  check("laptop commitment chain verifies", byKey.laptop.chainValid === true);
  check("car commitment chain verifies", byKey.car.chainValid === true);
  check("battery commitment chain verifies", byKey.battery.chainValid === true);

  for (const p of world.passports) {
    check(`${p.key}: three verdict readings`, p.verdicts.length === 3 && p.verdicts.map((v) => v.reading).join(",") === "evidentiary,current-state,cryptographic");
  }

  const batteryVerdicts = byKey.battery.verdicts;
  check(
    "battery evidentiary reading is degraded (stale device commitment + recall)",
    batteryVerdicts[0].outcome === "degraded" && batteryVerdicts[0].freshness === "stale",
    `outcome=${batteryVerdicts[0].outcome} freshness=${batteryVerdicts[0].freshness}`,
  );
  check(
    "battery cryptographic reading passes on chain validity",
    batteryVerdicts[2].outcome === "pass" && batteryVerdicts[2].freshness === "unknown",
  );
  check(
    "battery findings include the recall campaign",
    batteryVerdicts[0].findings.some((f) => f.code === "recall-campaign"),
  );

  check("laptop profiles resolve (EU + JP)", byKey.laptop.profiles.length === 2, byKey.laptop.profiles.map((p) => p.profileId).join(", "));
  check("laptop declares 4 child references (2 SoDIMM, battery, dormant display lot)", byKey.laptop.manifest.children.length === 4);
  check("battery declares 2 dormant cell-lot children", byKey.battery.manifest.children.every((c) => c.dormant === true) && byKey.battery.manifest.children.length === 2);

  const registry = world.registry;
  check("registry has >= 25 ISO 19135 items", registry.length >= 25, String(registry.length));
  const statuses = new Set(registry.map((i) => i.status));
  check("registry statuses include valid/superseded/retired", statuses.has("valid") && statuses.has("superseded") && statuses.has("retired"), [...statuses].join(","));
  const chains = data.supersessionChains(registry);
  check("supersession chains exist", chains.length >= 8, `${chains.length} chains`);
  const longest = chains.reduce((a, b) => (b.length > a.length ? b : a), []);
  check("chains are length 2 (superseded -> valid or retired)", longest.length === 2, `longest ${longest.length}`);

  // Applicability at 2026-12-01: JP profile applies, EU electronics not yet.
  const jp = data.bindingStateAt(byKey.laptop.manifest.profiles.find((b) => b.profileId.includes("jp-meti-pse")), "2026-12-01T00:00:00Z");
  const eu = data.bindingStateAt(byKey.laptop.manifest.profiles.find((b) => b.profileId.includes("eu-espr-electronics")), "2026-12-01T00:00:00Z");
  check("JP profile applies at 2026-12-01", jp === "applies");
  check("EU electronics profile not yet bound at 2026-12-01 (window opens 2027-01-01)", eu === "not-yet");

  check("recall traversal from car reaches the battery pack", world.carDownstream.some((id) => id.includes("battery-pack-bp52")), world.carDownstream.join(", "));

  // View rendering (pure string functions, no DOM needed): assert the
  // fixture data reaches the markup.
  const passportsView = await server.ssrLoadModule("/src/views/passports.ts");
  const registryView = await server.ssrLoadModule("/src/views/registry.ts");
  const transformView = await server.ssrLoadModule("/src/views/transform.ts");

  const list = passportsView.renderPassportList(world);
  check("passport list renders all three passports", ["Laptop", "Car", "Battery pack"].every((label) => list.includes(label)));

  const batteryDetail = passportsView.renderPassportDetail(world, "battery");
  check("battery detail renders core fields + profiles + links + events + verdicts",
    ["Core fields", "Profile manifest", "Typed links", "Event log", "Verdicts"].every((h) => batteryDetail.includes(h)));
  check("battery detail shows the blind edge with parent withheld", batteryDetail.includes("parent withheld") && batteryDetail.includes("proof of binding"));
  check("battery detail shows the recall event", batteryDetail.includes("recall.campaign") && batteryDetail.includes("urn:eu:recall:2027-06-batt-bp52"));
  check("battery detail shows recoverability badges", batteryDetail.includes("harvestable") && batteryDetail.includes("absorbing"));

  const laptopDetail = passportsView.renderPassportDetail(world, "laptop");
  check("laptop detail shows EU and JP profiles with windows", laptopDetail.includes("eu-espr-electronics") && laptopDetail.includes("jp-meti-pse") && laptopDetail.includes("2026-10-01"));

  const registryHtml = registryView.renderRegistry(world);
  check("registry view renders items, chains, applicability slider",
    registryHtml.includes("ISO 19135 items") && registryHtml.includes("Supersession chains") && registryHtml.includes("asof-slider"));
  check("registry view lists valid/superseded/retired statuses", ["valid", "superseded", "retired"].every((s) => registryHtml.includes(`>${s}<`)));

  const transformHtml = transformView.renderTransform(world);
  check("transform view renders graph, ledger, notes", transformHtml.includes("Mass-balance ledger") && transformHtml.includes("svg") && transformHtml.includes("cell-lot-c75-2026b"));
  check("transform ledger balances", transformHtml.includes("98.3") && transformHtml.includes("96.8"));

  // Tier-A packs (multi-suite honesty): the co-signed pack verifies its
  // P-256 slot and defers the SM2 slot with a reason; the pure-SM2 pack
  // degrades wholly — never a broken page.
  check("two pack records load", world.packs.length === 2, world.packs.map((p) => p.key).join(", "));
  const cosigned = world.packs.find((p) => p.key === "cosigned");
  const pureSm2 = world.packs.find((p) => p.key === "pure-sm2");
  check("co-signed pack verdict is degraded (P-256 verified, SM2 deferred)", cosigned.verdict.outcome === "degraded");
  check(
    "co-signed coverage: 1 of 2 slots verified, 0 failed, 1 deferred",
    cosigned.verdict.coverage.signatures.total === 2 &&
      cosigned.verdict.coverage.signatures.verified === 1 &&
      cosigned.verdict.coverage.signatures.failed === 0 &&
      cosigned.verdict.coverage.signatures.unsupported === 1,
  );
  check(
    "co-signed per-slot grades: ecdsa-p256 verified, sm2 deferred",
    cosigned.slots.some((s) => s.framing.suite === "ecdsa-p256-sha256" && s.check.kind === "verified") &&
      cosigned.slots.some((s) => s.framing.suite === "sm2-sm3" && s.check.kind === "deferred"),
  );
  check(
    "SM2 deferral carries the documented reason",
    cosigned.slots.find((s) => s.framing.suite === "sm2-sm3").check.reason.includes("GM/T 0003"),
  );
  check("pure-SM2 pack degrades wholly", pureSm2.verdict.outcome === "degraded");
  check(
    "pure-SM2 whole-degradation finding names the suite",
    pureSm2.verdict.findings.some((f) => f.code === "no-computed-suite" && f.message.includes("no anchor/computed suite for sm2-sm3 in this build")),
  );
  check("pure-SM2 has no error findings (degraded, not failed)", pureSm2.verdict.findings.every((f) => f.severity !== "error"));

  const packsView = await server.ssrLoadModule("/src/views/packs.ts");
  const packsHtml = packsView.renderPacks(world.packs);
  check("packs view renders both packs", packsHtml.includes("Co-signed pack") && packsHtml.includes("Pure-SM2 pack"));
  check(
    "packs view shows the P-256 slot verified and the SM2 slot deferred with reason",
    packsHtml.includes("ecdsa-p256-sha256") &&
      packsHtml.includes("sm2-sm3") &&
      packsHtml.includes(">verified<") &&
      packsHtml.includes(">deferred<") &&
      packsHtml.includes("GM/T 0003"),
  );
  check("packs view shows the whole-degradation finding for the pure-SM2 pack", packsHtml.includes("no-computed-suite"));
  check("packs view states the browser limitation", packsHtml.includes("CN-capable terminal"));
} catch (err) {
  failures++;
  console.error("FAIL data pipeline threw:", err);
} finally {
  await server.close();
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
