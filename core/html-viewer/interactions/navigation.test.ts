// Verifies portable issue URLs and safe fallback to the report index.
import { it } from "vitest";
import assert from "node:assert/strict";
import {
  createIssueNavigation,
  issueHash,
  issueIdFromHash,
} from "./navigation.ts";
it("round trips authored issue IDs without interpreting URL delimiters", () => {
  for (const id of ["ISSUE-1", "issue / café?#%", "日本語"]) {
    assert.equal(issueIdFromHash(issueHash(id), [id]), id);
  }
});
it("returns the index for empty, unknown, or malformed issue routes", () => {
  for (const hash of [
    "",
    "#/",
    "#/issues/missing",
    "#/issues/%ZZ",
    "#/other",
    "#/issues/",
  ]) {
    assert.equal(issueIdFromHash(hash, ["ISSUE-1"]), null);
  }
});

it("opens encoded issue links and allows one Back traversal until navigation settles", () => {
  const events: unknown[] = [];
  let state: unknown = null;
  const navigation = createIssueNavigation({
    indexUrl: () => "file:///report/index.html#/",
    state: () => state,
    back: () => events.push("back"),
    issueOpen: () => false,
    replace: () => assert.fail("Unexpected issue replacement"),
    push: (nextState, hash) => {
      state = nextState;
      events.push(hash);
    },
    replaceIndex: (url) => events.push(url),
    changed: () => events.push("changed"),
  });
  navigation.open("ISSUE / 1");
  navigation.close();
  navigation.close();
  assert.deepEqual(events, ["#/issues/ISSUE%20%2F%201", "changed", "back"]);
  navigation.settled();
  navigation.close();
  assert.equal(events.at(-1), "back");
});
it("closes direct links and unrelated history entries by replacing with the index", () => {
  for (const state of [
    null,
    { designQaIndex: "file:///another/index.html#/" },
    "unrelated",
  ]) {
    const events: string[] = [];
    const navigation = createIssueNavigation({
      indexUrl: () => "file:///report/index.html#/",
      state: () => state,
      back: () => events.push("back"),
      issueOpen: () => false,
      replace: () => assert.fail("Unexpected issue replacement"),
      push: () => assert.fail("Unexpected issue open"),
      replaceIndex: (url) => events.push(url),
      changed: () => events.push("changed"),
    });
    navigation.close();
    assert.deepEqual(events, ["file:///report/index.html#/", "changed"]);
  }
});

it("switches issues in one history entry so closing returns to the index", () => {
  const events: string[] = [];
  const navigation = createIssueNavigation({
    indexUrl: () => "file:///report/index.html#/",
    state: () => ({ designQaIndex: "file:///report/index.html#/" }),
    issueOpen: () => true,
    back: () => events.push("back"),
    push: () => assert.fail("Unexpected extra history entry"),
    replace: (_state, hash) => events.push(hash),
    replaceIndex: () => assert.fail("Unexpected index replacement"),
    changed: () => {},
  });
  navigation.open("ISSUE-2");
  navigation.open("ISSUE-3");
  navigation.close();
  assert.deepEqual(events, ["#/issues/ISSUE-2", "#/issues/ISSUE-3", "back"]);
});

it("keeps direct-link history unmarked when switching issues", () => {
  const events: unknown[] = [];
  const navigation = createIssueNavigation({
    indexUrl: () => "file:///report/index.html#/",
    state: () => null,
    issueOpen: () => true,
    back: () => assert.fail("Direct link must stay in the report"),
    push: () => assert.fail("Unexpected extra history entry"),
    replace: (state, hash) => events.push([state, hash]),
    replaceIndex: (url) => events.push(url),
    changed: () => {},
  });
  navigation.open("ISSUE-2");
  navigation.close();
  assert.deepEqual(events, [
    [null, "#/issues/ISSUE-2"],
    "file:///report/index.html#/",
  ]);
});
