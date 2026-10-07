---
name: grill-plan
description: Plan a feature or task for this assignment by first grilling the user with clarifying questions, then producing a plan tied to the assignment's requirements. Use before starting any feature, or when the user says "plan", "grill me", or starts a new part of the assignment.
---

# Grill, then plan

The user is doing a time-boxed take-home (see `docs/ASSIGNMENT.md`). Your job is to make sure every piece of work maps to what the assignment evaluates, and that ambiguous decisions are made explicitly by the user, not silently by you.

## 1. Load context (do not skip)

Read:
- `docs/ASSIGNMENT.md` — the source of truth
- `docs/REQUIREMENTS.md` — checklist with IDs and status
- `docs/DECISIONS.md` if it exists — decisions already made; do not re-ask them
- `CLAUDE.md` — project rules
- The relevant existing code, if any

## 2. Map the task to the assignment

State in 2–4 lines: which requirement IDs this task covers, which evaluation criteria it serves, and anything in the assignment the user's request misses or contradicts.

## 3. Grill

Find the open questions where the answer changes the design. Typical areas for this assignment:
- API shape (paths, request/response fields, query params, status codes)
- Validation boundaries (max sets per request, max reps/weight, allowed date range, future dates)
- Time and timezone (what the client sends, how "this month" is defined)
- Semantics (case-insensitive exercise names? unknown exercise: create or reject? ties between PRs: earliest or latest?)
- Concurrency and idempotency behavior
- Scope: what to cut if time runs short

Rules:
- Ask with the AskUserQuestion tool, at most 4 questions per round, at most 2 rounds.
- Every question has concrete options; put your recommendation first with "(Recommended)" and a one-line reason.
- Do not ask about things already decided in `CLAUDE.md` or `docs/DECISIONS.md`, or things with an obvious default; state those defaults instead.
- Challenge the user when a choice hurts what the assignment evaluates (e.g. OFFSET pagination at 50k rows, hardcoded muscle groups) or blows the time budget. Say why, briefly, then accept their call.

## 4. Record decisions

Append each decision to `docs/DECISIONS.md` (create it if missing):

```
## <date> — <topic>
- Decision: ...
- Alternatives: ...
- Why: ...
```

These feed the README "design decisions / trade-offs" section and the video.

## 5. Plan

Output a short plan:
- Steps in order, each small enough for one commit, with the planned commit message (`Feature: ...`, see `CLAUDE.md`)
- Files to create/change
- Tests to write (edge cases by requirement ID)
- Time estimate per step, and the running total against the day's budget in `docs/REQUIREMENTS.md`
- What to cut first if over budget

## 6. Approval gate

- Enter plan mode (EnterPlanMode) before writing the plan, and present it with ExitPlanMode so the user must explicitly approve.
- Do not write or edit any code, test, migration or config until approved. Recording decisions in `docs/DECISIONS.md` is the only write allowed before approval.
- If the user requests changes, revise and present again.
- After approval, implement only what the plan covers; anything beyond it needs a new approval.
- Approval of the plan is NOT permission to commit or push. When done, show a summary and the proposed commit message, then wait. Commit only when the user says "commit"; push only when the user says "push" / "đẩy lên".

## Language and scope

- Write questions, the plan and reports in Vietnamese (code, commit messages and repo docs stay in English).
- One concern per plan. If the request spans several areas, plan the first one and list the rest as follow-ups.
