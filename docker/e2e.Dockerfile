# Toolchain image for running the Tauri WebdriverIO suite on macOS via Docker.
# tauri-driver is Linux-only upstream, so this container provides the same
# environment the CI `e2e` job runs in. The project is bind-mounted at
# runtime; this image just bakes in the heavy system and Rust toolchain
# dependencies so repeat runs are fast.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
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
        patchelf \
        webkit2gtk-driver \
        xvfb \
        xauth \
    && rm -rf /var/lib/apt/lists/*

# Node 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Rust (minimal profile — we only need cargo/rustc/rust-std)
ENV CARGO_HOME=/root/.cargo \
    RUSTUP_HOME=/root/.rustup \
    PATH=/root/.cargo/bin:$PATH
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain stable --profile minimal

# Pre-install tauri-driver so every `docker run` reuses the cached binary.
RUN cargo install tauri-driver --locked

WORKDIR /app

# The project is bind-mounted at /app. node_modules + src-tauri/target are
# expected to be named volumes so that Linux-native builds don't collide with
# the host's macOS builds.
CMD ["bash", "-lc", "set -e; npm ci; npm run test:e2e:build; xvfb-run --auto-servernum npx wdio run ./wdio.conf.ts"]
