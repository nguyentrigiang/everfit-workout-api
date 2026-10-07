# Requirements Checklist

Derived from `docs/ASSIGNMENT.md`. Updated by the `check-progress` skill and after each feature.
Status: `[ ]` todo, `[~]` in progress, `[x]` done. Add evidence (file / test / commit) after done items.

## Time budget

- Day 1: 4h — setup, schema, units, bulk logging, history
- Day 2: 4h — PRs, performance, tests, README, AI_WORKFLOW
- Day 3: code review for understanding + video

## Core features

- [ ] F1.1 Log entry: userId, date, exerciseName, sets `{ reps, weight, unit }`
- [ ] F1.2 Units kg, lb
- [ ] F1.3 Store normalized kg alongside original
- [ ] F1.4 Bulk logging (multiple exercises per request)
- [ ] F2.1 History list for a user
- [ ] F2.2 Filter: exercise name, partial match
- [ ] F2.3 Filter: date range
- [ ] F2.4 Filter: muscle group
- [ ] F2.5 Output in requested unit
- [ ] F2.6 Pagination (cursor)
- [ ] F3.1 PR: heaviest set
- [ ] F3.2 PR: highest volume set (reps × weight)
- [ ] F3.3 PR: best estimated 1RM (Epley)
- [ ] F3.4 PR: date achieved for each
- [ ] F3.5 PR: compare across time ranges

## Edge cases

- [ ] E1 Invalid / unsupported unit
- [ ] E2 Missing / malformed fields (null date, negative weight/reps, empty sets)
- [ ] E3 Date range with no data → empty result + message, not error
- [ ] E4 Timezone strategy implemented and documented
- [ ] E5 Concurrent writes (same user, same exercise, same time)
- [ ] E6 Performance with 50,000+ entries per user (seed + EXPLAIN evidence)

## Architecture

- [ ] A1 New unit (e.g. stone) = minimal change (registry)
- [ ] A2 Exercise → muscle group mapping configurable

## Production readiness

- [ ] P1 Docker setup, `docker compose up` works from fresh clone
- [ ] P2 Structured logging
- [ ] P3 Configuration management (validated env)
- [ ] P4 Consistent structured error responses

## Testing

- [ ] T1 Unit tests for calculations (conversion, 1RM, PRs)
- [ ] T2 Integration tests for each endpoint
- [ ] T3 Edge case tests (E1–E5)

## Deliverables

- [x] D1 Time estimate provided before starting — sent to Everfit by email
- [ ] D2 Clean, iterative commit history
- [ ] D3 README: architecture overview + diagram
- [ ] D4 README: setup instructions
- [ ] D5 README: API docs (endpoints, request/response, error codes)
- [ ] D6 README: schema + design decisions (Postgres justification, indexes)
- [ ] D7 README: trade-offs + changes at scale
- [ ] D8 AI_WORKFLOW.md: tools + purposes
- [ ] D9 AI_WORKFLOW.md: ≥2 examples of wrong/suboptimal AI output + fix
- [ ] D10 AI_WORKFLOW.md: ≥1 rejected AI suggestion + why
- [ ] D11 AI_WORKFLOW.md: prompting strategy
- [ ] D12 Video (English, 15–20 min): architecture, demo incl. errors, AI workflow, line-by-line code, 10k coaches scaling
