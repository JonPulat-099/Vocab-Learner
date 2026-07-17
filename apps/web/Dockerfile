# syntax=docker/dockerfile:1
# Production image for apps/web (static Vite build served by nginx).
# Build from the repo root:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://... -t vocab-web .

FROM node:22-slim AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /usr/src/app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter web...
COPY packages/shared packages/shared
COPY apps/web apps/web
# VITE_* values are baked into the bundle at build time (public, non-secret).
ARG VITE_API_URL
ARG VITE_TG_BOT_USERNAME
ARG VITE_YOUGLISH_LANG=english
ENV VITE_API_URL=$VITE_API_URL \
    VITE_TG_BOT_USERNAME=$VITE_TG_BOT_USERNAME \
    VITE_YOUGLISH_LANG=$VITE_YOUGLISH_LANG
RUN pnpm --filter @vocab/shared build && pnpm --filter web build

FROM nginx:1.29-alpine AS runtime
# The official entrypoint envsubsts templates → PORT comes from the platform.
ENV PORT=8080
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /usr/src/app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
