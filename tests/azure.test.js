import { test } from "node:test";
import assert from "node:assert/strict";
import { getSasToken } from "../api-handlers/clips/azure.js";

process.env.AZURE_STORAGE_CONNECTION_STRING = `AccountName=test;AccountKey=${Buffer.from("test-key").toString("base64")}`;

function getHoursUntilExpiry(permissions) {
  const expiry = new URLSearchParams(getSasToken("user-1/clip.mp4", permissions)).get("se");
  return Math.round((Date.parse(expiry) - Date.now()) / 3_600_000);
}

test("upload URLs last 6 hours so slow uploads can finish", () => {
  assert.equal(getHoursUntilExpiry("w"), 6);
});

test("read URLs last 1 hour", () => {
  assert.equal(getHoursUntilExpiry("r"), 1);
});
