import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const PROXY_BASE = "/api/proxy";

/**
 * Cross-origin-safe fetch for third-party APIs.
 *
 * Inside the Tauri desktop app the request goes through `tauri-plugin-http`,
 * which runs on the Rust side and bypasses browser CORS. When running in a
 * plain browser (e.g. the Docker/server build), the URL is rewritten to
 * `/api/proxy?url=...` so the bundled Rust HTTP server forwards the request,
 * again sidestepping CORS.
 */
export function httpFetch(url: string, init?: RequestInit): Promise<Response> {
    if (inTauri) {
        return (tauriFetch as unknown as typeof fetch)(url, init);
    }
    const proxyUrl = `${PROXY_BASE}?url=${encodeURIComponent(url)}`;
    return globalThis.fetch(proxyUrl, init);
}
