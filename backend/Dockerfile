# Django API for production (WP 8.6, ADR 0032). Official Python image pinned by digest
# (python:3.14-slim, Python 3.14.10, Docker Hub, checked 2026-11-15). Dependencies come only from
# the lockfile; the app runs as an unprivileged user under Gunicorn.
FROM python:3.14-slim@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/app/.venv PIP_DISABLE_PIP_VERSION_CHECK=1
# uv as pinned in scripts/cloud-setup.sh and .devcontainer/post-create.sh. The optional build
# secret "ca" is only for build environments behind a TLS-inspecting proxy
# (scripts/build-images.sh); it is never stored in the image.
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export PIP_CERT=/run/secrets/ca; fi; \
    pip install --no-cache-dir "uv==0.13.7"
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export SSL_CERT_FILE=/run/secrets/ca; fi; \
    uv sync --frozen --no-dev --no-install-project
COPY . .

FROM python:3.14-slim@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f
RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin app \
    && mkdir -p /data/media && chown app /data/media
WORKDIR /app
COPY --from=build --chown=root:root /app /app
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    DJANGO_MEDIA_ROOT=/data/media
USER app
EXPOSE 8000
# Three sync workers fit 2 vCPU / 4 GB (gunicorn docs: 2 x cores + 1 as a starting point).
# No control socket: the management interface is not needed (and /app is read-only for "app").
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-", "--forwarded-allow-ips", "*", "--no-control-socket"]
