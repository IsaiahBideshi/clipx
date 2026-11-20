import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLogLine, redactLogText } from "../electron/utils/logFormat.js";

const HOME = "C:\\Users\\Isaia";

test("formats a line with its time, level, source and the error's stack", () => {
  const line = formatLogLine("error", "main", ["ClipX: Failed to save clip:", new Error("OBS took too long")], HOME, new Date("2026-11-20T15:04:05.123Z"));
  assert.match(line, /^2026-11-20T15:04:05\.123Z \[error\] \[main\] ClipX: Failed to save clip: Error: OBS took too long\n\s+at /);
  assert.ok(line.endsWith("\n"));
});

test("replaces the home folder however it's written", () => {
  assert.equal(redactLogText("C:\\Users\\Isaia\\Videos\\clip.mp4", HOME), "~\\Videos\\clip.mp4");
  assert.equal(redactLogText("c:\\users\\isaia\\Videos", HOME), "~\\Videos");
  assert.equal(redactLogText("C:/Users/Isaia/Videos", HOME), "~/Videos");
  assert.equal(formatLogLine("info", "main", [{ path: "C:\\Users\\Isaia\\Videos" }], HOME, new Date(0)).trim().split("] ").pop(), "{ path: '~\\\\Videos' }");
  assert.equal(redactLogText("C:\\Users\\Isaiah\\x", HOME), "C:\\Users\\Isaiah\\x");
  assert.equal(redactLogText(`'${HOME}'`, HOME), "'~'");
});

test("hides tokens, signatures and secrets", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";
  assert.equal(redactLogText(`Authorization: Bearer ${jwt}`), "Authorization: Bearer [redacted]");
  assert.equal(redactLogText("Bearer abc123def"), "Bearer [redacted]");
  assert.equal(
    redactLogText("PUT https://x.blob.core.windows.net/clips/a.mp4?sv=2024&se=2026&sig=Ab%2Fc%3D&sp=cw failed"),
    "PUT https://x.blob.core.windows.net/clips/a.mp4?sv=2024&se=2026&sig=[redacted]&sp=cw failed",
  );
  assert.equal(redactLogText("http://127.0.0.1:5000/callback?code=4/0Ab12&scope=email"), "http://127.0.0.1:5000/callback?code=[redacted]&scope=email");
  assert.equal(redactLogText("{ access_token: 'abc', refresh_token: 'def' }"), "{ access_token: '[redacted]', refresh_token: '[redacted]' }");
  assert.equal(redactLogText('{"refresh_token":"1//0gXyz","client_secret":"GOCSPX-1"}'), '{"refresh_token":"[redacted]","client_secret":"[redacted]"}');
  assert.equal(redactLogText("token ya29.a0AfH6SM-x_y"), "token [redacted]");
  assert.equal(redactLogText(jwt), "[redacted]");
});

test("leaves ordinary messages alone", () => {
  const message = "ClipX: main failed to save its part of the clip: Clip 2026-Oct-25 [VALORANT] 03꞉52꞉30PM";
  assert.equal(redactLogText(message, HOME), message);
  assert.equal(redactLogText("Encoder: jim_av1_nvenc, code 3221225477"), "Encoder: jim_av1_nvenc, code 3221225477");
});
