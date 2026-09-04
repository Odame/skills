---
name: ban-term
description: Add a word or phrase to the plain-english-checker's banned-term list. Trigger on any request to ban, blocklist, or flag a term as jargon for this checker, such as "ban the word X", "add 'leverage' to the banned words list", "flag 'utilize' as jargon".
---

Take the term from the request, exactly as the user wrote it (quotes and all: the
command strips them). Run:

```bash
uv run --project "${CLAUDE_PLUGIN_ROOT}" plain-english-checker ban <term>
```

Relay the printed line to the user as-is. It already says whether the term was newly
banned or was already on the list.
