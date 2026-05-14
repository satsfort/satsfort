import { invoke } from "@tauri-apps/api/core";
import { Config } from "./lib/Config";

export type DatabaseValue = string | number | boolean | null;
export type DatabaseRow = Record<string, unknown>;
export type VaultStatus = {
    database_exists: boolean;
};

// When running in a normal browser tab (Docker self-host), call the HTTP API.
// In Tauri's webview the IPC `invoke()` path is preferred. Node test env has
// no `window`, so it also takes the invoke path and picks up the mock for
// `@tauri-apps/api/core`.
const useHttpApi = typeof window !== "undefined" && !("__TAURI_INTERNALS__" in window);
const API_BASE = "/api";

type HttpMethod = "GET" | "POST";

async function httpCall<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method };
    if (body !== undefined) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(body);
    }
    const response = await fetch(`${API_BASE}${path}`, init);
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `${path} failed with status ${response.status}`);
    }
    if (response.status === 204) {
        return undefined as T;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
        return undefined as T;
    }
    return (await response.json()) as T;
}

export async function unlockDb(password: string): Promise<void> {
    if (Config.useMockData) return;
    if (useHttpApi) {
        await httpCall<void>("POST", "/unlock-db", { password });
        return;
    }
    await invoke("unlock_db", { password });
}

export async function lockDb(): Promise<void> {
    if (Config.useMockData) return;
    if (useHttpApi) {
        await httpCall<void>("POST", "/lock-db");
        return;
    }
    await invoke("lock_db");
}

export async function getVaultStatus(): Promise<VaultStatus> {
    if (Config.useMockData) return { database_exists: true };
    if (useHttpApi) {
        return httpCall<VaultStatus>("GET", "/vault-status");
    }
    return invoke<VaultStatus>("get_vault_status");
}

export async function changeVaultPassword(currentPassword: string, newPassword: string): Promise<void> {
    if (Config.useMockData) return;
    if (useHttpApi) {
        await httpCall<void>("POST", "/change-vault-password", { currentPassword, newPassword });
        return;
    }
    await invoke("change_vault_password", { currentPassword, newPassword });
}

export async function wipeLocalData(): Promise<void> {
    if (Config.useMockData) return;
    if (useHttpApi) {
        await httpCall<void>("POST", "/wipe-local-data");
        return;
    }
    await invoke("wipe_local_data");
}

export async function dbExecute(query: string, values: DatabaseValue[] = []): Promise<number> {
    if (Config.useMockData) return 0;
    if (useHttpApi) {
        return httpCall<number>("POST", "/db-execute", { query, values });
    }
    return invoke<number>("db_execute", { query, values });
}

export async function dbSelect<T = DatabaseRow>(query: string, values: DatabaseValue[] = []): Promise<T[]> {
    if (Config.useMockData) return [];
    if (useHttpApi) {
        return httpCall<T[]>("POST", "/db-select", { query, values });
    }
    return invoke<T[]>("db_select", { query, values });
}
