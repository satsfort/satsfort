# Multi-stage build for the headless server edition of Sats Fort.
# The desktop Tauri build is not produced here; this image only ships the
# `satsfort-server` binary plus the built React frontend, intended for
# self-hosted marketplaces (Umbrel, Start9, plain Docker, etc.).

# ---------------------------------------------------------------------------
# Stage 1 — build the React frontend.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS frontend

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

RUN npm run build


# ---------------------------------------------------------------------------
# Stage 2 — build the Rust server binary.
#
# We still pull the Tauri crates because the project is a single Cargo package
# and the server binary lives alongside the desktop binary in the same crate.
# Cargo links unused symbols out at release-strip time, but compilation still
# needs the system libs Tauri's `wry` references.
# ---------------------------------------------------------------------------
FROM rust:1.95-bookworm AS server

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        cmake \
        perl \
        pkg-config \
        libglib2.0-dev \
        libgtk-3-dev \
        librsvg2-dev \
        libsoup-3.0-dev \
        libwebkit2gtk-4.1-dev \
        libayatana-appindicator3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY src-tauri ./src-tauri

WORKDIR /build/src-tauri
RUN cargo build --release --bin satsfort-server \
    && strip target/release/satsfort-server


# ---------------------------------------------------------------------------
# Stage 3 — slim runtime image.
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        tini \
        libgtk-3-0 \
        libwebkit2gtk-4.1-0 \
        libsoup-3.0-0 \
        librsvg2-2 \
        libayatana-appindicator3-1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /usr/sbin/nologin --uid 10001 satsfort \
    && mkdir -p /data /app/dist \
    && chown -R satsfort:satsfort /data /app

WORKDIR /app

COPY --from=server  /build/src-tauri/target/release/satsfort-server /usr/local/bin/satsfort-server
COPY --from=frontend /app/dist /app/dist

ENV SATSFORT_PORT=8080 \
    SATSFORT_DATA_DIR=/data \
    SATSFORT_STATIC_DIR=/app/dist \
    SATSFORT_LOG=info

USER satsfort
EXPOSE 8080
VOLUME ["/data"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["satsfort-server"]
