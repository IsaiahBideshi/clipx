import { test } from "node:test";
import assert from "node:assert/strict";
import { countFittingNames } from "../src/lib/tagNames.js";

const measure = (text) => text.length;
const names = ["Bideshi", "ColdRulez", "Brado2F", "Ann", "Bob", "Cy", "Di"];

test("shows every name when they all fit", () => {
  assert.equal(countFittingNames(names, 45, measure, 4), 7);
});

test("shows as many names as fit next to the count", () => {
  assert.equal(countFittingNames(names, 33, measure, 4), 3);
  assert.equal(countFittingNames(names, 37, measure, 4), 3);
  assert.equal(countFittingNames(names, 38, measure, 4), 4);
});

test("leaves room for the count", () => {
  assert.equal(countFittingNames(["Ann", "Bob", "Cy"], 11, measure, 4), 1);
});

test("always shows the first name, even when it doesn't fit", () => {
  assert.equal(countFittingNames(names, 2, measure, 4), 1);
  assert.equal(countFittingNames(["Bideshi"], 3, measure, 4), 1);
});
