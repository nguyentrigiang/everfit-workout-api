-- CreateTable
CREATE TABLE "muscle_groups" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "muscle_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_muscle_groups" (
    "exercise_id" UUID NOT NULL,
    "muscle_group_id" INTEGER NOT NULL,

    CONSTRAINT "exercise_muscle_groups_pkey" PRIMARY KEY ("exercise_id","muscle_group_id")
);

-- CreateTable
CREATE TABLE "workout_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "exercise_id" UUID NOT NULL,
    "performed_at" TIMESTAMPTZ(3) NOT NULL,
    "local_date" DATE NOT NULL,
    "utc_offset_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "set_index" INTEGER NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight" DECIMAL(10,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "weight_kg" DECIMAL(14,6) NOT NULL,
    "volume_kg" DECIMAL(16,6) NOT NULL,
    "e1rm_kg" DECIMAL(14,6) NOT NULL,
    "user_id" TEXT NOT NULL,
    "exercise_id" UUID NOT NULL,
    "performed_at" TIMESTAMPTZ(3) NOT NULL,
    "local_date" DATE NOT NULL,

    CONSTRAINT "workout_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "muscle_groups_slug_key" ON "muscle_groups"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "exercises_name_normalized_key" ON "exercises"("name_normalized");

-- CreateIndex
CREATE INDEX "exercise_muscle_groups_muscle_group_id_idx" ON "exercise_muscle_groups"("muscle_group_id");

-- CreateIndex
CREATE INDEX "workout_entries_user_performed_idx" ON "workout_entries"("user_id", "performed_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "workout_entries_user_exercise_performed_key" ON "workout_entries"("user_id", "exercise_id", "performed_at");

-- CreateIndex
CREATE INDEX "workout_sets_pr_weight_idx" ON "workout_sets"("user_id", "exercise_id", "weight_kg" DESC);

-- CreateIndex
CREATE INDEX "workout_sets_pr_volume_idx" ON "workout_sets"("user_id", "exercise_id", "volume_kg" DESC);

-- CreateIndex
CREATE INDEX "workout_sets_pr_e1rm_idx" ON "workout_sets"("user_id", "exercise_id", "e1rm_kg" DESC);

-- CreateIndex
CREATE INDEX "workout_sets_user_exercise_local_date_idx" ON "workout_sets"("user_id", "exercise_id", "local_date");

-- CreateIndex
CREATE UNIQUE INDEX "workout_sets_entry_id_set_index_key" ON "workout_sets"("entry_id", "set_index");

-- AddForeignKey
ALTER TABLE "exercise_muscle_groups" ADD CONSTRAINT "exercise_muscle_groups_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_muscle_groups" ADD CONSTRAINT "exercise_muscle_groups_muscle_group_id_fkey" FOREIGN KEY ("muscle_group_id") REFERENCES "muscle_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_entries" ADD CONSTRAINT "workout_entries_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "workout_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (hand-written; Prisma schema cannot express them).
-- Second line of defense behind request validation, e.g. for scripts or raw SQL.
ALTER TABLE "workout_entries"
  ADD CONSTRAINT "workout_entries_utc_offset_range" CHECK ("utc_offset_minutes" BETWEEN -840 AND 840);

ALTER TABLE "workout_sets"
  ADD CONSTRAINT "workout_sets_reps_positive" CHECK ("reps" > 0),
  ADD CONSTRAINT "workout_sets_weight_non_negative" CHECK ("weight" >= 0 AND "weight_kg" >= 0),
  ADD CONSTRAINT "workout_sets_set_index_non_negative" CHECK ("set_index" >= 0);
