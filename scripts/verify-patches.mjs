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
    name: "implement is reachable by a teammate",
    file: "skills/engineering/implement/SKILL.md",
    present: ["description: Implement the work described"],
    absent: ["disable-model-invocation"],
  },
  {
    name: "implement-with-agent-team ships",
    file: ".claude-plugin/plugin.json",
    present: ['"./skills/engineering/implement-with-agent-team"'],
    absent: [],
  },
  {
    // The tool writes and reads the marker comments. A copy in SKILL.md would
    // be a second source of truth for one format, and would invite the lead to
    // write the comment itself instead of running the command.
    name: "SKILL.md names commands, not their representation",
    file: "skills/engineering/implement-with-agent-team/SKILL.md",
    present: ["node $T claim", "node $T check-pr", "node $T hand-back"],
    absent: [
      "Dispatched to an implementation agent",
      "**Stuck.**",
      "**Released.**",
    ],
  },
  {
    name: "releases are cut from this fork, not upstream",
    file: ".changeset/config.json",
    present: ['"repo": "Odame/skills"'],
    absent: ['"repo": "mattpocock/skills"'],
  },
  {
    name: "package metadata names this fork",
    file: "package.json",
    present: ["https://github.com/Odame/skills", '"name": "odame-skills"'],
    absent: ["https://github.com/mattpocock/skills", '"name": "mattpocock-skills"'],
  },
  {
    name: "the plugin is renamed for this fork",
    file: ".claude-plugin/plugin.json",
    present: ['"name": "odame-skills"'],
    absent: ['"name": "mattpocock-skills"'],
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
    present: ['"name": "odame"', '"name": "odame-skills"'],
    absent: ['"name": "mattpocock"', '"name": "mattpocock-skills"'],
  },
];

const failures = [];

for (const divergence of divergences) {
  let text;
  try {
    text = readFileSync(join(repository, divergence.file), "utf8");
  } catch (error) {
    failures.push(
      divergence.name +
        ": cannot read " +
        divergence.file +
        " (" +
        error.code +
        "). " +
        "Upstream may have moved or renamed it; re-apply the divergence at its new path and update this script.",
    );
    continue;
  }
  for (const needle of divergence.present) {
    if (!text.includes(needle)) {
      failures.push(
        divergence.name +
          ": " +
          divergence.file +
          " no longer contains " +
          JSON.stringify(needle),
      );
    }
  }
  for (const needle of divergence.absent) {
    if (text.includes(needle)) {
      failures.push(
        divergence.name +
          ": " +
          divergence.file +
          " has upstream's " +
          JSON.stringify(needle) +
          " back",
      );
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
