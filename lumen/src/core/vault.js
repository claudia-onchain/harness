// Passphrase encryption for keys.json: scrypt(N=2^15,r=8,p=1) -> AES-256-GCM.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const AAD = Buffer.from("lumen/keys/v1");
export const KDF = { name: "scrypt", N: 1 << 15, r: 8, p: 1 };

export function deriveKey(passphrase, salt, kdf = KDF) {
  return scryptSync(String(passphrase).normalize("NFKC"), salt, 32, { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 });
}

export function seal(obj, passphrase) {
  const salt = randomBytes(16);
  const key = deriveKey(passphrase, salt);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(AAD);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return {
    kdf: { ...KDF, salt: salt.toString("base64") },
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export function open(box, passphrase) {
  const key = deriveKey(passphrase, Buffer.from(box.kdf.salt, "base64"), box.kdf);
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64"));
  d.setAAD(AAD);
  d.setAuthTag(Buffer.from(box.tag, "base64"));
  try {
    return JSON.parse(Buffer.concat([d.update(Buffer.from(box.data, "base64")), d.final()]).toString("utf8"));
  } catch {
    throw new Error("Wrong passphrase.");
  }
}
