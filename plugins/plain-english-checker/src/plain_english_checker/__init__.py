"""Each check module registers itself with `checks.CHECKS` when imported.

Nothing is imported here: `cli.check` imports each check module lazily, only when
its config `enabled` flag calls for it, so a disabled or unused check never pays
for loading `wordfreq`'s or `textstat`'s corpus data (see docs/adr/0006).
"""
