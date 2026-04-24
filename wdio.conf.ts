import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APPLICATION = path.resolve(__dirname, "src-tauri", "target", "debug", "SatsFort");
const TAURI_DRIVER = path.resolve(os.homedir(), ".cargo", "bin", "tauri-driver");

// Holds the tauri-driver child process for the duration of a session so that
// afterSession can terminate it cleanly.
let tauriDriver: ChildProcess | null = null;

// Per-run isolated XDG data dir so the vault (~/.local/share/com.satsfort.app/
// portfolio.db) is fresh for every test invocation.
let tempDataHome: string | null = null;

export const config: WebdriverIO.Config = {
    runner: "local",
    tsConfigPath: "./tsconfig.wdio.json",

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
            // tauri-driver proxies to the underlying platform WebDriver; on
            // Linux this is WebKitWebDriver (package: webkit2gtk-driver).
        } as unknown as WebdriverIO.Capabilities,
    ],

    logLevel: "info",
    framework: "mocha",
    reporters: ["spec"],
    mochaOpts: {
        ui: "bdd",
        timeout: 60_000,
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
