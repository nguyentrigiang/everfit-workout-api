# Requirements Checklist

Derived from `docs/ASSIGNMENT.md`. Updated by the `check-progress` skill and after each feature.
Status: `[ ]` todo, `[~]` in progress, `[x]` done. Add evidence (file / test / commit) after done items.

## Time budget

- Day 1: 4h — setup, schema, units, bulk logging, history
- Day 2: 4h — PRs, performance, tests, README, AI_WORKFLOW
- Day 3: code review for understanding + video

## Core features

- [x] F1.1 Log entry: userId, date, exerciseName, sets `{ reps, weight, unit }` — POST /users/:userId/workouts — test/modules/workout/log-workouts.e2e-spec.ts
- [x] F1.2 Units kg, lb — unit registry — unit-converter.spec.ts; e2e "logs several exercises with mixed units"
- [x] F1.3 Store normalized kg alongside original — workout_sets.weight + unit + weight_kg — e2e "creates entries and sets with normalized kg values"
- [x] F1.4 Bulk logging (multiple exercises per request) — one transaction, all-or-nothing — e2e "logs several exercises…", "stores nothing when one entry is invalid", "largest valid request"
- [x] F2.1 History list for a user — GET /users/:userId/workouts — test/modules/workout/list-workouts.e2e-spec.ts (F2.1)
- [x] F2.2 Filter: exercise name, partial match — e2e (F2.2), LIKE wildcards literal
- [x] F2.3 Filter: date range — local_date, e2e (F2.3)
- [x] F2.4 Filter: muscle group — e2e (F2.4), unknown slug → 400
- [x] F2.5 Output in requested unit — e2e (F2.5), default kg
- [x] F2.6 Pagination (cursor) — keyset cursor — history-cursor.spec.ts, e2e (F2.6) no gaps/duplicates
- [x] F3.1 PR: heaviest set — GET /users/:userId/records — test/modules/workout/personal-records.e2e-spec.ts (F3.1–F3.4)
- [x] F3.2 PR: highest volume set (reps × weight) — strength-metrics.spec.ts, e2e (F3.1–F3.4)
- [x] F3.3 PR: best estimated 1RM (Epley) — strength-metrics.spec.ts (Epley incl. rounding), e2e
- [x] F3.4 PR: date achieved for each — performedAt + localDate per record, e2e (F3.1–F3.4)
- [x] F3.5 PR: compare across time ranges — compareFrom/compareTo + difference — personal-record.service.spec.ts, e2e (F3.5)

## Edge cases

- [x] E1 Invalid / unsupported unit — e2e "rejects an unsupported unit (E1)"
- [x] E2 Missing / malformed fields (null date, negative weight/reps, empty sets) — log-workouts e2e: null date, no offset, future date, negative weight, zero reps, empty sets/entries, unknown fields; DB CHECK constraints
- [x] E3 Date range with no data → empty result + message, not error — history and records e2e (E3)
- [x] E4 Timezone strategy implemented and documented — README "Key design decisions", DECISIONS.md
- [x] E5 Concurrent writes (same user, same exercise, same time) — natural key + ON CONFLICT + ordered inserts — e2e concurrent identical / reversed-order requests, schema.e2e concurrent inserts
- [x] E6 Performance with 50,000+ entries per user (seed + EXPLAIN evidence) — `npm run db:seed:demo` + `npm run db:explain` → docs/PERFORMANCE.md; filters matching no exercise return early (13.8 → 0.01 ms); per-exercise reads for rarely trained exercises listed under scaling

## Architecture

- [x] A1 New unit (e.g. stone) = minimal change (registry) — src/modules/workout/domain/units/unit-registry.ts; unit-converter.spec.ts adds stone
- [x] A2 Exercise → muscle group mapping configurable — config/exercises.json + insert-only seed
- [x] A3 Modular monolith per docs/ARCHITECTURE_BRIEF.md (business modules, small shared/, isolated infrastructure/, pragmatic SOLID) — b4b46bb, c6bf1a4, 8b945c5, 2faf53d

## Production readiness

- [x] P1 Docker setup, `docker compose up` works from fresh clone — Dockerfile (multi-stage, non-root), docker-compose.yml, entrypoint migrate + seed; verified on an empty volume during the PostgreSQL 18 upgrade
- [x] P2 Structured logging — nestjs-pino JSON logs with request id — logger.config.spec.ts, http-pipeline.e2e-spec.ts
- [x] P3 Configuration management (validated env) — @nestjs/config + class-validator — env.validation.spec.ts
- [x] P4 Consistent structured error responses — AllExceptionsFilter + ErrorCode — all-exceptions.filter.spec.ts, http-pipeline e2e, swagger e2e (error schema)

## Testing

- [x] T1 Unit tests for calculations (conversion, 1RM, PRs) — 105 unit tests: unit-converter, strength-metrics, decimal, personal-record.service, workout.service, history-cursor, time
- [x] T2 Integration tests for each endpoint — 87 e2e tests against Postgres: log, history, records, HTTP pipeline, Swagger, DB constraints, seeds
- [x] T3 Edge case tests (E1–E5) — see E1–E5 evidence

## Deliverables

- [x] D1 Time estimate provided before starting — sent to Everfit by email
- [x] D2 Clean, iterative commit history — 30 commits, Feature/Bugfix format, one concern each; bullets mark corrected AI output
- [x] D3 README: architecture overview + diagram — modular architecture diagram, src tree, module table, SOLID principles
- [x] D4 README: setup instructions — Quick start (docker compose up) + local dev steps
- [x] D5 README: API docs (endpoints, request/response, error codes) — Swagger at /docs, linked from README (user's choice)
- [x] D6 README: schema + design decisions (Postgres justification, indexes) — ER diagram, index table
- [x] D7 README: trade-offs + changes at scale
- [x] D8 AI_WORKFLOW.md: tools + purposes
- [x] D9 AI_WORKFLOW.md: ≥2 examples of wrong/suboptimal AI output + fix
- [x] D10 AI_WORKFLOW.md: ≥1 rejected AI suggestion + why
- [x] D11 AI_WORKFLOW.md: prompting strategy
- [ ] D12 Video (English, 15–20 min): architecture, demo incl. errors, AI workflow, line-by-line code, 10k coaches scaling

## Backlog (if time allows)

- [ ] B1 Dedicated `MALFORMED_JSON` error code for unparsable JSON bodies. Today it returns 400 `BAD_REQUEST` (standard shape, parser message). Cause: Nest's Express adapter maps body-parser `SyntaxError` to `new BadRequestException(message)` without `cause`, so the filter cannot tell it apart. Fix: disable Nest's body parser and register a wrapped `express.json()` that converts parse errors into `AppException(MALFORMED_JSON)`, shared by `main.ts` and e2e setup. Same root cause: body-parser runs before pino-http, so such requests get no request log line (the filter still generates a requestId).
