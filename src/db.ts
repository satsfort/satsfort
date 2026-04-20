import { invoke } from "@tauri-apps/api/core";

export type DatabaseValue = string | number | boolean | null;
export type DatabaseRow = Record<string, unknown>;

export async function unlockDb(password: string): Promise<void> {
    await invoke("unlock_db", { password });
}

export async function lockDb(): Promise<void> {
    await invoke("lock_db");
}

export async function dbExecute(query: string, values: DatabaseValue[] = []): Promise<number> {
    return invoke<number>("db_execute", { query, values });
}

export async function dbSelect<T = DatabaseRow>(query: string, values: DatabaseValue[] = []): Promise<T[]> {
    return invoke<T[]>("db_select", { query, values });
}

