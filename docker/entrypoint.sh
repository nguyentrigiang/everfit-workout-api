#!/bin/sh
# Apply pending migrations, then start the app (exec so the app receives signals as PID 1).
set -e
npx prisma migrate deploy
exec node dist/main.js
