import { invoke } from "@tauri-apps/api/core";
import { Config } from "./lib/Config";

export type DatabaseValue = string | number | boolean | null;
export type DatabaseRow = Record<string, unknown>;
export type VaultStatus = {
    database_exists: boolean;
};

export async function unlockDb(password: string): Promise<void> {
    if (Config.useMockData) return;
    await invoke("unlock_db", { password });
}

export async function lockDb(): Promise<void> {
    if (Config.useMockData) return;
    await invoke("lock_db");
}

export async function getVaultStatus(): Promise<VaultStatus> {
    if (Config.useMockData) return { database_exists: true };
    return invoke<VaultStatus>("get_vault_status");
}

export async function changeVaultPassword(currentPassword: string, newPassword: string): Promise<void> {
    if (Config.useMockData) return;
    await invoke("change_vault_password", { currentPassword, newPassword });
}

export async function wipeLocalData(): Promise<void> {
    if (Config.useMockData) return;
    await invoke("wipe_local_data");
}

export async function dbExecute(query: string, values: DatabaseValue[] = []): Promise<number> {
    if (Config.useMockData) return 0;
    return invoke<number>("db_execute", { query, values });
}

export async function dbSelect<T = DatabaseRow>(query: string, values: DatabaseValue[] = []): Promise<T[]> {
    if (Config.useMockData) return [];
    return invoke<T[]>("db_select", { query, values });
}
