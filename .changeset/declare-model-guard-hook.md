---
"mattpocock-skills": patch
---

Declares `implement-with-agent-team`'s teammate model-selection guard as a plugin hook (`hooks/hooks.json`, `PreToolUse` on `Agent`), so installing the plugin wires it up automatically instead of requiring a manual edit to the installer's global `settings.json`.
