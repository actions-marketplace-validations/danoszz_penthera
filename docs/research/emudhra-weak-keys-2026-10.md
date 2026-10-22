# Can a TLS scan see a CA key like eMudhra's?

Status: **research note, 2026-10-22. The check it proposes ships in
`lib/tls.js`.**

## What happened (primary source)

[Mozilla bug 2083449](https://bugzilla.mozilla.org/show_bug.cgi?id=2083449),
"eMudhra: Private key compromise of Intermediate Certificates", opened
2026-10-18:

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
  ROCA) are separate checks. Nothing in the bug says the RSA keys are weak.

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
