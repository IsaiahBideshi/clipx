import crypto from "crypto";

export function generatePKCE() {
  const verifier = crypto.randomBytes(64).toString("base64url"); // stays local
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url"); // sent to Google
  return { verifier, challenge };
}