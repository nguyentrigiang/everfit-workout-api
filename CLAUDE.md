# CLAUDE.md

Rules for AI assistants working on this repo. Read fully before generating code.

## Project

Workout Logging API for Everfit (backend take-home). Coaches track client workout metrics:
bulk-log workouts, query history, compute personal records (PRs).

## Approval gate (hard rule)

- NEVER create or edit source code, tests, migrations, or config before the user has explicitly approved a plan for that work.
- Present plans through plan mode (ExitPlanMode) so approval is an explicit step. "Looks good", "ok", "approve", "làm đi" count as approval; questions or comments do not.
- Approval covers only the approved plan. If the work needs to go beyond it (new file, new dependency, schema change, different approach), stop and ask again.
- Exceptions (no plan needed): reading files, running read-only commands, running tests, answering questions.

## Source of truth

- `docs/ASSIGNMENT.md` — the original assignment. Every change must serve something in it.
- `docs/REQUIREMENTS.md` — checklist with requirement IDs (F1.1, E3, D9...) and status. Reference IDs in plans.
- `docs/DECISIONS.md` — decisions made with the user. Do not re-ask or silently override them.
- Before starting a feature, use the `grill-plan` skill. At the end of a work block, use `check-progress`.
- If a request drifts from the assignment or exceeds the time budget, say so before doing it.

## Stack

- NestJS (TypeScript, strict mode)
- PostgreSQL 16 + Prisma (use `$queryRaw` with tagged templates for aggregation / pagination queries)
- Jest + Supertest for tests
- nestjs-pino for structured logging, @nestjs/config with validated env
- Docker Compose for local setup (`docker compose up` must work from a fresh clone)

## Architecture

- Module per domain: `workouts`, `records` (PRs), `exercises`, `units`, plus `common` (filters, pipes, utils).
- Controllers: HTTP only (DTOs, params, response mapping). No business logic.
- Services: business logic. Repositories / Prisma access isolated from controllers.
- Everything injected via Nest DI. No `new SomeService()` in business code.

## Domain rules (do not violate)

- **Units**: all unit conversion goes through the `UnitConverter` registry (`{ kg: 1, lb: 0.45359237 }`).
  Adding a unit (e.g. stone) must only require adding one registry entry. Never write `if (unit === 'lb')`.
- **Storage**: store the original `weight` + `unit` AND the normalized `weight_kg`. Use `Decimal`/`numeric`, never JS float math for persisted values.
- **1RM**: Epley `weight × (1 + reps / 30)`. Computed from `weight_kg`.
- **Muscle groups**: exercise → muscle group mapping lives in config/seed data (`config/exercises.json` → `exercises` table). Never hardcode in services.
- **Exercise names**: normalize (trim, lowercase, collapse spaces) before lookup.
- **Time**: store `performed_at` as `timestamptz` (UTC) plus `local_date` and `timezone` (IANA) for calendar-based grouping. Never use `new Date('YYYY-MM-DD')` without an explicit timezone.
- **Pagination**: cursor-based (keyset) on `(performed_at DESC, id DESC)`. No OFFSET.
- **PRs**: computed on read using indexed queries (`ORDER BY ... LIMIT 1` or SQL aggregation). Never load all sets into memory.
- **Bulk writes**: one transaction per request. Support `Idempotency-Key` header (unique on `user_id + idempotency_key`).
- **Performance target**: endpoints must stay fast with 50,000+ entries per user. Any new query needs a matching index; mention it.

## API conventions

- Prefix: `/api/v1`. userId passed as path param (no auth).
- Validation with class-validator DTOs + global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Error response shape (global exception filter), always:
  ```json
  { "statusCode": 400, "error": "Bad Request", "message": "...", "details": [], "path": "/api/v1/...", "timestamp": "...", "requestId": "..." }
  ```
- Empty results are NOT errors: return `200` with `data: []` and a `message`.
- List responses: `{ data, pagination: { nextCursor, hasMore, limit } }`.

## Testing

- Every feature ships with tests in the same change.
- Unit tests: unit conversion, Epley, PR selection logic, cursor encode/decode.
- E2E tests: each endpoint + edge cases (invalid unit, negative weight/reps, null date, empty sets, empty date range, idempotent retry, concurrent writes).
- Test names describe behavior (`returns 400 when sets array is empty`), not implementation.

## Workflow

- Per feature: `grill-plan` → implement → `test-writer` agent → `domain-reviewer` agent → (if queries/indexes changed) `query-optimizer` agent → human review → commit.
- Small, focused changes; one concern per commit.
- Do not add dependencies without stating why.
- If a requirement is ambiguous, ask instead of guessing.
- When unsure about a trade-off, explain options briefly and recommend one.

## Commit messages

Format:

```
<Type>: <main summary, imperative, max ~72 chars>

- <what was done>
- <what was done>
```

Types:

| Type | Use for |
|---|---|
| `Feature` | New functionality (endpoint, module, capability) |
| `Bugfix` | Fixing incorrect behavior |
| `Refactor` | Code restructuring without behavior change |
| `Perf` | Performance work (indexes, query rewrites) |
| `Test` | Adding or improving tests only |
| `Docs` | README, AI_WORKFLOW.md, comments |
| `Chore` | Setup, config, tooling, dependencies, Docker |

Rules:

- Summary line says WHAT changed at a high level; bullets list the concrete changes.
- Bullets are specific (`- Add GIN trigram index on exercises.name`), not vague (`- Update files`).
- For `Bugfix`, the first bullet states the cause (`- Cause: lb weights converted with float math, causing rounding drift`).
- When a commit corrects AI-generated code, say so in a bullet (`- Replace AI-suggested OFFSET pagination with keyset cursor`). This is evidence for AI_WORKFLOW.md.
- English only. No emoji.

Example:

```
Feature: Add bulk workout logging endpoint

- Add POST /api/v1/users/:userId/workouts accepting multiple exercises
- Validate units, non-negative reps/weight, non-empty sets via DTOs
- Store original weight/unit plus normalized weight_kg
- Insert all entries in a single transaction
- Enforce Idempotency-Key with unique (user_id, idempotency_key)
```
