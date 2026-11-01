import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const realFetch = globalThis.fetch;
let importCount = 0;

function loadIgdb() {
  importCount += 1;
  return import(`../api-handlers/igdb.js?test=${importCount}`);
}

function stubTwitch({ expiredTokens = [], tokenStatuses = [] } = {}) {
  const calls = { tokens: 0, queries: [] };
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("id.twitch.tv")) {
      const status = tokenStatuses.shift() ?? 200;
      if (status !== 200) {
        return new Response("invalid client secret", { status });
      }
      calls.tokens += 1;
      return Response.json({ access_token: `token-${calls.tokens}` });
    }

    const token = init.headers.Authorization.replace("Bearer ", "");
    calls.queries.push(token);
    return expiredTokens.includes(token)
      ? new Response("Authorization Failure", { status: 401 })
      : Response.json([{ id: 1 }]);
  };
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("gets one token and reuses it across queries", async () => {
  const calls = stubTwitch();
  const { queryIgdb } = await loadIgdb();

  await Promise.all([queryIgdb("games", "fields name;"), queryIgdb("games", "fields name;")]);
  assert.deepEqual(await queryIgdb("games", "fields name;"), [{ id: 1 }]);

  assert.equal(calls.tokens, 1);
  assert.deepEqual(calls.queries, ["token-1", "token-1", "token-1"]);
});

test("renews the token and retries when IGDB rejects it", async () => {
  const calls = stubTwitch({ expiredTokens: ["token-1"] });
  const { queryIgdb } = await loadIgdb();

  assert.deepEqual(await queryIgdb("games", "fields name;"), [{ id: 1 }]);
  assert.deepEqual(calls.queries, ["token-1", "token-2"]);
});

test("shares one renewal when overlapping queries are rejected", async () => {
  const calls = stubTwitch({ expiredTokens: ["token-1"] });
  const { queryIgdb } = await loadIgdb();

  await Promise.all([queryIgdb("games", "fields name;"), queryIgdb("games", "fields name;")]);

  assert.equal(calls.tokens, 2);
  assert.deepEqual(calls.queries, ["token-1", "token-1", "token-2", "token-2"]);
});

test("fails instead of retrying forever when a new token is rejected too", async () => {
  const calls = stubTwitch({ expiredTokens: ["token-1", "token-2"] });
  const { queryIgdb } = await loadIgdb();

  await assert.rejects(queryIgdb("games", "fields name;"), /IGDB request failed \(401\)/);
  assert.equal(calls.queries.length, 2);
});

test("asks for a token again after a failed request", async () => {
  const calls = stubTwitch({ tokenStatuses: [403] });
  const { queryIgdb } = await loadIgdb();

  await assert.rejects(queryIgdb("games", "fields name;"), /Twitch token request failed \(403\)/);
  assert.deepEqual(await queryIgdb("games", "fields name;"), [{ id: 1 }]);
  assert.equal(calls.tokens, 1);
});
