# Everfit Workout Logging API

A NestJS + PostgreSQL API that lets coaches log client workouts (in kg or lb), browse workout history and track personal records over time. It is built for correctness under retries and concurrent writes, and for fast reads at 50,000+ entries per user.

- [Quick start](#quick-start)
- [Architecture](#architecture)
- [API](#api)
- [Database](#database)
- [Key design decisions](#key-design-decisions)
- [Testing](#testing)
- [Production readiness](#production-readiness)
- [Performance](#performance)
- [Trade-offs](#trade-offs)
- [Scaling to 10,000 concurrent coaches](#scaling-to-10000-concurrent-coaches)
- [AI-assisted workflow](#ai-assisted-workflow)
- [Local development without Docker](#local-development-without-docker)

## Quick start

Requires Docker.

```bash
docker compose up --build
```

Migrations and the exercise catalog seed (31 exercises, 12 muscle groups from [`config/exercises.json`](config/exercises.json)) run on start.

- API: `http://localhost:3000/api/v1`
- Swagger UI: `http://localhost:3000/docs` (every endpoint can be tried from there)

Stop with `docker compose down`; data is kept in a volume. `docker compose down -v` wipes it. Port 3000 or 5432 already taken? See [Environment variables](#environment-variables) (`APP_PORT`, `DB_PORT`).

### Sample data (optional)

```bash
docker compose exec app npm run db:seed:demo
```

Adds `perf-user` (50,000 entries) and `demo-user-01` … `demo-user-20` (500 entries each). Safe to re-run.

### Basic usage

```bash
# Log workouts (several exercises per request, kg or lb)
curl -X POST localhost:3000/api/v1/users/coach-1/workouts \
  -H 'Content-Type: application/json' \
  -d '{"entries":[
        {"date":"2026-10-05T18:00:00+07:00","exerciseName":"Deadlift",
         "sets":[{"reps":5,"weight":315,"unit":"lb"},{"reps":3,"weight":160,"unit":"kg"}]},
        {"date":"2026-10-05T18:30:00+07:00","exerciseName":"Bench Press",
         "sets":[{"reps":8,"weight":80,"unit":"kg"}]}]}'

# History, converted to lb
curl 'localhost:3000/api/v1/users/coach-1/workouts?unit=lb'

# Personal records for an exercise
curl 'localhost:3000/api/v1/users/coach-1/records?exercise=deadlift'
```

## Architecture

A modular monolith: code is grouped by business capability first and by technical layer second, so each domain can grow (or later be extracted into its own service) without mixing with the others. The rules are in [`docs/ARCHITECTURE_BRIEF.md`](docs/ARCHITECTURE_BRIEF.md).

```text
src/
├── modules/                 business capabilities
│   ├── workout/             logging, history, personal records, unit conversion
│   │   ├── controllers/     HTTP only: DTOs in, response shapes out; Swagger docs in *.docs.ts
│   │   ├── services/        business rules and orchestration
│   │   ├── repositories/    WorkoutRepository contract + Prisma implementations
│   │   ├── dto/             requests/, responses/, validators/
│   │   └── domain/          pure logic: unit registry and converter, Epley, time parsing
│   └── exercise/            exercise catalog, muscle groups, name normalization
├── shared/                  kept small: errors, Swagger response decorators, transaction contract
└── infrastructure/          HTTP pipeline, config, logging, Prisma, seed and perf scripts
```

| Area | Responsibility |
|---|---|
| `modules/workout` | Bulk logging, history with filters and cursor pagination, personal records and comparisons. Owns unit conversion, since only this domain uses it |
| `modules/exercise` | Exercise catalog lookups, name normalization, auto-create, muscle-group filters |
| `shared` | `AppException` and error codes, Swagger error decorators, the `TransactionRunner` contract |
| `infrastructure` | HTTP pipeline (logging, validation, exception filter, Swagger setup), validated config, Prisma client, transaction runner, base repository, seed and performance scripts |

**Design principles (SOLID, applied pragmatically):**
- **Single responsibility:** controllers handle HTTP, services hold business rules, repositories own SQL, and `domain/` is plain logic with no framework imports.
- **Open/closed:** adding a unit (stone) is one registry entry; adding another workout persistence implementation is a new class, not a change to `WorkoutService`.
- **Liskov substitution:** `WorkoutRepository` documents its contract (natural-key idempotency, ordering, `limit + 1`); the Prisma implementation and the unit-test doubles honor it.
- **Interface segregation:** `TransactionRunner` has one method; `WorkoutRepository` exposes only the five operations the service uses.
- **Dependency inversion:** services depend on `TransactionRunner` and `WorkoutRepository`, not on Prisma. Writes take the transaction as a required argument, so a write cannot silently run outside it.

Abstractions exist only where they mark a real boundary; the personal-record and exercise repositories stay concrete classes that share a small `PrismaRepository` base.

**Bulk log request flow:**
1. The DTO validates the whole body: offset datetimes not in the future, limits, units from the registry. Any error rejects the entire request with 400.
2. `WorkoutService` normalizes exercise names, converts weights to kg and computes volume and Epley 1RM per set. This step is pure code, with no DB access.
3. Inside one `TransactionRunner.run`, missing exercises are created (`ON CONFLICT DO NOTHING`), then entries are inserted in a fixed order with `ON CONFLICT (user_id, exercise_id, performed_at) DO NOTHING`.
4. Entries that already existed are reported as `duplicate`. Sets are inserted only for new entries, and their denormalized columns are copied from the entry row in SQL.
5. The response is `201` if anything was created, or `200` if every entry was a duplicate.

## API

Full, always up-to-date documentation is in **Swagger UI at [`/docs`](http://localhost:3000/docs)** (OpenAPI JSON at `/docs-json`). It covers endpoints, request and response examples, limits and error codes, and it is generated from the DTOs so it stays in sync with validation.

Conventions:
- Base path `/api/v1`. No auth; `userId` is a path parameter.
- Endpoints: `POST /users/:userId/workouts` (bulk log), `GET /users/:userId/workouts` (history), `GET /users/:userId/records?exercise=` (PRs).
- Weights accept `kg` or `lb`. Responses use `?unit=` (default `kg`), rounded to 2 decimals.
- `date` must be ISO 8601 **with a UTC offset**. Date filters (`from`, `to`, …) are calendar days `YYYY-MM-DD` in the client's local time.
- Every error has the same shape `{ statusCode, code, error, message, details[], path, timestamp, requestId }`, with a stable `code` (`VALIDATION_ERROR`, `BAD_REQUEST`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`). Validation `details` point to the exact field, for example `entries[3].sets[1].weight`.

## Database

```mermaid
%%{init: {'er': {'fontSize': 18}, 'themeVariables': {'fontSize': '18px', 'fontFamily': '-apple-system, BlinkMacSystemFont, Segoe UI, system-ui, Ubuntu, sans-serif'}}}%%
erDiagram
  muscle_groups ||--o{ exercise_muscle_groups : "tagged on"
  exercises ||--o{ exercise_muscle_groups : "targets"
  exercises ||--o{ workout_entries : "logged as"
  workout_entries ||--|{ workout_sets : "has"

  muscle_groups {
    int id PK
    text slug UK
    text name
    int sort_order
  }
  exercises {
    uuid id PK
    text name
    text name_normalized UK
  }
  exercise_muscle_groups {
    uuid exercise_id PK
    int muscle_group_id PK
  }
  workout_entries {
    uuid id PK
    text user_id
    uuid exercise_id FK
    timestamptz performed_at
    date local_date
    int utc_offset_minutes
  }
  workout_sets {
    uuid id PK
    uuid entry_id FK
    int set_index
    int reps
    numeric weight
    text unit
    numeric weight_kg
    numeric volume_kg
    numeric e1rm_kg
    text user_id
    uuid exercise_id
    timestamptz performed_at
    date local_date
  }
```

Each row reads `type name key`: PK primary key, FK foreign key, UK unique. `workout_entries (user_id, exercise_id, performed_at)` is unique as well: it is the natural key that makes retries idempotent (see the index table below).

### Tables

**`muscle_groups`**: the list of muscle groups, seeded from `config/exercises.json`. A table rather than a text column, so the filter checks slugs against real rows and a future screen can list them.

| Column | Purpose |
|---|---|
| `id` | Small integer key, used only by the join table |
| `slug` | Stable value for the API filter (`?muscleGroup=chest`), unique |
| `name` | Display name ("Chest") |
| `sort_order` | Display order; slugs are listed in this order |

**`exercises`**: one row per exercise, shared by all users. Kept apart from entries so a name is stored once, filters and PRs work on an id, and muscle groups attach to the exercise.

| Column | Purpose |
|---|---|
| `id` | UUIDv7 key referenced by entries |
| `name` | Display name as first logged or configured ("Bench Press") |
| `name_normalized` | Lookup key (NFKC, trimmed, lowercased, single spaces), unique, so "bench  press" and "Bench Press" are one exercise. Also used for partial name search |
| `created_at` | When the exercise was added (by the seed or on first log) |

**`exercise_muscle_groups`**: which muscle groups an exercise works. Many-to-many: one exercise trains several groups (bench press: chest, triceps, shoulders) and one group has many exercises.

| Column | Purpose |
|---|---|
| `exercise_id`, `muscle_group_id` | Composite primary key, so each pair is stored once. An extra index on `muscle_group_id` serves the muscle-group filter |

**`workout_entries`**: one exercise a client did at one moment ("bench press on Oct 5 at 18:00"). This is what history lists and what a retry is matched against.

| Column | Purpose |
|---|---|
| `id` | UUIDv7 key; tie-breaker in the history cursor |
| `user_id` | The client from the path. First column of every index, so each query reads only that client's rows |
| `exercise_id` | Which exercise |
| `performed_at` | Exact moment in UTC: history order, cursor and part of the natural key |
| `local_date` | The client's calendar day, so "October" means October where the client trained (see the timezone strategy under [Key design decisions](#key-design-decisions)) |
| `utc_offset_minutes` | Offset the client sent (+07:00 is 420), kept to rebuild local time; a CHECK limits it to ±14 h |
| `created_at` | When the row was written; later than `performed_at` for workouts logged after the fact |
| UNIQUE `(user_id, exercise_id, performed_at)` | Natural key: a retry or a concurrent duplicate is skipped instead of stored twice |

**`workout_sets`**: one row per set of an entry. Sets have their own table because PRs are per set (heaviest set, best set volume), and one row per set lets an index find the best set directly.

| Column | Purpose |
|---|---|
| `id` | UUIDv7 key |
| `entry_id` | Parent entry; sets are deleted with it |
| `set_index` | Order within the entry (0, 1, 2…), unique per entry |
| `reps` | Repetitions; a CHECK requires `> 0` |
| `weight`, `unit` | Exactly what was logged (`315`, `lb`), never rewritten |
| `weight_kg` | Weight in kg (6 decimals), so kg and lb sets compare directly |
| `volume_kg` | `reps × weight_kg`, precomputed for the highest-volume PR |
| `e1rm_kg` | Epley estimated 1RM, precomputed for the best-1RM PR |
| `user_id`, `exercise_id`, `performed_at`, `local_date` | Copied from the entry so PR queries run on this table alone (see Normalization below) |

### Design decisions

**Why PostgreSQL:** the workload is relational and aggregation-heavy. PRs are top-1 lookups per user and exercise, which map directly onto composite B-tree indexes. Bulk logging needs transactions and unique constraints, and the data shape is fixed, so MongoDB's flexibility buys nothing here ([details](docs/DECISIONS.md#2026-10-08--database-postgresql)).

**Normalization:** the catalog is normalized: exercises, muscle groups and a join table, seeded from config. `workout_sets` is deliberately denormalized. Each set stores the original `weight` and `unit`, the precomputed `weight_kg`, `volume_kg` and `e1rm_kg` (numeric, 6 decimals), and copies of `user_id`, `exercise_id`, `performed_at` and `local_date`. PR queries therefore need no join and no computation at read time. The copies are written from the entry row in SQL, so they cannot drift. Entries are immutable, which keeps the write-time cost acceptable ([details](docs/DECISIONS.md#2026-10-08--sets-storage-and-pr-strategy)).

**Primary keys:** UUIDv7 generated by PostgreSQL (`uuidv7()`), so inserts append to the primary-key index instead of scattering like random v4 ids. History is still ordered by `performed_at`, with `id` only as a tie-breaker ([details](docs/DECISIONS.md#2026-10-08--primary-keys-uuidv7)).

**Indexing strategy:**

| Index | Serves |
|---|---|
| `workout_entries (user_id, performed_at DESC, id DESC)` | History listing and keyset cursor `(performed_at, id) < (…)` |
| `workout_entries UNIQUE (user_id, exercise_id, performed_at)` | Idempotency / concurrent-write guard; history filtered by exercise |
| `workout_sets (user_id, exercise_id, weight_kg DESC)` | Heaviest-set PR (top-1) |
| `workout_sets (user_id, exercise_id, volume_kg DESC)` | Highest-volume PR (top-1) |
| `workout_sets (user_id, exercise_id, e1rm_kg DESC)` | Best estimated 1RM PR (top-1) |
| `workout_sets (user_id, exercise_id, local_date)` | PRs within a calendar range (this month vs last month) |
| `workout_sets UNIQUE (entry_id, set_index)` | Set order; join from entries |
| `exercises UNIQUE (name_normalized)` | Name lookup, auto-create race safety |
| `exercise_muscle_groups (muscle_group_id)` | Muscle-group filter |

Partial name search runs on the small `exercises` table, and its ids then filter entries, so no trigram index is needed. Hand-written CHECK constraints (`reps > 0`, `weight >= 0`, offset within ±14h) back up request validation.

## Key design decisions

Each item is a summary. [`docs/DECISIONS.md`](docs/DECISIONS.md) has the alternatives and full reasoning.

- **Timezone strategy.** Clients send ISO datetimes with an offset. We store `performed_at` in UTC for ordering, ranges and pagination, plus `local_date` (the client's calendar day) and the offset. Calendar questions use `local_date`, so a 6am workout on Nov 1 in UTC+7 counts in November, even though it is still Oct 31 in UTC. Trade-off: the offset is a snapshot, not an IANA zone ([details](docs/DECISIONS.md#2026-10-08--time-and-timezone)).
- **Units.** A registry `{ kg: 1, lb: 0.45359237 }` is the single source for validation and conversion. Adding `stone` is one line. All math uses decimal.js ([details](docs/DECISIONS.md#2026-10-08--units-decimal-math-and-1rm)).
- **Idempotency and concurrent writes.** A natural key, UNIQUE `(user_id, exercise_id, performed_at)` with `ON CONFLICT DO NOTHING`, makes retries and simultaneous identical requests store exactly one copy. Inserts run in a fixed order so that concurrent requests listing the same entries in a different order cannot deadlock ([details](docs/DECISIONS.md#2026-10-08--idempotency-and-concurrent-writes)).
- **Bulk logging.** Synchronous, one transaction, all-or-nothing after validating the whole request. Limits: ≤ 100 entries, ≤ 50 sets, reps 1–1000, weight 0–2000 in the submitted unit. The JSON body limit is raised to 1 MB to fit the largest valid request ([details](docs/DECISIONS.md#2026-10-08--bulk-logging)).
- **Pagination.** An opaque keyset cursor instead of OFFSET, so each page costs O(page size) even at 50k+ entries ([details](docs/DECISIONS.md#2026-10-08--workout-history)).
- **Personal records.** Three indexed top-1 lookups in one SQL statement. 1RM uses the Epley formula as specified, applied to every set. When a value is reached again, the most recent set is reported. Comparison takes an explicit second date range ([details](docs/DECISIONS.md#2026-10-08--personal-records)).
- **Configurable muscle groups.** The mapping lives in `config/exercises.json`. The seed is validated and insert-only: it never rewrites stored data. Unknown exercise names are created on the fly without muscle groups ([details](docs/DECISIONS.md#2026-10-08--seeding-the-exercise-catalog)).

## Testing

```bash
npm ci
npm run typecheck           # type-check src and tests (Vitest strips types without checking them)
npm test                    # unit tests (no DB); generates the Prisma client first
docker compose up -d db     # e2e needs Postgres (database everfit_test, created on first start)
npm run test:e2e            # migrates, wipes and seeds everfit_test, then runs e2e tests
npm run docs:check          # validates the OpenAPI document of a running built app
```

- **Unit (105):** unit conversion (incl. adding `stone`), Epley and volume (incl. rounding pitfalls), decimal rounding, date and offset parsing, cursor encoding, env validation, log serializers, exception filter, validation error paths, catalog config validation, bulk-logging status counting and single-transaction writes, demo data generator (determinism, validation limits, local dates), EXPLAIN plan parsing and percentiles.
- **E2E (87):** every endpoint through the real HTTP pipeline and Postgres:
  - logging in mixed units, auto-created exercises
  - idempotent retries, concurrent identical and reversed-order requests
  - every validation edge case (invalid unit, null date, missing offset, future date, negative weight, zero reps, empty sets, limits, unknown fields)
  - history filters, unit conversion, pagination without gaps or duplicates, empty ranges
  - PR values, ties and comparisons
  - DB constraints (unique, cascade, CHECK) and UUIDv7 keys
  - demo seeding (batches, copied set columns, re-run and resume after a partial run)
  - the largest valid bulk request

E2E tests are grouped like the code: `test/modules/workout` (endpoints) and `test/infrastructure` (database constraints, seeds, HTTP pipeline, Swagger).

Tests are named by behavior and assert exact values computed by hand, never re-computed with the implementation's formula.

## Production readiness

- **Docker:** multi-stage image running as a non-root user. Migrations and the seed run on start. Postgres has a TCP healthcheck, and the app waits for it.
- **Configuration:** env vars are validated at startup with class-validator. A missing or invalid value stops the app with a message listing every problem. See [Environment variables](#environment-variables) and [`.env.example`](.env.example).
- **Logging:** structured JSON logs (pino) with one line per request (except requests rejected by the body parser, see backlog B1) and a request id, taken from `x-request-id` or generated, echoed back and included in error bodies. Bodies and headers are never logged. Pretty output in development only.
- **Errors:** one error shape. 5xx responses never expose internals; the stack goes to the log only.
- **Limits and validation:** strict DTO validation with whitelist and unknown fields rejected, request size limits, DB CHECK constraints as a second line of defense.

### Environment variables

**App** (validated at startup in [`env.validation.ts`](src/infrastructure/config/env.validation.ts); the app reads config only through `ConfigService`):

| Variable | Default | Rule |
|---|---|---|
| `NODE_ENV` | `production` | `development`, `production` or `test`. `development` enables pretty logs |
| `PORT` | `3000` | Integer 1–65535 |
| `DATABASE_URL` | required | `postgres://` or `postgresql://` connection string |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |

[`.env.example`](.env.example) holds development values (`NODE_ENV=development`, `LOG_LEVEL=debug`). The Docker image sets `NODE_ENV=production`.

**Docker Compose** (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `everfit` | Database credentials; the app's `DATABASE_URL` is built from them. Local defaults only, set real secrets elsewhere |
| `APP_PORT` | `3000` | Host port for the API, e.g. `APP_PORT=3001 docker compose up` when 3000 is taken |
| `DB_PORT` | `5432` | Host port for Postgres |
| `LOG_LEVEL` | `info` | Passed to the app container |

`docker compose` also reads a `.env` file in the project root for these substitutions, so copying `.env.example` makes the container log at `debug`. Its other values do not reach the container: Compose sets `PORT` and builds `DATABASE_URL` itself.

**Scripts and tests** (the seed and perf scripts load `.env` when present; e2e tests do not):

| Variable | Default | Used by |
|---|---|---|
| `DATABASE_URL` | required | `npm run db:seed`, `db:seed:demo`, `db:explain` |
| `SEED_CONFIG_PATH` | `config/exercises.json` | Catalog and demo seeds |
| `BASE_URL` | `http://localhost:3000` | `npm run db:explain` (HTTP timings) |
| `PERF_REPORT_PATH` | `docs/PERFORMANCE.md` | `npm run db:explain` (report output) |
| `TEST_DATABASE_URL` | `postgresql://everfit:everfit@localhost:5432/everfit_test` | `npm run test:e2e`; never touches the main database |

## Performance

**Dataset:** `npm run db:seed:demo` generates deterministic history (fixed-seed PRNG, fixed end date `2026-09-30`; the same catalog config gives the same data): `perf-user` has 50,000 entries and about 175,000 sets over five years, next to 20 users with 500 entries each, so every query must stay scoped by `user_id`. Weights progress over time, about 20% of sessions are logged in lb, and users have different UTC offsets. The density (several sessions a day) is higher than real life on purpose: query cost depends on rows per user, not on how they are spread. Rows are written with the API's own repository SQL and metric code (`computeSetMetrics`), so stored kg, volume and 1RM values match what the API writes ([details](docs/DECISIONS.md#2026-10-08--demo-and-performance-seed-data)).

**Results** (PostgreSQL 18.6, `perf-user` with 50,000 entries and 174,636 sets; full plans in [docs/PERFORMANCE.md](docs/PERFORMANCE.md)):

| Query | Plan | DB time | HTTP p50 / p95 |
|---|---|---|---|
| History, first page (20 / 100) | Index Scan on `(user_id, performed_at DESC, id DESC)`, stops after `limit + 1` rows, no sort | 0.30 / 0.48 ms | 3.4 / 5.8 ms |
| History, deep page (cursor after 49,000 entries) | Same index, cursor becomes the index start | 0.15 ms | 3.7 / 5.3 ms |
| History by exercise / muscle group (incl. with month and cursor) | Exercise ids resolved on the 31-row catalog first, then `exercise_id = ANY(…)` on the unique key or history index | 0.25–0.42 ms | 4.3–4.7 / 5.3–6.4 ms |
| History for one month | History index bounded by the widened `performed_at` range, exact match on `local_date` | 0.49 ms | 4.2 / 5.4 ms |
| Sets for a page of 100 entries | `UNIQUE (entry_id, set_index)` | 0.09 ms | — |
| PRs, all time | Three top-1 Index Scans on the `(user_id, exercise_id, <metric> DESC)` indexes | 0.08 ms | 2.7 / 3.9 ms |
| PRs, one month / month vs month | Planner picks the metric index or `(user_id, exercise_id, local_date)` by range | 0.12–0.28 ms | 3.1–3.6 / 4.5–5.1 ms |
| Exercise filter matching nothing (former worst case) | Catalog lookup finds no ids, history is not queried | **0.01 ms** (was 13.8 ms) | 2.3 / 2.8 ms (was 13.0 / 14.2 ms) |

Re-run with `npm run db:seed:demo && npm run build && npm run db:explain` (the app must be running for the HTTP columns).

**Findings:**
- Keyset pagination keeps the deepest page as fast as the first one: OFFSET would read and discard 49,000 rows.
- Each PR is one index lookup that reads a handful of rows, independent of history size. The denormalized metric columns are what make this possible.
- No new index is needed for the 50k target. A suggested `(user_id, exercise_id, performed_at DESC, id DESC)` index was measured and rejected: the existing unique key already orders entries within an exercise.
- The first measurement found one path that grew with history size: a filter matching no exercise walked all 50,000 entries (13.8 ms). Resolving exercise ids on the catalog first and returning early when there are none removed it (0.01 ms). The fix was a query change, not an index. For a filter that matches exercises the client rarely trains, the plan depends on the planner's estimate and may walk part of the history index; reading each exercise through the unique key makes this bounded at larger scale (see below).
- About 3 ms of each HTTP request is the Nest pipeline, unit conversion and JSON; the database accounts for well under 1 ms.

## Trade-offs

Each item is a choice: what was picked over what, what it gains and what it costs.

### Data model

- **Time: a per-entry offset over a per-client time zone or UTC only.** *Gain:* each workout keeps the calendar day where it happened, so a client who trains one week in Vietnam and the next in the US gets both weeks on the right days; no timezone database is needed; calendar filters are an indexed `local_date` match. *Cost:* the API trusts the sender, so a coach in New York logging for a client in Vietnam with the coach's own clock puts the workout on the wrong day. Around travel, local dates do not always follow real time: two workouts can share a date, and crossing the date line (Japan to Hawaii) a later workout can even carry an earlier date; history is ordered by `performed_at`, so the order stays right while the dates look out of order. An offset is a snapshot, so local time cannot be re-derived if DST rules change.
- **Primary keys: UUIDv7 over bigint serials or UUIDv4.** *Gain:* ids need no central counter and cannot be enumerated (no guessing `/entries/124` from `123`); unlike v4, new ids are time-ordered, so inserts append to the end of the B-tree instead of splitting random pages. *Cost:* 16 bytes instead of 8, so every primary key and every index holding one is larger; the id embeds its creation time to the millisecond, which reveals when a row was written; generation relies on PostgreSQL 18's `uuidv7()` (older versions would generate ids in the app).
- **Sets: one row per set, denormalized, with precomputed metrics, over computing on read.** *Gain:* each PR is one top-1 index lookup with no join or arithmetic at read time. *Cost:* every set row updates six B-trees and stores copied columns, so writes cost more, and changing the 1RM formula would need a backfill.
- **Weights: exact `numeric` over floating point.** *Gain:* no `0.1 + 0.2` drift in stored kg, volume or 1RM; values keep 6 decimals and are rounded only for output. *Cost:* larger columns and slower arithmetic than `double precision`, and the app carries decimal strings and `decimal.js` instead of plain numbers.
- **Muscle groups: tables over a `text[]` column.** *Gain:* foreign keys stop typos, and a future screen can list groups with display names and order. *Cost:* a join table and a subquery in the filter; the speed is the same today because the catalog is tiny.

### Writes

- **Exercise names: free text with normalization over an `exerciseId` picked from the catalog.** *Gain:* matches the assignment's request shape, and clients need no catalog lookup first. Normalization (NFKC, trim, lowercase, single spaces) merges "Bench Press", "  bench   press" and differently encoded Vietnamese accents. *Cost:* synonyms and typos stay separate ("Squat", "Back Squat", "Sqaut"). Diacritics are kept on purpose, because stripping them would merge different Vietnamese words (chân, chăn, chặn), so "chan" and "chân" are two exercises. In production, clients would pick an `exerciseId` from a searchable catalog with aliases.
- **Unknown exercises: auto-create over rejecting.** *Gain:* coaches are never blocked by the catalog. *Cost:* typos and variants become separate exercises ("chan" vs "chân", "Squat" vs "Back Squat"), and new exercises have no muscle groups, so the muscle-group filter misses them until the config is updated.
- **Retries: an insert-only natural key over upsert or an `Idempotency-Key` header.** *Gain:* a retry or a concurrent duplicate stores exactly one copy, with no client-generated key and no extra table. *Cost:* the first write wins; a resend with corrected sets is reported as `duplicate` and ignored, so corrections need a separate update flow. Two different workouts of one exercise at the exact same instant cannot both be stored.
- **Bulk requests: one transaction, all-or-nothing, over partial success.** *Gain:* a request is either fully stored or not at all, and a 400 points to the exact bad field (`entries[3].sets[1].weight`). *Cost:* one bad entry rejects the other 99, so the client fixes and resends the whole batch; locks are held for the whole batch, hence the 100-entry limit.
- **Indexes: many purpose-built indexes over a few general ones.** *Gain:* every read is an index lookup (history, deep cursor and PRs under 1 ms at 50,000 entries). *Cost:* each set insert updates six B-trees and each entry two more; the three PR indexes take more space than the sets themselves (61 MB vs 42 MB per 175,000 sets); vacuum and backups grow with them. The monthly PR summary table under Scaling would let the PR indexes go.
- **Future timestamps: zero tolerance over a clock-skew window.** *Gain:* no workout is ever dated in the future. *Cost:* a client whose clock runs ahead gets a 400 for "now".
- **Catalog seed: insert-only over syncing from config.** *Gain:* a seed run never rewrites or deletes data already in use. *Cost:* changing an existing exercise's muscle groups in `config/exercises.json` does not reach an existing database; that needs a migration or a manual change.

### Reads

- **PRs: computed on read over a cache or summary table.** *Gain:* always consistent with the latest write, with nothing to invalidate. *Cost:* every request repeats the index lookups; fine at the measured sub-millisecond cost, revisited under Scaling.
- **Pagination: a keyset cursor over OFFSET.** *Gain:* a deep page costs the same as the first, with no gaps or duplicates while new workouts arrive. *Cost:* no page numbers or "jump to page N"; clients move forward with the cursor only. The cursor is opaque base64url, so its shape can change without breaking clients, but it cannot be built or edited by hand.
- **PR ties: the most recent set over the first time the value was reached.** *Gain:* shows the client still lifts at that level. *Cost:* the date the record was first set is not shown.
- **PR `difference` from the displayed values over the exact values.** *Gain:* the difference always matches the two numbers the client shows. *Cost:* it can differ from the exact difference by up to 0.01.

### API

- **Comparison: explicit `compareFrom`/`compareTo` over presets such as `period=month`.** *Gain:* any comparison (week, month, year, custom) without the server guessing the client's time zone. *Cost:* the client computes both date ranges itself.
- **Output unit: one unit for the whole response (default kg) over each set's original unit.** *Gain:* values are directly comparable and charts need no conversion. *Cost:* a set logged in lb comes back in kg unless `unit=lb` is passed; the original unit is stored but not returned in history.
- **Raw SQL over the Prisma query builder for the core queries.** *Gain:* full control over `unnest` bulk inserts, `ON CONFLICT`, keyset conditions and top-1 plans. *Cost:* result types are a promise to TypeScript, not checked at runtime, so the queries rely on the e2e suite running against Postgres.

### Known limitations

- No update or delete endpoint; the assignment does not cover them.
- Unparsable JSON returns `BAD_REQUEST` rather than a dedicated code, because Nest maps body-parser errors before the exception filter (backlog B1 in `docs/REQUIREMENTS.md`).
- A filter matching exercises the client rarely trains walks the client's history index until `limit` matches are found (a filter matching no exercise returns early). The per-exercise read that fixes it is described under Scaling.

## Scaling to 10,000 concurrent coaches

**Load estimate (assumptions, not measurements):** 10,000 active coaches making one request every ~10 seconds is about **1,000 requests/s**, say 80% reads and 20% writes. Each request runs 2–4 queries of under 0.5 ms each (see [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md)), so the database does roughly 1–2 cores of query work: CPU is not the first limit, **connections are**. The `pg` pool defaults to 10 connections per app instance, so instances multiply connections, hence PgBouncer below. Writes come to ~200 transactions/s with ~5 sets each, about 1,000 set rows/s, each updating six B-trees today (see item 6 of the data list). Only latency has been measured so far, not throughput: a load test (e.g. k6) against a production-like setup should decide the instance count.

- **Connections:** run several stateless app instances behind a load balancer, with PgBouncer in transaction mode in front of Postgres.
- **Reads:** route history and PR queries to read replicas. Writes stay on the primary.
- **Hot data:** cache PR responses per `(user, exercise, range)` in Redis and invalidate them on writes for that user and exercise. Optionally maintain a small "all-time PR" table asynchronously.
- **Write path:** keep logging synchronous, but move side effects (PR notifications, analytics, exports) to a queue (e.g. BullMQ or SQS) via an outbox table. Large historical imports go through a background job.
- **Protection:** rate limit per user and coach, enforce request size limits, set timeouts and statement timeouts.
- **Observability:** add metrics (p95 latency per endpoint, DB pool usage, slow queries via `pg_stat_statements`) next to the request-id logs, and alert on error rate.
- **Auth and tenancy:** coaches sign in (JWT or session), and every request checks that the coach may access the client before any query. The client id comes from the coach–client relationship, not from trusting the path parameter.
- **Health checks:** a liveness endpoint and a readiness endpoint that runs `SELECT 1`, so the load balancer drops broken instances. Rolling deploys rely on the graceful shutdown already in place (`enableShutdownHooks`, and `exec` in the entrypoint so the app receives SIGTERM).
- **Client time zones:** today the API trusts the offset it receives. When a client logs, the app should send the device's time zone at that moment, which keeps travel right. When a coach logs for a client, it should use the client's profile time zone, or let the coach pick it, so a coach in New York does not put a Vietnam workout on the wrong day. Store the IANA zone next to the offset so DST rules can be applied later.

### Data and queries at 50 million entries

Assume millions of clients, 50 million entries in total (about 175 million sets), some clients with ten years of history, and a much larger exercise catalog.

**Realistic scale:** a rough Fermi estimate for a platform of Everfit's size (about 200,000 coaches) gives 1–2 billion cumulative entries, about 2 million new entries a day and a few TB of data, roughly 30× the assumption above. These are estimates, not Everfit figures. Per-client queries still hold (below), but at that size item 3 (partitioning) and sharding by `user_id` move from "when needed" to required.

**What still holds:** a client training five or six exercises a day for ten years has about 18,000 entries, fewer than the 50,000 measured above. Every index starts with `user_id`, so per-client queries stay as measured (history, deep cursor and PRs under 1 ms); a larger table adds about one B-tree level.

**What I would change, in order:**

1. **Per-client custom exercises.** Unknown exercise names are currently added to one shared catalog. With millions of clients that catalog fills with near-duplicates ("squat", "pause squat", typos) that everyone sees. Add `exercises.owner_user_id` (null for the curated catalog) with unique `(owner_user_id, name_normalized)`; history and PRs resolve names against the curated catalog plus the client's own exercises. This is a data-correctness change and gets harder the longer it waits.
2. **Read filtered history per exercise.** Exercise ids are already resolved on the catalog first, with an early return when none match (this removed the 13.8 ms worst case). An exercise or muscle-group filter that matches exercises the client rarely trains still walks the history index until `limit` matches are found. Read each matching exercise's entries through the existing unique key `(user_id, exercise_id, performed_at)` with a `LATERAL` subquery, then merge. Cost then depends on the number of exercises times `limit`, not on history size. No new index is needed; an extra `(user_id, exercise_id, performed_at DESC, id DESC)` index was measured and rejected.
3. **Partition `workout_entries` and `workout_sets` by hash of `user_id`** (32–64 partitions). At the measured ratios (42 MB of sets and 61 MB of PR indexes per 175,000 sets) 175 million sets come to roughly 42 GB of table and 60 GB of PR indexes, which no longer fit in memory. Every query is per client, so partitions prune well, indexes per partition stay small, vacuum runs per partition, and the layout maps directly onto sharding by `user_id` (e.g. Citus) later.
4. **Trigram index for name search** (`pg_trgm` GIN on `exercises.name_normalized`) once the catalog has tens of thousands of rows; `LIKE '%…%'` is a scan of a 31-row table today.
5. **Planner statistics.** Statistics are averaged over all clients, so a heavy and a light client can get the same plan. Raise the statistics target on `user_id` and `exercise_id`, and catch regressions with `auto_explain`.
6. **Monthly PR summary table** `(user_id, exercise_id, month)` with the best weight, volume and 1RM, updated in the logging transaction (entries are immutable, so it never needs recomputing). Range PRs then read a few rows regardless of planner choices, and the three PR indexes on `workout_sets` (six B-trees updated per set today) could be dropped to cut write cost.

## AI-assisted workflow

This project was built with Claude Code. Being small, solo and time-boxed, it uses only the process and agents that made it faster, and keeps every decision with me.

**What this project uses**

| Piece | Role |
|---|---|
| [`CLAUDE.md`](CLAUDE.md), [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md), [`docs/DECISIONS.md`](docs/DECISIONS.md), [`docs/ARCHITECTURE_BRIEF.md`](docs/ARCHITECTURE_BRIEF.md) | Rules and context kept in files instead of repeated prompts: domain rules, requirement IDs, decisions already made, code layout |
| `grill-plan` skill | Clarifying questions first, then a one-concern plan that I approve before any code |
| `domain-reviewer` subagent | Read-only review of each diff against the domain rules, in its own context |
| `query-optimizer` subagent | `EXPLAIN ANALYZE` on 50,000 entries, including worst cases |
| `test-writer` subagent, `check-progress` skill | Set up, rarely needed: tests were written with each feature and progress lived in `REQUIREMENTS.md` |

The loop: clarifying questions → plan → my approval → code and tests → reviewer subagent → my review → commit only when I say so. No MCP servers were needed: the AI worked inside the repo and ran the build, tests, migrations, `curl` and `EXPLAIN` itself. The setup is small on purpose; more roles would have cost more setup and review time than they saved on a project this size.

**Four notable AI mistakes and how I handled them**

- **A folder layout that would not scale (caught when I reviewed the structure as a whole).** The AI laid the code out as one flat folder per technical piece (`workouts`, `records`, `units`, `prisma`, `common`…), with personal records split from workouts and services calling Prisma transactions directly. It worked, but nothing said where new code goes. I wrote [`docs/ARCHITECTURE_BRIEF.md`](docs/ARCHITECTURE_BRIEF.md) (modular monolith, small `shared/`, isolated `infrastructure/`, pragmatic SOLID), and the AI refactored against it in four reviewed steps with the API unchanged, checked by diffing `/docs-json` (`c85d9ea`, then `b4b46bb` to `2faf53d`).
- **PostgreSQL 16 picked by habit (caught because I asked why).** There was no reason for 16, and it missed PostgreSQL 18's native `uuidv7()`. I had it upgrade to 18 and then switch primary keys to time-ordered UUIDv7 in a separate commit (`b54c715`, `f61f5ec`). Since then I ask "why this?" about every default.
- **Correct code that was too compact to read (caught when I read the code to explain it).** `logWorkouts` was one 70-line transaction callback with one-letter variables and non-null assertions. I asked for the whole service layer to be rewritten as named steps that read like prose, without touching a single test, so the unchanged, passing tests prove the behavior is the same (`0460a3d`, `d2b6154`).
- **Bulk inserts that could deadlock (caught by the reviewer subagent I set up for every diff).** The AI inserted entries and new exercises in request order. Two concurrent requests with the same entries in a different order locked the unique index in opposite orders and deadlocked, which surfaced as a 500, exactly the concurrent-write case the assignment asks about. I had the inserts run in a fixed order of the natural key (`ORDER BY` inside the `INSERT … SELECT`) and added an e2e test that fires reversed bodies concurrently (`7fe3785`).

Others were caught the same ways: a JSON body limit below the largest valid request (reviewer), a duplicate reporting the set count it was sent rather than the one stored (reviewer), and Epley returning 79.999… instead of 80 (unit test); see [`AI_WORKFLOW.md`](AI_WORKFLOW.md).

**What a larger project would add**

- **More roles as subagents**, each read-only in its own context: a security reviewer (authorization, injection, personal data in logs), an API contract reviewer (breaking changes against the published OpenAPI), a migration reviewer (locking DDL, backfills, rollback), a load-test agent that writes and runs k6 scenarios, and a docs writer.
- **Skills for team workflows:** ticket to plan with acceptance criteria, a migration checklist, release notes from commits, an incident runbook.
- **Hooks and CI:** pre-commit typecheck, lint and tests; secret scanning; no direct commits to `main`; an AI review step on every pull request; shared permission settings checked into the repo.
- **MCP servers**, read-only by default: Jira or Linear for tickets, Confluence or Notion for specs and ADRs, GitHub for PRs and issues, a PostgreSQL server on a read replica or staging for real query plans and data shapes, Sentry or Datadog for errors and traces, Figma for the UI specs behind API shapes, Slack for notifications, and a browser for end-to-end checks.
- **Guardrails:** least-privilege tokens, no production writes from the AI, and human approval for anything outward-facing.

See [`AI_WORKFLOW.md`](AI_WORKFLOW.md) for the process and [`docs/AI_LOG.md`](docs/AI_LOG.md) for every AI mistake that was caught and every suggestion that was rejected.

## Local development without Docker

Requires Node 24 and a PostgreSQL 18 instance (or `docker compose up -d db`).

```bash
npm ci
cp .env.example .env          # adjust DATABASE_URL if needed
npx prisma migrate deploy     # apply migrations
npm run build                 # also generates the Prisma client
npm run db:seed               # seed the exercise catalog (insert-only, safe to re-run)
npm run start:dev             # http://localhost:3000/api/v1, docs at /docs
```
