# Can a TLS scan see a CA key like eMudhra's?

> **Project page.** For "can a passive TLS check tell that a certificate's
> private key is trivially recoverable, as in the eMudhra incident?"

Status: **research note, 2026-10-22. The check it proposes ships in
`lib/tls.js`.**

## Summary

- **Question.** eMudhra's broken intermediate keys were tiny integers. Does
  the public key in a certificate give that away to a scanner that only
  completes a TLS handshake?
- **Method.** We read the primary source, Mozilla bug 2083449 (Jackson,
  2026). We worked out what the public key reveals, built a check, and tested
  it on keys made from known scalars, on the two real revoked intermediates,
  and on a local TLS server.
- **Result.** Yes. On P-256, P-384 and P-521, comparing the public point with
  k·G for every k below 1,024 finds such a key, and a match is proof. The
  check flags both real eMudhra DV intermediates. It shipped in commit
  `3a0635c` and was first released in Penthera 1.9.0.
- **Limits.** It finds scalars below 1,024 on three NIST curves only. It does
  not cover RSA key weaknesses. It sees only the chain a server sends. The
  timings below come from development runs, with no script in the repo.

| Record | |
|---|---|
| Written | 2026-10-22 |
| Penthera | 1.8.0 when written; the check is in 1.9.0 and later |
| Code and tests | commit [`3a0635c`](https://github.com/danoszz/penthera/commit/3a0635c807162b49bba8d59c74d02ee92ccd4882): `lib/tls.js`, `tests/tls-weak-keys.test.js`, `tests/fixtures/tls/` |
| Targets | keys built in the test, two public certificates, a server on 127.0.0.1. No third-party host was scanned. |
| Last reviewed | 2026-10-29 (see [Changes](#changes)) |

## What happened (primary source)

[Mozilla bug 2083449](https://bugzilla.mozilla.org/show_bug.cgi?id=2083449),
"eMudhra: Private key compromise of Intermediate Certificates", opened
2026-10-18 (Jackson, 2026):

- On 17 October a researcher reported to the Chrome, Mozilla, Apple and
  Microsoft root programs that the private keys of 8 eMudhra intermediates
  could be recovered. Mozilla recovered them independently within two hours.
- Six are TLS intermediates (EM DV, OV and EV TLS CA, series G3B and G3C,
  under emSign Root TLS CA - G3); two are code-signing CAs. Sectigo had
  cross-signed some of them.
- Mozilla's analysis (comment 5): all 8 are the P-384 keys of the B and C
  series from one key ceremony on 30 April 2025, and **every private key is an
  integer below 256**: "effectively all-zeroes apart from the last byte". The
  P-384 keys of the A and A-1 series did not fall to the same attack. RSA keys
  had not been examined yet.
- eMudhra revoked the 8 certificates on 18 October (`caCompromise`), and Sectigo
  revoked its cross-signs on 19 October. On 20 October Mozilla and Chrome
  removed trust in emSign ECC Root CA - G3, and eMudhra stopped issuing under
  it. Roughly 30,000 certificates need to move to the RSA root.

## Does the public key give it away?

Yes, and without any doubt. On an elliptic curve, the public key is the point
Q = k·G, where k is the private scalar and G the curve's fixed generator.
When k < 256, a checker that computes 1·G, 2·G, ..., 255·G and compares each
with Q finds k. The only input is the public key, which every certificate
carries. Three properties make this sound for a scanner:

- **No false positives.** An honest key is a uniform k in [1, n). The chance
  that it falls below 2^10 is about 2^-374 on P-384 and 2^-246 on P-256. A
  match is proof, so the finding is `confirmed`.
- **Cheap.** Node's `crypto.createECDH(curve).setPrivateKey(k)` gives k·G.
  1,023 of them take about 10 ms on P-256 and 100 ms on P-384. Penthera
  builds the table once per process, only for curves it actually sees.
  Comparing the x-coordinate alone also catches k' = n − k, since −Q has the
  same x.
- **Passive.** The TLS check already completes a handshake and reads the
  chain the server sends (`getPeerCertificate(true)`). Nothing else is sent.

The bound is 1,024: four times the scalars eMudhra used. It catches the same
class of mistake (a counter, a test value, a truncated or zeroed random
buffer). A larger bound costs linearly: 2^16 would take about 6 s per scan
on P-384. A real discrete-log search (baby-step giant-step) would need
elliptic-curve point addition, which Node does not expose. That would mean
writing curve arithmetic in BigInt, which isn't worth it for a scanner.

Two alternatives were set aside:

- **A list of the compromised certificates' fingerprints.** It is redundant,
  since the arithmetic check catches all 8 keys and every cross-sign of them
  without data to maintain. It also only covers this one incident.
- **RSA.** The same idea does not carry over: no RSA key is "small" in this
  sense, and the known RSA key weaknesses (shared primes, Fermat-close primes,
  ROCA) are separate checks. Shared primes were measured across the internet
  by Heninger et al. (2012), and ROCA was described by Nemec et al. (2017).
  Nothing in the bug says the RSA keys are weak.

## What ships

`lib/tls.js` walks the chain the server presents. For each EC certificate on
P-256, P-384 or P-521 whose key is k·G with k < 1024, it reports a
**critical** finding: "TLS certificate has a private key anyone can compute",
or, for an intermediate, "CA certificate "<CN>" in the served chain has a
private key anyone can compute". The private key is never printed.

How it was checked:

- Unit tests on keys built from known scalars, at the bound and next to it.
- The two real revoked intermediates, EM DV TLS CA - G3B and G3C (public
  certificates from crt.sh, SHA-256 `42C4ACCD…1493` and `0164D7CE…4D19`, in
  `tests/fixtures/tls/`), both flagged.
- An end-to-end handshake with a local TLS server whose key is k = 200,
  using a certificate built in the test (no committed private key, no
  external host).

Who is helped: browsers already distrust these intermediates (OneCRL,
CRLSet, root removal). But clients that do not check revocation, or that use
a bundled CA store such as certifi or webpki-roots before their update, would
still accept a chain built on them. A server still sending one of these
intermediates is a misconfiguration worth a critical finding.

## What it means for you

- From 1.9.0, every URL scan of an `https://` target runs this check on the
  chain your server sends, in the handshake the TLS check already makes. A hit is critical and confirmed: replace the
  certificate and the intermediate, and treat the key as public.
- No hit means no key in the chain is below the bound. It says nothing about
  larger weak keys, RSA keys, or certificates the server does not send.

## Reproduce

The tests need no network. From a checkout of the repository:

```bash
npm ci
npx vitest run tests/tls-weak-keys.test.js
```

- Code: `smallPrivateScalar` and `weakKeysInChain` in
  [`lib/tls.js`](https://github.com/danoszz/penthera/blob/main/lib/tls.js).
- Data: the two public intermediate certificates in
  [`tests/fixtures/tls/`](https://github.com/danoszz/penthera/tree/main/tests/fixtures/tls),
  taken from crt.sh. The weak test key is built at run time by
  `tests/fixtures/tls/cert.js`.
- Not shared: nothing. No private key is in the repository, because none is
  needed.

## Threats to validity

- **One source for the incident facts.** The timeline and the "below 256"
  finding come from the Mozilla bug. Its comment 5 calls the analysis
  preliminary. The check itself does not depend on it: it was validated on
  the two public certificates.
- **The bound is a choice.** A key with a scalar of 1,024 or more, or a key
  weak in another way, is not found. We know of no data on how often such
  keys occur.
- **The false-positive figure counts one sign.** The code also matches n − k,
  which doubles the chance; the comment in `lib/tls.js` gives it as 2^-245 on
  P-256. Either way a match by chance is not a practical concern.
- **Timings are rough.** The 10 ms, 100 ms and 6 s figures come from runs
  during development. The repository has no benchmark script for them.
- **Only the served chain.** A server can send a short chain. The check does
  not fetch missing intermediates, so it cannot see a weak key the server
  leaves out.

## References

Heninger, N., Durumeric, Z., Wustrow, E., & Halderman, J. A. (2012). Mining your Ps and Qs: Detection of widespread weak keys in network devices. In *21st USENIX Security Symposium (USENIX Security 12)* (pp. 205–220). USENIX Association. [https://www.usenix.org/conference/usenixsecurity12/technical-sessions/presentation/heninger](https://www.usenix.org/conference/usenixsecurity12/technical-sessions/presentation/heninger) ([entry](../references.md#heninger2012mining))

Jackson, D. (2026, October 18). *eMudhra: Private key compromise of intermediate certificates* [Bug 2083449]. Bugzilla@Mozilla, CA Program :: CA Certificate Compliance. Retrieved October 29, 2026, from [https://bugzilla.mozilla.org/show_bug.cgi?id=2083449](https://bugzilla.mozilla.org/show_bug.cgi?id=2083449) ([entry](../references.md#jackson2026emudhra))

Nemec, M., Sys, M., Svenda, P., Klinec, D., & Matyas, V. (2017). The return of Coppersmith's attack: Practical factorization of widely used RSA moduli. In *Proceedings of the 2017 ACM SIGSAC Conference on Computer and Communications Security* (pp. 1631–1648). ACM. [https://doi.org/10.1145/3133956.3133969](https://doi.org/10.1145/3133956.3133969) ([entry](../references.md#nemec2017roca))

## Changes

- 2026-10-22: first version, with the check (commit `3a0635c`).
- 2026-10-29: added the summary, the record, what it means for you,
  reproduction steps, threats to validity and APA references. No result or
  number changed.
