#!/bin/sh
# Apply pending migrations, seed the exercise catalog (insert-only), then start the app (exec so the app receives signals as PID 1).
set -e
npx prisma migrate deploy
node dist/database/seed/main.js
exec node dist/main.js
