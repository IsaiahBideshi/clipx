import test from "node:test";
import assert from "node:assert/strict";
import { syncMedia } from "../src/lib/trackMix.js";

function fakeMedia(currentTime = 0) {
  return {
    readyState: 4,
    duration: 50,
    currentTime,
    playbackRate: 1,
    paused: true,
    seeking: false,
    play() {
      this.paused = false;
      return Promise.resolve();
    },
    pause() {
      this.paused = true;
    },
  };
}

test("syncMedia starts the audio when the video is a rounding error before it", () => {
  const media = fakeMedia();
  syncMedia(media, -0.003, true, 1);
  assert.equal(media.paused, false);
  assert.equal(media.currentTime, 0);
});

test("syncMedia keeps the audio paused while the video is well before it", () => {
  const media = fakeMedia();
  syncMedia(media, -1, true, 1);
  assert.equal(media.paused, true);
  assert.equal(media.currentTime, 0);
});

test("syncMedia seeks only when the audio drifts", () => {
  const media = fakeMedia(10.05);
  syncMedia(media, 10, true, 1);
  assert.equal(media.currentTime, 10.05);
  syncMedia(media, 12, true, 1);
  assert.equal(media.currentTime, 12);
});

test("syncMedia doesn't start another seek while one is running", () => {
  const media = fakeMedia(10);
  media.seeking = true;
  syncMedia(media, 12, true, 1);
  assert.equal(media.currentTime, 10);
});

test("syncMedia seeks ahead by the last seek's time only while playing", () => {
  const playing = fakeMedia();
  syncMedia(playing, 10, true, 1, 0.2);
  assert.equal(playing.currentTime, 10.2);

  const paused = fakeMedia();
  syncMedia(paused, 10, false, 1, 0.2);
  assert.equal(paused.currentTime, 10);
});
