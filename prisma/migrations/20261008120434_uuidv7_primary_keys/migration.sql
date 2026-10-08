-- AlterTable
ALTER TABLE "exercises" ALTER COLUMN "id" SET DEFAULT uuidv7();

-- AlterTable
ALTER TABLE "workout_entries" ALTER COLUMN "id" SET DEFAULT uuidv7();

-- AlterTable
ALTER TABLE "workout_sets" ALTER COLUMN "id" SET DEFAULT uuidv7();
