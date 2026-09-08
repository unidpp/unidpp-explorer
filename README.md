# unidpp-explorer
Part of UniDPP (github.com/unidpp).
TypeScript implementation of the international DPP framework.
License: MIT.

## The Packs view and the browser limitation (stated plainly)

The Packs view renders offline Tier-A carriers in the multi-suite
co-signature model: one pack body, several signature slots. Two fixture
packs are shown, both minted with the Rust verifier's own signing path
(`unidpp-cli` src/packfile.rs `sign_pack_suites`, seed `fixture-93`,
real GM/T 0003 SM2 computation on the Rust side):

- a **co-signed pack** (`ecdsa-p256` + `sm2` over one body): the P-256
  slot is verified in the browser through WebCrypto; the SM2 slot is
  shown as deferred with its documented reason, and the pack verdict is
  degraded — not failed, not silently passed;
- a **pure-SM2 pack** (a CN-anchored deployment's carrier): it degrades
  wholly — verdict "degraded", finding "no anchor/computed suite for
  sm2-sm3 in this build". The page renders; nothing crashes.

**Browser limitation.** This reference browser is EU-classical:
WebCrypto computes ECDSA (P-256/P-384); it does not compute SM2 or
ML-DSA. The explorer does not hand-roll SM2 cryptography in TypeScript
— a deferred suite is reported with an explicit reason, and its bytes
are never interpreted. The slot grading ladder (deferred suite first,
then anchor routing by key id, then real verification under the pinned
anchor) lives in one place: the SDK's slot policy
(`unidpp-ts/packages/verify/src/slotPolicy.ts`), mirroring the Rust
verifier's `SlotCheck` semantics.

**Sovereign-suite implication.** A verifier anchors itself in a
jurisdiction by which suites it can compute. A CN-anchored deployment
that relies on SM2 is read on a CN-capable terminal (a build with a
GM/T 0003 binding); this browser reads the same pack as degraded on
the SM2 slot while still verifying the P-256 co-signature. Neither
terminal misrepresents the other's slots.
