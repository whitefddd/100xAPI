import crypto from "node:crypto";

const SYNC_PREFIX = "enc:v1:";
const SALT = "100xlabsapi-sync-salt-v1";

function deriveKey(password) {
  return crypto.scryptSync(password, SALT, 32);
}

export function encryptText(plainText, password) {
  if (!password) return plainText;
  const iv = crypto.randomBytes(12);
  const key = deriveKey(password);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString("base64");
  return `${SYNC_PREFIX}${payload}`;
}

export function decryptText(cipherText, password) {
  if (!cipherText?.startsWith(SYNC_PREFIX)) return cipherText;
  if (!password) {
    throw new Error("Sync password is required to decrypt remote data.");
  }

  const raw = Buffer.from(cipherText.slice(SYNC_PREFIX.length), "base64");
  if (raw.length < 29) {
    throw new Error("Encrypted payload is invalid.");
  }

  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const key = deriveKey(password);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  try {
    const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    throw new Error("Failed to decrypt remote data. Check sync password.");
  }
}
