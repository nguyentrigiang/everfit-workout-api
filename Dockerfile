# Build stage: install all deps (incl. dev), generate the Prisma client and compile TypeScript
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: production deps, compiled output, and what `prisma migrate deploy` needs
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY docker/entrypoint.sh ./docker/entrypoint.sh
USER node
EXPOSE 3000
CMD ["./docker/entrypoint.sh"]
