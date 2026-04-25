import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Options, Capabilities } from "@wdio/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tauri loads from `devUrl` when cfg(debug_assertions), which requires the
// vite dev server running. In CI/Docker we want the bundled frontend, so we
// build release and point WDIO at the release binary.
const APPLICATION = path.resolve(__dirname, "src-tauri", "target", "release", "SatsFort");
const TAURI_DRIVER = path.resolve(os.homedir(), ".cargo", "bin", "tauri-driver");

// Holds the tauri-driver child process for the duration of a session so that
// afterSession can terminate it cleanly.
let tauriDriver: ChildProcess | null = null;

// Per-run isolated XDG data dir so the vault (~/.local/share/com.satsfort.app/
// portfolio.db) is fresh for every test invocation.
let tempDataHome: string | null = null;

export const config: Options.Testrunner = {
    runner: "local",

    // Point WDIO at tauri-driver so it proxies the WebDriver session to the
    // platform driver (WebKitWebDriver on Linux) instead of trying to launch
    // a browser of its own.
    hostname: "127.0.0.1",
    port: 4444,

    specs: ["./e2e/**/*.spec.ts"],
    maxInstances: 1,

    capabilities: [
        {
            browserName: "wry",
            "tauri:options": {
                application: APPLICATION,
            },
        },
    ] as unknown as Capabilities.RemoteCapabilities,

    logLevel: "info",
    framework: "mocha",
    reporters: ["spec"],
    mochaOpts: {
        ui: "bdd",
        timeout: 60_000,
    },

    autoCompileOpts: {
        autoCompile: true,
        tsNodeOpts: {
            project: "./tsconfig.wdio.json",
            transpileOnly: true,
        },
    },

    // Give the spawned Tauri binary a fresh data dir so the vault file is
    // recreated per run. tauri-driver and the app inherit this process' env.
    onPrepare: () => {
        tempDataHome = mkdtempSync(path.join(os.tmpdir(), "satsfort-e2e-"));
        process.env.XDG_DATA_HOME = tempDataHome;
    },

    beforeSession: () => {
        tauriDriver = spawn(TAURI_DRIVER, [], {
            stdio: [null, process.stdout, process.stderr],
        });
    },

    afterTest: async (test, _context, { passed }) => {
        if (passed) return;
        const artifactsDir = path.resolve(__dirname, "e2e-artifacts");
        mkdirSync(artifactsDir, { recursive: true });
        const safe = `${test.parent}-${test.title}`.replace(/[^a-z0-9]+/gi, "_").slice(0, 120);
        try {
            // `browser` is injected as a global by the WDIO runner at test time.
            const b = (
                globalThis as { browser?: { saveScreenshot: (p: string) => Promise<unknown>; getPageSource: () => Promise<string> } }
            ).browser;
            if (!b) return;
            await b.saveScreenshot(path.join(artifactsDir, `${safe}.png`));
            const html = await b.getPageSource();
            writeFileSync(path.join(artifactsDir, `${safe}.html`), html);
        } catch (err) {
            console.warn("failed to capture failure artifacts", err);
        }
    },

    afterSession: () => {
        tauriDriver?.kill();
        tauriDriver = null;
    },

    onComplete: () => {
        if (tempDataHome) {
            rmSync(tempDataHome, { recursive: true, force: true });
            tempDataHome = null;
        }
    },
};
