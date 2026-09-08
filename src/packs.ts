/**
 * Tier-A pack data layer (multi-suite honesty, TODO 93): two fixture
 * packs verified in the browser with the SDK's own verify package —
 *
 * - a co-signed pack (ecdsa-p256 + sm2 over one body): the P-256 slot
 *   verifies through WebCrypto, the SM2 slot defers with an explicit
 *   reason;
 * - a pure-SM2 pack (a CN-anchored deployment's carrier): degrades
 *   wholly — verdict "degraded", reason "no anchor/computed suite for
 *   sm2-sm3 in this build" — never a broken page.
 *
 * Per-slot outcomes come from the SDK's slot policy (`checkSlot`), the
 * pack verdict from `verifyTierAPack`; this module only assembles the
 * record the view renders.
 *
 * Fixture provenance — every byte from a real mint:
 *
 * - Carrier packs (hex): minted 2026-09-08 with the Rust verifier's own
 *   code path (`unidpp-cli` src/packfile.rs `sign_pack_suites`), seed
 *   `fixture-93`, one body co-signed by `ecdsa-p256,sm2` and a second
 *   pack carrying the `sm2` slot alone (RustCrypto `sm2`, deterministic
 *   GM/T 0003 signing). Kept as the provenance record; the browser
 *   model below is the JSON projection of the same mint.
 * - SM2 slot bytes/key id/anchor: minted above, carried verbatim. This
 *   browser defers the suite, so the bytes are never interpreted.
 * - P-256 slot: WebCrypto ECDSA over this pack's canonical-JSON body
 *   (the same bytes `signedPayload` produces); key id in the Rust
 *   `KeyId::of` derivation form.
 */
import { checkSlot, defaultSlots, signedPayload, verifyTierAPack } from "@unidpp/verify";
import type { SlotCheck, PublicKeyMaterial, TrustAnchors } from "@unidpp/verify";
import type { SignatureFraming, TierAPack, Verdict } from "@unidpp/model";

/** The verification moment of the demo (inside the packs' validity window). */
export const PACK_NOW = "2027-06-01T12:00:00Z";

/** The Rust-minted carrier packs (provenance record; not decoded here). */
export const COSIGNED_PACK_HEX =
  "011000000030312b34303036333831333333393331022800000068747470733a2f2f7265736f6c7665722e756e696470702e6f72672f722f666978747572652d3933031e00000075726e3a756e696470703a70617373706f72743a666978747572652d3933040d000000656f2d666978747572652d3933050600000069737375656406040000006e6f6e650714000000323032372d30312d31355430383a30303a30305a08000914000000323032372d30312d31355430383a30303a30305a0a01eb595ebcc060336f57eabc311610549779ec33e68a9f3ff65bd44cc7071503f30b020c01120000006b2d32613464623464653430303236643839400097ef8a428b91c55fc9f54d72712255bd2358c765b7414e198426b2e89f3683a4acb9f34129fda9d80d1b53db367031391c8fe3c258cc9050bd2982661a55522b0c02120000006b2d38366631643836353332323765346164400016b72c156f08694d29d66e3f5156a879ef5e06ed149e7548dd4ee9ce29e45576ade665e382e54e786c48e52e9472d993517dcd230fe33075397e0f34e95c657f";

export const PURE_SM2_PACK_HEX =
  "011000000030312b34303036333831333333393331022800000068747470733a2f2f7265736f6c7665722e756e696470702e6f72672f722f666978747572652d3933031e00000075726e3a756e696470703a70617373706f72743a666978747572652d3933040d000000656f2d666978747572652d3933050600000069737375656406040000006e6f6e650714000000323032372d30312d31355430383a30303a30305a08000914000000323032372d30312d31355430383a30303a30305a0a01eb595ebcc060336f57eabc311610549779ec33e68a9f3ff65bd44cc7071503f30b010c02120000006b2d38366631643836353332323765346164400016b72c156f08694d29d66e3f5156a879ef5e06ed149e7548dd4ee9ce29e45576ade665e382e54e786c48e52e9472d993517dcd230fe33075397e0f34e95c657f";

/** SM2 slot material as minted by the Rust build (seed `fixture-93`). */
const SM2_SLOT = {
  keyId: "k-86f1d8653227e4ad",
  value: "FrcsFW8IaU0p1m4/UVaoee9eBu0UnnVI3U7pzinkVXat5mXjguVOeGxI5S6UctmTUX3NIw/jMHU5fg806Vxlfw==",
  anchorHex: "044233c0735dccf01b0288da5bafefed02eb87138943e88d025a8c5a30a9e35a0ca9b0e31ba809064adcbfd26766b59c86134d132bf6784d471c129156e2c01213",
} as const;

/** Browser P-256 slot material: WebCrypto ECDSA over the canonical-JSON body. */
const P256_SLOT = {
  keyId: "k-9fdf5285b4a26c6e",
  value: "Gp8noM9LEFjVwMpjlaqiS1mjwpqQ74ufr247lzLirHmNshyGvavZIOy5ZPeqMlunKX8NW5enVa/mroSHA+X7VA==",
  spkiHex: "3059301306072a8648ce3d020106082a8648ce3d0301070342000471159ca759ea0e3eabecc6aea876a45f76f3f402d2675aa2cf5094fb26462f307ab82d29e5a4e32fbb5a2932ef74f7c521e6d260fbc199ef3d1c80bc6c1590c4",
} as const;

function hexBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** The shared pack body: one body, many sovereign suites. */
function fixture93Body(): TierAPack {
  return {
    kind: "unidpp.tier-a",
    version: "1",
    subjectId: { scheme: "gs1-gtin", value: "gtin:4006381333931", granularity: "batch", state: "live" },
    passportId: { scheme: "unidpp", value: "urn:unidpp:passport:fixture-93", granularity: "item", state: "live" },
    resolverUri: "https://resolver.unidpp.org/r/fixture-93",
    operatorId: "eo-fixture-93",
    status: "active",
    criticalSafety: { recall: false },
    validity: { notBefore: "2027-01-15T08:00:00Z", notAfter: "2037-01-15T08:00:00Z" },
    profiles: [{ profileId: "urn:unidpp:profile:multi-suite-demo", version: "1.0.0" }],
    logCommitment: {
      commitment: "eb595ebcc060336f57eabc311610549779ec33e68a9f3ff65bd44cc7071503f3",
      height: 1,
      asOf: "2027-01-15T08:00:00Z",
    },
    signatures: [],
  };
}

/** The co-signed pack: EU-classical P-256 + CN SM2 over one body. */
function cosignedPack(): TierAPack {
  return {
    ...fixture93Body(),
    signatures: [
      { suite: "ecdsa-p256-sha256", keyId: P256_SLOT.keyId, signedAt: "2027-01-15T08:00:00Z", value: P256_SLOT.value },
      { suite: "sm2-sm3", keyId: SM2_SLOT.keyId, signedAt: "2027-01-15T08:00:00Z", value: SM2_SLOT.value },
    ],
  };
}

/** The pure-SM2 pack: a CN-anchored deployment's carrier. */
function pureSm2Pack(): TierAPack {
  return {
    ...fixture93Body(),
    signatures: [{ suite: "sm2-sm3", keyId: SM2_SLOT.keyId, signedAt: "2027-01-15T08:00:00Z", value: SM2_SLOT.value }],
  };
}

/** The verifier's anchor set: both sovereign signers pinned by key id. */
function fixture93Anchors(): TrustAnchors {
  const sm2Anchor: PublicKeyMaterial = { format: "opaque", material: `sm2:${SM2_SLOT.anchorHex}` };
  return new Map<string, PublicKeyMaterial>([
    [P256_SLOT.keyId, { format: "spki", bytes: hexBytes(P256_SLOT.spkiHex) }],
    [SM2_SLOT.keyId, sm2Anchor],
  ]);
}

/** One signature slot paired with its graded outcome. */
export interface PackSlotView {
  framing: SignatureFraming;
  check: SlotCheck;
}

export interface PackRecord {
  key: string;
  label: string;
  /** How this pack was minted (provenance, shown under the heading). */
  provenance: string;
  pack: TierAPack;
  verdict: Verdict;
  slots: PackSlotView[];
  anchors: TrustAnchors;
}

/** Verify one pack and grade each of its slots through the SDK policy. */
async function buildRecord(
  key: string,
  label: string,
  provenance: string,
  pack: TierAPack,
  anchors: TrustAnchors,
): Promise<PackRecord> {
  const verdict = await verifyTierAPack(pack, { anchors, now: PACK_NOW });
  const slots = await gradeSlots(pack, anchors);
  return { key, label, provenance, pack, verdict, slots, anchors };
}

/** Per-slot grading (the same ladder the verdict pipeline runs). */
async function gradeSlots(pack: TierAPack, anchors: TrustAnchors): Promise<PackSlotView[]> {
  const slots = defaultSlots();
  const payload = signedPayload(pack as unknown as Record<string, unknown>);
  const out: PackSlotView[] = [];
  for (const framing of pack.signatures) {
    out.push({ framing, check: await checkSlot({ framing, payload, slots, anchors }) });
  }
  return out;
}

/** The two demo packs. */
export async function buildPackRecords(): Promise<PackRecord[]> {
  const anchors = fixture93Anchors();
  return [
    await buildRecord(
      "cosigned",
      "Co-signed pack — ecdsa-p256 + sm2",
      'one body, two sovereign suites; minted with the Rust verifier\'s sign path (unidpp-cli sign_pack_suites, seed "fixture-93"), carrier hex recorded in src/packs.ts',
      cosignedPack(),
      anchors,
    ),
    await buildRecord(
      "pure-sm2",
      "Pure-SM2 pack — a CN-anchored carrier",
      'same body, sm2 slot alone (same seed); a CN-capable terminal verifies it — this browser defers the suite',
      pureSm2Pack(),
      anchors,
    ),
  ];
}
