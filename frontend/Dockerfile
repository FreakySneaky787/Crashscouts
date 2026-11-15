# React Router SSR server for production (WP 8.6, ADR 0032). Official Node image pinned by digest
# (node:22-slim, Node 22.23.5, Docker Hub, checked 2026-11-15). The public host is needed at build
# time for React Router's action origin check (question P).
FROM node:22-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS build
ARG ALLOWED_ACTION_ORIGINS
ENV ALLOWED_ACTION_ORIGINS=${ALLOWED_ACTION_ORIGINS}
# pnpm as pinned in scripts/cloud-setup.sh and .devcontainer/post-create.sh. The optional build
# secret "ca" is only for build environments behind a TLS-inspecting proxy
# (scripts/build-images.sh); it is never stored in the image.
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm install --global --silent "pnpm@10.34.9"
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:22-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee
WORKDIR /app
COPY --from=build --chown=root:root /app/package.json ./package.json
COPY --from=build --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/build ./build
COPY --from=build --chown=root:root /app/public ./public
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
CMD ["node_modules/.bin/react-router-serve", "./build/server/index.js"]
