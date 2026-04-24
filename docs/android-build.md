# Building for Android

This project depends on SQLCipher (via `libsqlite3-sys` with the `bundled-sqlcipher-vendored-openssl` feature). When cross-compiling for Android, Cargo builds OpenSSL from source against the Android NDK toolchain, which exposes two issues that need one-time fixes on macOS hosts.

## Prerequisites

- Android SDK + NDK installed (e.g. via Android Studio)
- Rust targets added:
    ```bash
    rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
    ```
- `ANDROID_NDK_HOME` (or `ANDROID_NDK_ROOT`) pointing at your NDK. This is for Mac:
    ```bash
    export ANDROID_NDK_HOME=$HOME/Library/Android/sdk/ndk/<version>
    ```

## Alternativce to settings the paths permanently

You can run a variation (this works on Mac) of this every time before running the Anndroid build:

```bash
export ANDROID_NDK_HOME=/Users/<username>/Library/Android/sdk/ndk/30.0.14904198
export PATH="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64/bin:$PATH"
```

## Common failures

### 1. `aarch64-linux-android-ranlib: command not found`

Full symptom:

```
/bin/sh: aarch64-linux-android-ranlib: command not found
make: *** [install_dev] Error 127
Error installing OpenSSL: 'make' reported failure with exit status: 2
```

**Cause:** NDK r23+ removed the per-target GNU binutils wrappers (`aarch64-linux-android-ar`, `-ranlib`, etc.). Only the unified `llvm-ar`, `llvm-ranlib`, ... remain. OpenSSL's Makefile still invokes tools by the target-prefixed names.

**Fix:** create symlinks inside the NDK bin directory so the expected names resolve to the LLVM versions.

```bash
NDK_BIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64/bin"
# On Linux hosts, replace darwin-x86_64 with linux-x86_64.

cd "$NDK_BIN"
for prefix in aarch64-linux-android arm-linux-androideabi armv7a-linux-androideabi i686-linux-android x86_64-linux-android; do
  for tool in ar ranlib strip nm; do
    ln -sf llvm-$tool $prefix-$tool
  done
done
```

These symlinks are inside the NDK directory, so upgrading or reinstalling the NDK will wipe them — rerun the loop if you bump versions.

### 2. NDK bin not on `PATH`

Even with the symlinks in place, the build fails with the same `command not found` error unless the NDK bin directory is on `PATH`. OpenSSL's Makefile calls `ranlib` by unqualified name through `/bin/sh`, which relies on `PATH`.

**Fix:** add the NDK bin to `PATH` before invoking the build (and ideally to your shell rc):

```bash
export PATH="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/darwin-x86_64/bin:$PATH"
```

Verify:

```bash
which aarch64-linux-android-ranlib
# should print a path inside $ANDROID_NDK_HOME
```

If you launch the build from an IDE/GUI (Android Studio, VS Code opened from the Dock) rather than a shell, the exports in your `~/.zshrc` may not be picked up. Either launch the editor from a terminal that has sourced them, or configure the env vars in the IDE itself.

## Building

Once the prerequisites above are set:

```bash
pnpm tauri android dev     # debug build, live reload
pnpm tauri android build   # release build
```

The first build takes several minutes because OpenSSL and SQLCipher are compiled from source per ABI. Subsequent builds are cached.
