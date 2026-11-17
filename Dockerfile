# syntax=docker/dockerfile:1
# rackend homepage: the static site from `astro build`, served by unprivileged nginx.
# The build stage runs on the build host's platform; its output is the same for
# every architecture, so multi-arch images need no emulation.

# --- Build ---
FROM --platform=$BUILDPLATFORM oven/bun:1.4.3 AS build
WORKDIR /src
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# --- Runtime ---
FROM nginxinc/nginx-unprivileged:1.31-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/headers.conf /etc/nginx/snippets/headers.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
