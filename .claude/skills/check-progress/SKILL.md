---
name: check-progress
description: Check progress against the assignment: update docs/REQUIREMENTS.md from the actual code, tests and git log, and report gaps and what to do next. Use at the end of a work block, before a commit series, or when the user asks "còn thiếu gì", "progress", "what's left".
---

# Check progress against the assignment

1. Read `docs/ASSIGNMENT.md`, `docs/REQUIREMENTS.md`, `docs/DECISIONS.md` (if present), and `git log --oneline`.
2. For each checklist item, verify it in the code or docs. Do not trust the existing checkbox: find the evidence (file, test name, commit). An item is `[x]` only if implemented AND covered by a test (for features / edge cases) or present in the docs (for deliverables).
3. Update `docs/REQUIREMENTS.md`: set status and add short evidence after each done item, e.g. `— src/units/unit-converter.ts, unit-converter.spec.ts`.
4. Report to the user:
   - Done / in progress / todo counts
   - Gaps that hurt the evaluation most (rank by the "What We Evaluate" table and the AI adoption section)
   - AI_WORKFLOW material collected so far vs required (≥2 wrong outputs, ≥1 rejection); remind the user to note examples now if missing
   - Commit history health: number of commits, any giant commits, message format
   - Time check vs the day budget; recommend what to do next and what to cut
Keep the report short and write it in Vietnamese.

Never commit or push. You may suggest commits (with proposed messages); the user decides when to commit and push.
