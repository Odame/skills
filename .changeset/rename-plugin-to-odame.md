---
"odame-skills": minor
---

Renames the plugin from `mattpocock-skills` to `odame-skills`, matching the fork's marketplace id (`odame`). `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and every install command in this fork's docs now reference `odame-skills`. Skill and slash-command names are unchanged; upstream's own official `mattpocock-skills` plugin listing is untouched. Anyone who installed via `claude plugin install mattpocock-skills@odame` must reinstall with `claude plugin install odame-skills@odame`.
