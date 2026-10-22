/**
 * A self-signed X.509 certificate built in plain Node (crypto has no
 * certificate builder): just enough DER for a TLS server in tests. The key
 * can be given as a private scalar, so a test can serve a certificate whose
 * private key is deliberately tiny, the eMudhra flaw.
 */
import { createECDH, createPrivateKey, createPublicKey, sign, generateKeyPairSync } from "node:crypto";

const CURVES = { "P-256": ["prime256v1", 32, "sha256", "2a8648ce3d040302"], "P-384": ["secp384r1", 48, "sha384", "2a8648ce3d040303"] };

const len = (n) => (n < 0x80 ? Buffer.from([n]) : n < 0x100 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 0xff]));
const tlv = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), len(body.length), body]);
};
const seq = (...p) => tlv(0x30, ...p);
const oid = (hex) => tlv(0x06, Buffer.from(hex, "hex"));
const utcTime = (d) => tlv(0x17, Buffer.from(`${d.toISOString().slice(2, 19).replace(/[-T:]/g, "")}Z`));
const name = (cn) => seq(tlv(0x31, seq(oid("550403"), tlv(0x0c, Buffer.from(cn)))));

/** An EC key pair; with `scalar`, the private key is that integer. */
export function ecKeyPair(crv = "P-384", scalar = null) {
  if (scalar === null) return generateKeyPairSync("ec", { namedCurve: crv });
  const [curve, size] = CURVES[crv];
  const d = Buffer.alloc(size);
  d.writeUInt32BE(scalar, size - 4);
  const ecdh = createECDH(curve);
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey();
  const jwk = { kty: "EC", crv, x: pub.subarray(1, 1 + size).toString("base64url"), y: pub.subarray(1 + size).toString("base64url") };
  return {
    privateKey: createPrivateKey({ key: { ...jwk, d: d.toString("base64url") }, format: "jwk" }),
    publicKey: createPublicKey({ key: jwk, format: "jwk" }),
  };
}

/** PEM key and certificate for a self-signed v1 certificate. */
export function selfSignedCert({ cn = "localhost", crv = "P-384", scalar = null } = {}) {
  const { privateKey, publicKey } = ecKeyPair(crv, scalar);
  const [, , hash, sigOid] = CURVES[crv];
  const alg = seq(oid(sigOid));
  const now = Date.now();
  const tbs = seq(
    tlv(0x02, Buffer.from([0x01])),
    alg,
    name(cn),
    seq(utcTime(new Date(now - 86400000)), utcTime(new Date(now + 30 * 86400000))),
    name(cn),
    publicKey.export({ type: "spki", format: "der" }),
  );
  const sig = sign(hash, tbs, privateKey);
  const der = seq(tbs, alg, tlv(0x03, Buffer.from([0]), sig));
  const b64 = der.toString("base64").match(/.{1,64}/g).join("\n");
  return {
    key: privateKey.export({ type: "pkcs8", format: "pem" }),
    cert: `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`,
  };
}
