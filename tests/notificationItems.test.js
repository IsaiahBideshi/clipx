import { test } from "node:test";
import assert from "node:assert/strict";
import { countUnseen, getNewestTime, getNotificationContent } from "../src/lib/notificationItems.js";

const text = (content) => content.before + content.name + content.after;

test("writes each friend notification with the actor's name", () => {
  const actor = { username: "Alex" };
  assert.equal(text(getNotificationContent({ type: "friend_request", actor })), "Alex sent you a friend request");
  assert.equal(text(getNotificationContent({ type: "friend_accepted", actor })), "You are now friends with Alex");
  assert.equal(text(getNotificationContent({ type: "friend_removed", actor })), "Alex removed you as a friend");
});

test("falls back to Someone when the actor is gone", () => {
  assert.equal(getNotificationContent({ type: "friend_request", actor: null }).name, "Someone");
});

test("skips types this version doesn't know", () => {
  assert.equal(getNotificationContent({ type: "clip_reaction" }), null);
  assert.equal(getNotificationContent(null), null);
});

test("only links notifications that have somewhere to go", () => {
  assert.equal(getNotificationContent({ type: "friend_accepted" }).link, "/profile");
  assert.equal(getNotificationContent({ type: "friend_removed" }).link, undefined);
});

test("counts notifications newer than the seen marker", () => {
  const list = [
    { created_at: "2026-11-25T10:00:00Z" },
    { created_at: "2026-11-25T09:00:00Z" },
  ];
  assert.equal(countUnseen(list, Date.parse("2026-11-25T09:30:00Z")), 1);
  assert.equal(countUnseen(list, 0), 2);
  assert.equal(countUnseen(list, getNewestTime(list)), 0);
});

test("counts nothing until the seen marker has loaded", () => {
  assert.equal(countUnseen([{ created_at: "2026-11-25T10:00:00Z" }], undefined), 0);
});
