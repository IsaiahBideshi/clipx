import { test } from "node:test";
import assert from "node:assert/strict";
import { getHomeView, getScreenViews, getSwipeDirection } from "../src/lib/screenLayout.js";

const followsFiles = [
  { path: "C:/Clip/Clip.mp4", role: "primary", follows: true, screen: null },
  { path: "C:/Clip/Screen 1.mp4", role: "secondary", screen: { number: 1, x: -2304, y: 231, width: 2304, height: 1440, primary: false } },
  { path: "C:/Clip/Screen 2.mp4", role: "secondary", screen: { number: 2, x: 0, y: 0, width: 1920, height: 1080, primary: true } },
];

test("lists the auto switch clip and each screen", () => {
  const views = getScreenViews(followsFiles);
  assert.deepEqual(views.map((view) => view.label), ["Auto switch", "Secondary screen", "Primary screen"]);
  assert.equal(views[0].rect, null);
  assert.deepEqual(views[1].rect, { x: -2304, y: 231, width: 2304, height: 1440 });
  assert.equal(getHomeView(views, "C:/Clip/Clip.mp4").label, "Primary screen");
});

test("numbers secondary screens when there is more than one", () => {
  const views = getScreenViews([
    { path: "a", role: "primary", follows: false, screen: { number: 1, x: 0, y: 0, width: 1920, height: 1080, primary: true } },
    { path: "b", role: "secondary", screen: { number: 2, x: 1920, y: 0, width: 1920, height: 1080, primary: false } },
    { path: "c", role: "secondary", screen: { number: 3, x: -1920, y: 0, width: 1920, height: 1080, primary: false } },
  ]);
  assert.deepEqual(views.map((view) => view.label), ["Primary screen", "Secondary screen 1", "Secondary screen 2"]);
});

test("starts on the fixed primary screen", () => {
  const files = [
    { path: "C:/Clip/Clip.mp4", role: "primary", follows: false, screen: { number: 2, x: 0, y: 0, width: 1920, height: 1080, primary: false } },
    { path: "C:/Clip/Screen 1.mp4", role: "secondary", screen: { number: 1, x: -1920, y: 0, width: 1920, height: 1080, primary: true } },
  ];
  const views = getScreenViews(files);
  assert.deepEqual(views.map((view) => view.label), ["Primary screen", "Secondary screen"]);
  assert.equal(getHomeView(views, "C:/Clip/Clip.mp4").path, "C:/Clip/Clip.mp4");
});

test("lines screens up left to right when positions are missing", () => {
  const views = getScreenViews([
    { path: "a", role: "primary", follows: false, screen: { number: 2, width: 1920, height: 1080 } },
    { path: "b", role: "secondary", screen: { number: 1, width: 1280, height: 720 } },
  ]);
  assert.deepEqual(views.map((view) => [view.label, view.rect.x, view.rect.y]), [["Secondary screen", 0, 0], ["Primary screen", 1280, 0]]);
});

test("swipes toward the screen being shown", () => {
  const [auto, left, main] = getScreenViews(followsFiles);
  assert.deepEqual(getSwipeDirection(main, left), { x: -1, y: 0 });
  assert.deepEqual(getSwipeDirection(left, main), { x: 1, y: 0 });
  assert.deepEqual(getSwipeDirection(main, auto), { x: 0, y: 0 });

  const above = { rect: { x: 0, y: -1080, width: 1920, height: 1080 } };
  assert.deepEqual(getSwipeDirection(main, above), { x: 0, y: -1 });
});
