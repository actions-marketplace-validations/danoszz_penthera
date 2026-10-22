/**
 * TLS/SSL Scanner
 *
 * Checks certificate validity, cipher strength, and protocol version
 * using Node.js built-in `tls` module, zero dependencies.
 *
 * Inspired by: httpx (JARM fingerprinting), testssl.sh, ssl-labs
 */
import tls from "node:tls";
import { X509Certificate, createECDH } from "node:crypto";

const WEAK_CIPHERS = new Set([
  "DES-CBC3-SHA", "RC4-SHA", "RC4-MD5", "DES-CBC-SHA",
  "EXP-RC4-MD5", "EXP-DES-CBC-SHA", "EXP-RC2-CBC-MD5",
  "NULL-MD5", "NULL-SHA", "NULL-SHA256",
]);

const WEAK_PROTOCOLS = new Set(["TLSv1", "TLSv1.1", "SSLv3"]);

// EC keys whose private scalar is tiny. eMudhra's P-384 intermediates used
// scalars below 256 (Mozilla bug 2083449, Oct 2026): the public point was
// k·G, so anyone could recover k by trying each one. Trying k = 1..LIMIT-1
// and comparing x-coordinates (which also covers n - k) costs about 10 ms
// on P-256 and 100 ms on P-384, once per process per curve.
const SMALL_SCALAR_LIMIT = 1024;
const EC_CURVES = { "P-256": ["prime256v1", 32], "P-384": ["secp384r1", 48], "P-521": ["secp521r1", 66] };
const smallScalarX = new Map();

function smallScalarTable(crv) {
  if (smallScalarX.has(crv)) return smallScalarX.get(crv);
  const [name, len] = EC_CURVES[crv];
  const ecdh = createECDH(name);
  const scalar = Buffer.alloc(len);
  const table = new Map();
  for (let k = 1; k < SMALL_SCALAR_LIMIT; k++) {
    scalar.writeUInt16BE(k, len - 2);
    ecdh.setPrivateKey(scalar);
    table.set(ecdh.getPublicKey().subarray(1, 1 + len).toString("base64url"), k);
  }
  smallScalarX.set(crv, table);
  return table;
}

/**
 * The private scalar of an EC public key (a KeyObject) when it is below
 * SMALL_SCALAR_LIMIT, up to sign, else null. An honestly generated key lands
 * here with probability about 2^-245 on P-256, so a hit is never a guess.
 */
export function smallPrivateScalar(publicKey) {
  if (publicKey?.asymmetricKeyType !== "ec") return null;
  const jwk = publicKey.export({ format: "jwk" });
  if (!EC_CURVES[jwk.crv]) return null;
  return smallScalarTable(jwk.crv).get(jwk.x) ?? null;
}

/** Certificates in a peer chain (getPeerCertificate(true)) whose key is a small scalar. */
export function weakKeysInChain(cert) {
  const out = [];
  const seen = new Set();
  for (let c = cert, depth = 0; c?.raw && !seen.has(c.fingerprint256); c = c.issuerCertificate, depth++) {
    seen.add(c.fingerprint256);
    let pub;
    try { pub = new X509Certificate(c.raw).publicKey; } catch { continue; }
    if (smallPrivateScalar(pub) === null) continue;
    out.push({ depth, subject: c.subject?.CN || "unknown", issuer: c.issuer?.CN || "unknown", fingerprint256: c.fingerprint256, curve: pub.export({ format: "jwk" }).crv });
  }
  return out;
}

/**
 * Check TLS configuration for a hostname.
 *
 * @param {string} hostname - Target hostname (no protocol)
 * @param {number} port - Target port (default: 443)
 * @param {number} timeout - Connection timeout in ms
 * @returns {object} TLS scan result
 */
export function checkTls(hostname, port = 443, timeout = 10_000) {
  return new Promise((resolve) => {
    // Validation is off on purpose, and only on this socket: the audit has to
    // complete the handshake with a target whose certificate is expired,
    // self-signed or for the wrong name, so it can report exactly that. The
    // verdict comes from socket.authorized / authorizationError below. The
    // socket only reads the handshake (cert, protocol, cipher) and is closed
    // straight away; no request or credential is ever sent over it. Every
    // other connection Penthera makes keeps Node's default validation.
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false },
      () => {
        const cert = socket.getPeerCertificate(true);
        const protocol = socket.getProtocol();
        const cipher = socket.getCipher();
        const authorized = socket.authorized;
        const authError = socket.authorizationError || null;
        socket.end();

        const now = new Date();
        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const daysUntilExpiry = Math.floor((validTo - now) / 86400000);

        // Extract SAN (Subject Alternative Names)
        const altNames = cert.subjectaltname
          ? cert.subjectaltname.split(", ").map((s) => s.replace("DNS:", ""))
          : [];

        // Determine findings
        const findings = [];

        if (!authorized) {
          findings.push({
            severity: "high",
            title: "TLS certificate not trusted",
            description: authError || "Certificate validation failed",
          });
        }

        if (daysUntilExpiry < 0) {
          findings.push({
            severity: "critical",
            title: "TLS certificate expired",
            description: `Expired ${Math.abs(daysUntilExpiry)} days ago (${validTo.toISOString().slice(0, 10)})`,
          });
        } else if (daysUntilExpiry < 30) {
          findings.push({
            severity: "medium",
            title: "TLS certificate expiring soon",
            description: `Expires in ${daysUntilExpiry} days (${validTo.toISOString().slice(0, 10)})`,
          });
        }

        // The private key is never printed: knowing it is trivial is the finding.
        for (const w of weakKeysInChain(cert)) {
          const what = w.depth === 0 ? "TLS certificate" : `CA certificate "${w.subject}" in the served chain`;
          findings.push({
            severity: "critical",
            title: `${what} has a private key anyone can compute`,
            description: `The ${w.curve} public key of ${w.depth === 0 ? `the certificate for ${w.subject}` : `"${w.subject}" (issued by ${w.issuer})`} is k·G for a private scalar k below ${SMALL_SCALAR_LIMIT}, so anyone can recover the private key by trying each k. ${w.depth === 0 ? "Anyone can impersonate this server." : "Anyone can issue certificates that chain through this CA."} This is the flaw in eMudhra's P-384 intermediates (Mozilla bug 2083449, https://bugzilla.mozilla.org/show_bug.cgi?id=2083449). SHA-256 fingerprint ${w.fingerprint256}. ${w.depth === 0 ? "Generate a new key with a vetted library or HSM and replace the certificate." : "Move to a certificate from a different issuing CA and stop serving this one in the chain."}`,
          });
        }

        if (WEAK_PROTOCOLS.has(protocol)) {
          findings.push({
            severity: "high",
            title: `Weak TLS protocol: ${protocol}`,
            description: "TLSv1.0 and TLSv1.1 are deprecated. Use TLSv1.2 or TLSv1.3.",
          });
        }

        if (WEAK_CIPHERS.has(cipher?.name)) {
          findings.push({
            severity: "high",
            title: `Weak cipher suite: ${cipher.name}`,
            description: "This cipher is considered insecure.",
          });
        }

        if (cipher?.name && !cipher.name.includes("GCM") && !cipher.name.includes("CHACHA")) {
          findings.push({
            severity: "low",
            title: `Non-AEAD cipher: ${cipher.name}`,
            description: "Consider using AEAD ciphers (GCM, ChaCha20-Poly1305) for better security.",
          });
        }

        resolve({
          valid: authorized,
          protocol,
          cipher: cipher?.name || "unknown",
          cipherVersion: cipher?.version || "unknown",
          issuer: cert.issuer?.O || cert.issuer?.CN || "unknown",
          subject: cert.subject?.CN || "unknown",
          altNames,
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          daysUntilExpiry,
          serialNumber: cert.serialNumber,
          fingerprint256: cert.fingerprint256,
          findings,
        });
      },
    );

    socket.setTimeout(timeout);
    socket.on("timeout", () => {
      socket.destroy();
      resolve({
        valid: false,
        protocol: null,
        cipher: null,
        error: "Connection timeout",
        findings: [{
          severity: "medium",
          title: "TLS connection timeout",
          description: `Could not establish TLS connection within ${timeout}ms`,
        }],
      });
    });
    socket.on("error", (err) => {
      resolve({
        valid: false,
        protocol: null,
        cipher: null,
        error: err.message,
        findings: [{
          severity: "medium",
          title: "TLS connection failed",
          description: err.message,
        }],
      });
    });
  });
}
