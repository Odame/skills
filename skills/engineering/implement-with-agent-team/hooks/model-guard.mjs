#!/usr/bin/env node
// PreToolUse guard for the Agent tool, scoped to this skill's own teammates.
//
// The Agent tool's `model` is optional and inherits the lead's, so one omission
// puts an Opus teammate on a ticket sized for Sonnet with nothing in the
// transcript saying so. A script cannot see a spawn call; only a hook can.
//
// It looks at spawns named `tkt-<number>` and ignores every other subagent on
// the machine, so nothing outside this skill is policed.
//
// Fails open: any unreadable input, unexpected shape, or internal error allows
// the spawn. A guard that blocks work when it is confused is worse than one
// that occasionally misses.

import { readFileSync } from "node:fs";

const allow = () => process.exit(0);

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  allow();
}

if (!payload || typeof payload !== "object") allow();
if (payload.tool_name !== "Agent") allow();

const input = payload.tool_input;
if (!input || typeof input !== "object") allow();

const name = typeof input.name === "string" ? input.name : "";
if (!/^tkt-\d+/.test(name)) allow();

const model = typeof input.model === "string" ? input.model.trim() : "";
if (model) allow();

// `fork` ignores the model parameter outright, so it can never be made cheap.
const forked = input.subagent_type === "fork";
const reason = forked
  ? name +
    " is a fork, which always inherits the lead's model and ignores `model`. " +
    "Spawn it as an ordinary teammate with the model the frontier printed for this ticket."
  : name +
    " has no explicit model, so it would inherit the lead's. Pass the model the " +
    "frontier printed for this ticket, which is `sonnet` unless it was planned for `opus`.";

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }),
);
process.exit(0);
