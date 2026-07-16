# syntax=docker/dockerfile:1
# Production image for apps/server. Build from the repo root:
#   docker build -f apps/server/Dockerfile -t vocab-server .

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /usr/src/app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter server...
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @vocab/shared build && pnpm --filter server build
# --legacy: deploy from the shared lockfile without inject-workspace-packages
RUN pnpm --filter server deploy --legacy --prod /prod/server

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/server /app
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
