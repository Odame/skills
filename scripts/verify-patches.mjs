#!/usr/bin/env node
// Fails when a divergence recorded in PATCHES.md is no longer in the tree.
// A rebase onto upstream can drop one silently: the rebase succeeds, the skill
// reverts to upstream's wording, and nothing says so.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const divergences = [
  {
    name: "grilling asks one question at a time",
    file: "skills/productivity/grilling/SKILL.md",
    present: ["one question at a time", "ask-user-question"],
    absent: ["whole frontier in one round"],
  },
  {
    name: "implement gates the work with unlazy",
    file: "skills/engineering/implement/SKILL.md",
    present: ['Skill tool with "unlazy"', "--reverify", "GATES.md"],
    absent: [],
  },
  {
    name: "the repo-local skills are tracked",
    file: ".gitignore",
    present: [".claude/*", "!.claude/skills/"],
    absent: [],
  },
  {
    name: "the marketplace is named for this fork",
    file: ".claude-plugin/marketplace.json",
    present: ['"name": "odame"'],
    absent: ['"name": "mattpocock"'],
  },
];

const failures = [];

for (const divergence of divergences) {
  let text;
  try {
    text = readFileSync(join(repository, divergence.file), "utf8");
  } catch (error) {
    failures.push(divergence.name + ": cannot read " + divergence.file + " (" + error.code + "). " +
      "Upstream may have moved or renamed it; re-apply the divergence at its new path and update this script.");
    continue;
  }
  for (const needle of divergence.present) {
    if (!text.includes(needle)) {
      failures.push(divergence.name + ": " + divergence.file + " no longer contains " + JSON.stringify(needle));
    }
  }
  for (const needle of divergence.absent) {
    if (text.includes(needle)) {
      failures.push(divergence.name + ": " + divergence.file + " has upstream's " + JSON.stringify(needle) + " back");
    }
  }
}

if (failures.length) {
  console.error("Lost divergences (" + failures.length + "):");
  for (const failure of failures) console.error("  - " + failure);
  console.error("\nRe-apply each one, then re-run. See PATCHES.md.");
  process.exit(1);
}

console.log("PATCHES OK (" + divergences.length + " divergences intact)");
