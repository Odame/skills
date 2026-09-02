import { test } from "node:test";
import assert from "node:assert/strict";

import { readMarker } from "./tickets.mjs";

const comment = (body, created_at = "2026-01-01T00:00:00Z") => ({
  body,
  created_at,
});

test("readMarker reads a dispatch", () => {
  const found = readMarker(
    comment(
      "**Dispatched to an implementation agent.**\n\nBranch `tkt-9-thing`, off `main`. Model sonnet.",
    ),
  );
  assert.deepEqual(found, {
    status: "BUILDING",
    since: "2026-01-01T00:00:00Z",
    branch: "tkt-9-thing",
    base: "main",
  });
});

test("readMarker reads a return, with no branch or base in the body", () => {
  const found = readMarker(comment("**Implementation returned.**\n\nPR #42"));
  assert.deepEqual(found, {
    status: "REVIEW",
    since: "2026-01-01T00:00:00Z",
    pr: 42,
  });
});

test("readMarker returns null for a comment carrying no marker", () => {
  assert.equal(readMarker(comment("looks good to me")), null);
});

test("claimRecord's reduce: a later marker supersedes fields, but never wipes what an earlier one named", () => {
  const dispatch = readMarker(
    comment(
      "**Dispatched to an implementation agent.**\n\nBranch `tkt-9-thing`, off `main`. Model sonnet.",
    ),
  );
  const noMarker = readMarker(comment("still working on it"));
  const ret = readMarker(comment("**Implementation returned.**\n\nPR #42"));

  const NO_CLAIM = {
    status: null,
    branch: null,
    base: null,
    since: null,
    pr: null,
  };
  const record = [dispatch, noMarker, ret].reduce(
    (current, found) => ({ ...current, ...found }),
    { ...NO_CLAIM },
  );

  assert.equal(record.status, "REVIEW");
  assert.equal(record.pr, 42);
  assert.equal(record.branch, "tkt-9-thing");
  assert.equal(record.base, "main");
});
