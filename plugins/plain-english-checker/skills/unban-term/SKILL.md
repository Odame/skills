---
name: unban-term
description: Stop the plain-english-checker flagging a word or phrase, removing it from the banned-term list and adding it to the wordfreq and idiom allowlists. Trigger on any request to unban or allowlist a term for this checker, such as "stop flagging X", "unban 'leverage'", "'utilize' is fine, stop blocking it".
---

Take the term from the request, exactly as the user wrote it (quotes and all: the
command strips them). One term can be flagged by three checks, so one command does
all three edits. Run:

```bash
uv run --project "${CLAUDE_PLUGIN_ROOT}" plain-english-checker unban <term>
```

Relay the three printed lines to the user as-is: whether it was removed from the
wordlist (or was never on it), and whether it was added to the wordfreq and idiom
allowlists (or was already there).
