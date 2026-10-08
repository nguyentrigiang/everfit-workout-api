# AI Log

Raw log of moments where AI output was wrong or suboptimal, or where an AI suggestion was rejected. Source material for `AI_WORKFLOW.md`. Entries are factual and reference the commit that contains the fix.

Tools: Claude Code (main session = implementer), a `domain-reviewer` subagent (read-only, fresh context, reviews each diff against `CLAUDE.md` and `docs/DECISIONS.md`), `grill-plan` skill (asks clarifying questions before every plan), plan mode as an approval gate.

## A. AI output that was wrong or suboptimal

| # | Area | What the AI produced | What was wrong | How it was caught | Fix | Commit |
|---|---|---|---|---|---|---|
| A1 | Testing | Unit tests for env validation | Failed with `Reflect.getMetadata is not a function`: outside Nest nothing loads `reflect-metadata` | Running the tests | `test/setup.ts` loads `reflect-metadata` for every Vitest run | `994d83f` |
| A2 | Logging | Logger enables `pino-pretty` when `NODE_ENV=development`, and `NODE_ENV` defaulted to `development` | `pino-pretty` is a dev dependency: a production build started without `NODE_ENV` would crash at boot | Reviewer subagent | Default `NODE_ENV` to `production`; verified by starting the prod build without it | `994d83f` |
| A3 | Error handling | Filter masked only non-HTTP errors as 500 | A 5xx `HttpException` / `AppException` returned its raw message (e.g. a DB host) to the client | Reviewer subagent | Mask message and details for every status ≥ 500; tests with an IP in the message | `2f24149` |
| A4 | Error handling | `defaultCodeForStatus` returned `HTTP_<status>` for unlisted statuses | Invented codes (`HTTP_413`) break a fixed error-code table; `code` typed as `string` | Reviewer subagent | Add `PAYLOAD_TOO_LARGE`, fall back to `BAD_REQUEST` / `INTERNAL_ERROR`, type as `ErrorCode` | `2f24149` |
| A5 | Error handling | Plan: detect malformed JSON via the error's `cause` | Nest's Express adapter maps body-parser `SyntaxError` to `new BadRequestException(message)` and drops the cause | E2E test failed; read `@nestjs/platform-express` source (`mapException`) | Accepted `BAD_REQUEST` for now; dedicated code kept as backlog B1 | `2f24149` |
| A6 | Error handling | Filter read `requestId` from `req.id` | Requests rejected by body parsing have no id (body-parser runs before pino-http) → `requestId: null`, no header | E2E test | Filter generates and sets the id when missing | `2f24149` |
| A7 | Docker | Healthcheck `pg_isready` over the unix socket | Reports healthy while Postgres is still running init scripts on a temporary server → app could migrate too early | Noticed `everfit_test` missing right after "healthy" | Healthcheck over TCP (`-h 127.0.0.1`), which the init server does not open | `ce2618b` |
| A8 | Schema | `@default(uuid())` on ids | Prisma generates those client-side; raw SQL inserts (`ON CONFLICT DO NOTHING`) would get no id | Self-review before writing raw inserts | `@default(dbgenerated("gen_random_uuid()"))` | `ce2618b` |
| A9 | Schema | `workout_sets` without `local_date`; kg columns at 3 decimals; no CHECK constraints | "PR this month vs last month" would need a join or use UTC month edges (6am Nov 1 in UTC+7 counted in October); lb→kg rounded at write time | Reviewer subagent | Copy `local_date` onto sets + index, 6-decimal kg columns, CHECK constraints | `ce2618b` |
| A10 | Seeding | Name normalization: trim + lowercase + collapse spaces | No Unicode normalization: "Café" composed vs decomposed would become two exercises (split history/PRs) | Reviewer subagent | `normalize('NFKC')` before the rest; tests | `107ee11` |
| A11 | Math | Epley as `weight × (1 + reps / 30)` with decimal.js | Dividing first rounds 1/3: `60 × 10 reps` gave `79.999999999999999998` instead of `80` | Unit test | Compute `weight × (30 + reps) / 30` (division last) | `a748fd3` |
| A12 | Math | Metrics computed from the unrounded kg value | DB rounds `weight_kg` to 6 decimals, so stored `volume_kg` / `e1rm_kg` disagreed with stored `weight_kg` | Reviewer subagent | Round kg to the stored scale first, compute metrics from that value | `a748fd3` |
| A13 | Architecture | Converter registry injected via DI token, validation reading the constant | Two sources of truth: overriding the provider would let validation and conversion disagree (400 vs 500) | Reviewer subagent | Single source: module builds `new UnitConverter(DEFAULT_UNIT_REGISTRY)` | `a748fd3` |
| A14 | Validation | Offset check `hours ≤ 14 && minutes ≤ 59` | `+14:30` passed, then violated the DB CHECK → 500 instead of 400 | Reviewer subagent (cross-checked against the DB constraint) | Check total offset ≤ 840 minutes; unit + e2e tests | `7fe3785` |
| A15 | Concurrency | Bulk inserts in request order | Two concurrent requests with the same keys in a different order lock the unique index crosswise → deadlock (500) | Reviewer subagent | `ORDER BY` natural key in the `INSERT ... SELECT` for entries and new exercises; e2e with reversed bodies | `7fe3785` |
| A16 | API | Duplicate entries reported `setCount` from the request | Response claimed sets that were never stored | Reviewer subagent | Return stored count for duplicates | `7fe3785` |
| A17 | Error handling | Error `path` from `req.url` | Express strips the global prefix: `/api/v1/x` reported as `/x` | E2E test after adding the prefix | Use `req.originalUrl` | `7fe3785` |
| A18 | Testing | E2E test logged a workout on 2026-11-01 | That date was in the future, so validation correctly rejected it: the test was wrong, not the code | Test failure, investigated before "fixing" code | Fixed the test date. Repeated once in the PR tests (Oct 12 when today was Oct 8), fixed the same way | `7fe3785`, PR endpoint commit |
| A19 | SQL | `LIKE ... ESCAPE '\'` written inside a TS template literal | In a template literal `'\'` is just `'`: the SQL would have been `ESCAPE '')` (syntax error, or wildcards unescaped) | Self-review of the generated SQL before running | Write `'\\'` in source; e2e test that `exercise=%` matches nothing | history endpoint commit |
| A20 | Testing | E2E suite reused a long-lived test DB | Rows from earlier runs (an auto-created `squat`, kept by the insert-only seed) made history tests fail on display names | E2E failure, traced to leftover data rather than code | Global setup truncates all tables (only if the DB name ends in `_test`) before seeding | history endpoint commit |

## B. AI suggestions rejected (by me or after review)

| # | Suggestion | Decision and why |
|---|---|---|
| B1 | Reviewer: strip query strings from request logs | Rejected. Query params here are filters, not sensitive data, and they are needed to debug slow list queries. Recorded in DECISIONS.md. |
| B2 | Reviewer: composite foreign key so copied set columns must match the parent entry | Rejected. Extra multi-column unique index and a 5-column FK for little gain. Instead the set columns are copied from the entry row in SQL (one code path), covered by a test. |
| B3 | AI recommended the seed treat config as the source of truth (replace mappings each run) | Rejected by me: a seeder only initializes data; existing rows must never be modified. Implemented insert-only. |
| B4 | AI recommended a `text[]` column for muscle groups | Rejected by me: separate tables make a future "pick a muscle group" screen easier. Same performance since the catalog is tiny. |
| B5 | AI recommended treating a 1-rep set's 1RM as the lifted weight | Rejected by me: follow the specified Epley formula exactly. |
| B6 | AI recommended a 5-minute clock-skew tolerance for future dates | Rejected by me: no tolerance. Trade-off documented. |
| B7 | AI proposed a large first plan (scaffold + config + logging + validation + Prisma + Docker + Swagger) | Rejected by me: one concern per plan. Rule added to CLAUDE.md. |
| B8 | Reviewer: test for reps = 0, top-level-array body paths, e2e test controller for the pipe | Skipped: reps ≥ 1 enforced by DTO and DB CHECK; no endpoint takes a top-level array; pipe covered by the first real endpoint's e2e tests. |
| B9 | Reviewer: compute PR `difference` from unrounded kg values, then round | Rejected: the difference must match the two rounded values shown to the user (105 vs 100 → 5); the exact approach can differ by ≤ 0.01 and look like a bug. Recorded in DECISIONS.md. |

## C. Process corrections to the AI

| # | What happened | Correction |
|---|---|---|
| C1 | AI extended my commit format (`Feature:` / `Bugfix:`) with extra types and committed as `Chore:` | Amended; rule: only `Feature` and `Bugfix` |
| C2 | AI committed and pushed without being asked | Rule: commit only on "commit", push only on "push" (approval of a plan is not permission) |
| C3 | Plans were written in English | Rule: plans and reports in Vietnamese, code and repo docs in English |
| C4 | Prisma refused `migrate reset` when run by the AI | Kept as a human-in-the-loop guard; I chose how to reset the dev DB |
