import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addRecordingProblem,
  applyClippingState,
  countUnseen,
  getNewestTime,
  getNotificationContent,
  groupNotifications,
} from "../src/lib/notificationItems.js";

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

test("writes clip notifications with the clip's title and links to it", () => {
  const actor = { username: "Alex" };
  const tagged = getNotificationContent({ type: "clip_tag", actor, clip_id: "c1", clip: { title: "Clutch" } });
  assert.equal(text(tagged) + tagged.title, "Alex tagged you in Clutch");
  assert.equal(tagged.link, "/library?clip=c1");
  assert.equal(tagged.linkLabel, "View in Library");

  const uploaded = getNotificationContent({ type: "friend_clip", actor, clip_id: "c2", clip: null });
  assert.equal(text(uploaded) + uploaded.title, "Alex uploaded a clip");
  assert.equal(uploaded.link, "/library?clip=c2");
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

test("groups clip notifications from the same person into one card", () => {
  const list = [
    { id: "1", type: "friend_clip", actor_id: "alex", created_at: "2026-11-25T10:00:00Z", clip: { title: "Newest" } },
    { id: "2", type: "friend_request", actor_id: "alex", created_at: "2026-11-25T09:30:00Z" },
    { id: "3", type: "friend_clip", actor_id: "alex", created_at: "2026-11-25T09:00:00Z" },
    { id: "4", type: "friend_clip", actor_id: "sam", created_at: "2026-11-25T08:00:00Z" },
    { id: "5", type: "clip_tag", actor_id: "alex", created_at: "2026-11-25T07:00:00Z" },
  ];
  const grouped = groupNotifications(list);

  assert.deepEqual(grouped.map((item) => item.ids), [["1", "3"], ["2"], ["4"], ["5"]]);
  assert.equal(grouped[0].created_at, "2026-11-25T10:00:00Z");

  const content = getNotificationContent({ ...grouped[0], actor: { username: "Alex" } });
  assert.equal(text(content) + content.title, "Alex uploaded 2 clips");
  assert.equal(content.link, "/library");
  assert.equal(grouped[2].count, 1);
});

test("a clipping error while recording reads as stopped, then restarted", () => {
  const now = "2026-11-25T10:00:00Z";
  const stopped = applyClippingState([], "ready", { status: "error", message: "OBS stopped recording." }, now);
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].title, "Clipping stopped");
  assert.equal(stopped[0].detail, "OBS stopped recording.");

  const retrying = applyClippingState(stopped, "error", { status: "starting" }, now);
  assert.equal(retrying, stopped);

  const restarted = applyClippingState(retrying, "starting", { status: "ready" }, now);
  assert.equal(restarted[0].title, "Clipping restarted");
  assert.equal(restarted[0].resolved, true);
});

test("a start failure is removed once clipping is ready", () => {
  const now = "2026-11-25T10:00:00Z";
  const failed = applyClippingState([], "starting", { status: "error", message: "Failed to download OBS (404)." }, now);
  assert.equal(failed[0].title, "Clipping couldn't start");
  assert.deepEqual(applyClippingState(failed, "starting", { status: "ready" }, now), []);
});

test("a failed restart still reads as stopped", () => {
  const now = "2026-11-25T10:00:00Z";
  const stopped = applyClippingState([], "ready", { status: "error", message: "Lost the connection to OBS." }, now);
  const failedAgain = applyClippingState(stopped, "starting", { status: "error", message: "Could not connect to OBS." }, now);
  assert.equal(failedAgain.length, 1);
  assert.equal(failedAgain[0].title, "Clipping stopped");
  assert.equal(failedAgain[0].detail, "Could not connect to OBS.");
});

test("a recording problem replaces the one with the same id", () => {
  const save = { kind: "save", id: "s1", status: "saved" };
  const first = addRecordingProblem([save], { id: "disk", title: "Your clips drive is almost full", detail: "4.0 GB left" }, "t1");
  const second = addRecordingProblem(first, { id: "disk", title: "Your clips drive is almost full", detail: "3.0 GB left" }, "t2");
  assert.equal(second.length, 2);
  assert.equal(second[0], save);
  assert.deepEqual(second[1], { id: "disk", title: "Your clips drive is almost full", detail: "3.0 GB left", kind: "recording", createdAt: "t2" });
});
