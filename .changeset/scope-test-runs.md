---
"odame-skills": minor
---

`implement` and `implement-spec` keep every test run scoped to the test files a change reaches. Implementer subagents run no full suite, a merger tests only the files it resolved by hand, and the full suite runs once, at the end, or in CI.
