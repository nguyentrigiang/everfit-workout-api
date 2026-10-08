# Architecture brief: modular monolith refactor

Written by me after reviewing the AI-generated structure (see `docs/AI_LOG.md`, A28). It is the source of truth for how the code is organized as the project grows; `CLAUDE.md` points here.

## Project context

Workout Logging API for a fitness coaching platform. Current capabilities:

1. **Log workouts:** userId, date, exerciseName, sets (reps, weight, unit), kg/lb, normalized kg weight, bulk logging.
2. **Workout history:** filter by (partial) exercise name, date range and muscle group; requested output unit; pagination.
3. **Personal records:** heaviest set, highest-volume set (reps × weight), best Epley 1RM, the date each was achieved, comparison between time ranges.
4. **Exercise metadata:** exercise → muscle group mapping, configurable, never hardcoded in business logic.
5. **Extensibility:** kg and lb today; adding a unit such as stone needs minimal changes.
6. **Performance:** 50,000+ entries per user on PostgreSQL + Prisma; aggregation-heavy queries may use optimized SQL.

The project is small, but the architecture must stay maintainable if it grows significantly.

## Direction: modular monolith with DDD-oriented boundaries

This is **not** full enterprise DDD or Clean Architecture. Do not introduce command/query classes, a use-case class per operation, factories, mappers, domain events, event buses, CQRS or interfaces everywhere unless the business complexity actually requires them.

Goals: simple enough for the current assignment, clear separation of concerns, business-oriented module boundaries, easy to grow, and a module could later be extracted into a service if needed.

## Modules are business capabilities, not tables

- Bad: `UserModule`, `WorkoutEntryModule`, `WorkoutSetModule`, `MuscleGroupModule`, `WeightUnitModule` (one Nest module per Prisma model).
- Good: `WorkoutModule`, `ExerciseModule`. Possible future modules (`TrainingProgramModule`, `CoachingModule`, `ProgressModule`, `SubscriptionModule`, `PaymentModule`, `NotificationModule`) are **not** created until needed.

### Current boundaries

1. **WorkoutModule:** workout logging (incl. bulk), history, sets, personal record calculation and comparison. `WorkoutSet` is not its own module. Personal records stay here until they become a large independent capability (then `PersonalRecordsModule`).
2. **ExerciseModule:** exercises, exercise lookup, muscle groups, exercise → muscle group mapping. `MuscleGroup` is not its own module.

## Folder structure (guideline, not a checklist)

```text
src/
├── modules/
│   ├── workout/
│   │   ├── controllers/      workout.controller.ts, personal-record.controller.ts
│   │   ├── services/         workout.service.ts, personal-record.service.ts
│   │   ├── repositories/     workout.repository.ts, prisma-workout.repository.ts
│   │   ├── dto/              requests/, responses/
│   │   ├── domain/           entities/, types/, value-objects/
│   │   ├── converters/
│   │   └── workout.module.ts
│   └── exercise/
│       ├── controllers/ services/ repositories/ dto/ domain/
│       └── exercise.module.ts
├── shared/                   exceptions/, types/, utils/
├── infrastructure/
│   ├── database/prisma/      prisma.module.ts, prisma.service.ts
│   ├── logging/
│   └── config/
├── app.module.ts
└── main.ts
prisma/                       schema.prisma, migrations/
test/
```

Do not create empty folders or classes to match this tree; only folders that hold meaningful code.

**Business domain first, technical layer second.** Inside each module: `controllers/`, `services/`, `repositories/`, `dto/`, `domain/`, consistently across modules. Never a global `src/controllers`, `src/services`, `src/repositories`, `src/entities`.

## Responsibilities

- **Controller:** HTTP only (parsing, DTO validation, calling services, response handling). Thin; no business logic or Prisma queries.
- **Service:** business operations named as such (`logWorkout()`, `getWorkoutHistory()`, `getPersonalRecords()`, `comparePersonalRecords()`), not `insert()` / `select()` / `updateRow()`.
- **Repository:** persistence and queries. Services contain no large Prisma queries. `WorkoutService → WorkoutRepository → PrismaWorkoutRepository → Prisma → PostgreSQL`. Introduce a repository abstraction where it gives a useful boundary (e.g. `WorkoutRepository`), not mechanically for every class.
- **Domain:** domain objects only where they add business meaning (`Weight`, `WeightUnit`, `WorkoutSet`, `PersonalRecord`). Prisma models are persistence models and do not define module boundaries.

## SOLID, applied pragmatically

Every refactor step must respect SOLID, in the same pragmatic spirit as the rest of this brief:

- **Single responsibility:** a class has one reason to change. Controllers handle HTTP, services hold business rules, repositories hold persistence, pure domain helpers (unit conversion, strength metrics) hold calculations. Split a class when it mixes these, not to hit a size target.
- **Open/closed:** extend through data or a new implementation instead of editing existing branches. Adding a unit (stone) is one registry entry; adding a PR metric should not require rewriting the selection logic.
- **Liskov substitution:** any implementation of an abstraction (e.g. a test double or `PrismaWorkoutRepository` for `WorkoutRepository`) honors the same contract: same inputs, results, errors and transaction behavior.
- **Interface segregation:** abstractions expose only what their callers use. No catch-all repository with methods most callers never need.
- **Dependency inversion:** business services depend on abstractions they own (`WorkoutRepository`, a transaction runner), not on Prisma. Infrastructure implements them and is wired through Nest DI.

SOLID is a check on each change, not a reason to add interfaces, factories or layers that the current complexity does not need.

## Unit conversion

One clear abstraction; no `if (unit === 'kg') … else if (unit === 'lb')` anywhere. Adding stone needs minimal change. Keep it inside `WorkoutModule` while only the workout domain uses it; do not move code to `shared/` just because it looks reusable.

## `shared/` stays small

Good: generic exceptions, generic pagination types, truly generic utilities, cross-domain primitives. Bad: workout, exercise or personal-record logic.

## Infrastructure

Isolate infrastructure (`infrastructure/database/prisma`, `logging`, `config`). Business modules depend on it through clear boundaries. `PrismaService` must not be a global dependency used directly from every controller and service; avoid coupling business logic directly to Prisma.

## Database and query performance

Prisma for normal CRUD; optimized raw SQL where it gives a real performance or query-quality advantage (PR aggregates). Never load thousands of sets into Node.js to compute aggregates PostgreSQL can compute. Preserve or improve indexes for user, exercise, workout date, history filters and PR queries; review the schema before changing them.

## Dependency direction

No circular module dependencies. `WorkoutModule` may depend on `ExerciseModule`; not the reverse without a strong business reason. If a cycle appears, reconsider the boundary instead of reaching for `forwardRef()`.

## Scalability philosophy

No microservices. Today: `App → WorkoutModule, ExerciseModule`. A possible future (API gateway in front of workout, exercise/catalog, coaching, billing and notification services) is **not** being built; we only avoid decisions that would make that evolution unnecessarily hard.

## Testing

Preserve existing tests and make their ownership obvious. Unit tests focus on business rules (kg/lb conversion, volume, Epley, PR selection, PR range comparison, validation edge cases). Integration/e2e tests verify API behavior and database interaction. Do not chase coverage.

## Refactoring constraints

Primarily an architectural refactor: do not rewrite working business logic, change public API contracts, or rename concepts without a concrete reason. No abstractions just because DDD examples use them. Another senior NestJS developer must understand it without learning a custom architecture.

## Process

Before changing code: summarize the current architecture, its problems, the proposed boundaries and final tree, files to move, files needing real code changes, module dependencies, possible cycles, and every new abstraction with the reason for it. Wait for approval.

After approval, refactor incrementally. After each step: TypeScript compiles, relevant tests pass, imports fixed, Nest DI and Prisma verified, API behavior preserved. Suggested order: module boundaries → controllers/services/DTOs → repositories → Prisma infrastructure → unit conversion → PR queries (if needed) → shared cleanup → all tests → dependency graph review → README architecture docs.

## Final goal

> This is a small application today, so the architecture remains simple. However, code is grouped around business capabilities with explicit module boundaries. As the product grows, individual domains can become more complex without turning the codebase into a collection of globally mixed controllers, services, and repositories.

Pragmatic DDD over ceremonial DDD; clear business boundaries over abstractions; maintainability over cleverness.
