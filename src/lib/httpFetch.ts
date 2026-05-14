import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const inBrowser = typeof window !== "undefined" && !inTauri;
const PROXY_BASE = "/api/proxy";

/**
 * Cross-origin-safe fetch for third-party APIs.
 *
 * Inside the Tauri desktop app the request goes through `tauri-plugin-http`,
 * which runs on the Rust side and bypasses browser CORS. In a real browser
 * tab (Docker/server build) the URL is rewritten to `/api/proxy?url=...` so
 * the bundled Rust HTTP server forwards the request, again sidestepping CORS.
 * In Node tests neither path applies — calls go straight to `globalThis.fetch`
 * so test stubs see the raw third-party URL.
 */
export function httpFetch(url: string, init?: RequestInit): Promise<Response> {
    if (inTauri) {
        return (tauriFetch as unknown as typeof fetch)(url, init);
    }
    if (inBrowser) {
        const proxyUrl = `${PROXY_BASE}?url=${encodeURIComponent(url)}`;
        return globalThis.fetch(proxyUrl, init);
    }
    return globalThis.fetch(url, init);
}
