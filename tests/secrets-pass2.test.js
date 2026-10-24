/**
 * E11b pass 2: the password rule reads key names by their words (A4a).
 * Fixtures are our own; secrets are split with join() so Penthera's
 * self-scan does not report this file.
 */
import { describe, it, expect } from "vitest";
import { findSecretsInText, isPasswordKey, keyWords, isSequential, isCredentialName } from "../lib/whitebox/secrets.js";

const j = (...p) => p.join("");
const PW = j("pass", "word");
const names = (text, opts) => findSecretsInText(text, opts).map((h) => h.name);
const pw = (text) => names(text).filter((n) => n === "Hardcoded password").length;
// A made-up value with letters, digits and a symbol.
const V = j("Kq7", "-vR2m", "Lz9");

describe("password keys, by their words", () => {
  it("splits a key into words", () => {
    expect(keyWords("adminPassword2")).toEqual(["admin", "password"]);
    expect(keyWords("DB_PASSWORD")).toEqual(["db", "password"]);
    expect(keyWords("new-password1")).toEqual(["new", "password"]);
    expect(keyWords("XMLPasswordValue")).toEqual(["xml", "password", "value"]);
  });

  it("knows which keys name a password", () => {
    for (const k of [PW, "passwd", "pwd", "db_pass", "old_password", "password1", "adminPassword", "DB_PASSWORD", "PGPASSWORD", "userpwd", "spring.datasource.password", "password_confirmation", "passwordRepeat", "SMTP_PASS", "passphrase"]) {
      expect(isPasswordKey(k), k).toBe(true);
    }
    for (const k of ["password_hash", "passwordMinLength", "password_reset_url", "passThrough", "bypass", "passport", "compass", "allow_empty_password", "forgotPassword", "LABEL_PASSWORD", "passwordPlaceholder", "invalidPassword", "password.encoder"]) {
      expect(isPasswordKey(k), k).toBe(false);
    }
  });
});

describe("password assignments in more shapes", () => {
  it("finds a quoted key: JSON, Python dicts, PHP arrays", () => {
    expect(pw(`{"${PW}": "${V}"}`)).toBe(1);
    expect(pw(`data = {'old_${PW}': '${V}', 'new_${PW}1': '${V}x'}`)).toBe(2);
    expect(pw(`$cfg['db_pass'] = '${V}';`)).toBe(1);
    expect(pw(`'${PW}' => '${V}',`)).toBe(1);
    expect(pw(`{\\"${PW}\\":\\"${V}\\"}`)).toBe(1);
  });

  it("finds prefixed and suffixed keys with :, =, => and :=", () => {
    expect(pw(`adminPassword = "${V}"`)).toBe(1);
    expect(pw(`const DB_PASSWORD = '${V}';`)).toBe(1);
    expect(pw(`${PW}1: "${V}"`)).toBe(1);
    expect(pw(`dbPass := "${V}"`)).toBe(1);
    expect(pw(`:${PW} => "${V}"`)).toBe(1);
    expect(pw(`spring.datasource.${PW}="${V}"`)).toBe(1);
  });

  it("does not read a key that only opens a string as a password key", () => {
    // The key sits inside a string literal: `"Password: "` then code.
    expect(pw(`sb.append("Password: ").append("${V}");`)).toBe(0);
  });

  it("skips a ternary and a template literal built at run time", () => {
    expect(pw(`status: ok ? "pass" : "fail",`)).toBe(0);
    expect(pw(`console.log(ok ? "PASS" : "FAIL");`)).toBe(0);
    expect(pw("body: { " + PW + ": `attempt-${i}` }")).toBe(0);
    expect(pw("body: { " + PW + ": `" + V + "` }")).toBe(1);
  });

  it("skips keys about a password rather than holding one", () => {
    expect(pw(`password_hash = "${V}"`)).toBe(0);
    expect(pw(`"LABEL_PASSWORD": "${V}"`)).toBe(0);
    expect(pw(`MYSQL_ALLOW_EMPTY_PASSWORD: '${V}'`)).toBe(0);
  });
});

describe("values that are not passwords", () => {
  it("skips booleans, stored hashes, references and code", () => {
    for (const v of ["true", "null", j("$2b$", "12$abcdefghijklmnopqrstuv"), j("$6$", "rounds=5000$salt$hash"), j("{SS", "HA}abcdEFGH"), j("pbkdf2", "_sha256$260000$salt$hash"), "$DB_PASS", "#{password}", "%(pw)s", "%DB_PASS%", "<db password>"]) {
      expect(pw(`${PW} = "${v}"`), v).toBe(0);
    }
  });

  it("skips text for people: other scripts, labels, translations", () => {
    expect(pw(`"${PW}": "Пароль"`)).toBe(0);
    expect(pw(`'${PW}': 'Contraseña'`)).toBe(0);
    expect(pw(`"${PW}": "Password:"`)).toBe(0);
    // A password with a symbol outside ASCII is still a password.
    expect(pw(`${PW}: '${V}§'`)).toBe(1);
  });

  it("skips names, defaults, sequences, test values and version ranges", () => {
    expect(isCredentialName("keystore.password")).toBe(true);
    expect(isCredentialName("my-secret")).toBe(true);
    expect(isCredentialName(`${PW}123!`)).toBe(false);
    expect(isSequential("123456")).toBe(true);
    expect(isSequential("abc123")).toBe(true);
    expect(isSequential("qwerty")).toBe(true);
    expect(isSequential(V)).toBe(false);
    for (const v of ["keystore.password", "default-password", "admin", "root", "changeit", "12345678", "abcdefgh", "test123", "testclient", "mypassword", "nopasswd", "string", "^1.0.0"]) {
      expect(pw(`"${PW}": "${v}"`), v).toBe(0);
    }
  });

  it("a translation folder runs only the fixed-shape rules", async () => {
    const { isShapesOnlyFile } = await import("../lib/whitebox/secrets.js");
    expect(isShapesOnlyFile("src/locales/de.json")).toBe(true);
    expect(isShapesOnlyFile("app/i18n/messages.js")).toBe(true);
    expect(isShapesOnlyFile("config/database.json")).toBe(false);
  });
});

describe("realistic passwords still match", () => {
  // Shapes of real generated and human passwords (our own, made up): the
  // filters above must not drop them.
  const real = [j("hunter", "2-Blue!"), j("Xk92", "-prod-Pw!"), j("t0p", "S3cr3tDb"), j("q8Z", "f$w1Lm"), j("wq7", "kz9pl"), j("Jf8", "#mQ2!vZp0rT"), j("4f9c2e", "7b1d"), j("Correct", "HorseBattery9")];
  it("in code, JSON and config shapes", () => {
    for (const v of real) {
      expect(pw(`db_${PW} = "${v}"`), v).toBe(1);
      expect(pw(`{"${PW}": "${v}"}`), v).toBe(1);
    }
  });
});
