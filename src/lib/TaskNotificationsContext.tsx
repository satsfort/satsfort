import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type TaskStatus = "pending" | "success" | "error";

export type TaskItem = {
    id: string;
    name: string;
    status: TaskStatus;
    startedAt: number;
    endedAt?: number;
    error?: string;
};

export type TaskNotifications = {
    tasks: TaskItem[];
    pendingCount: number;
    track: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
    clearCompleted: () => void;
};

const HISTORY_CAP = 20;

const TaskNotificationsContext = createContext<TaskNotifications | null>(null);

function makeId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Date.now().toString(36).slice(-6)}`;
}

export function TaskNotificationsProvider({ children }: { children: ReactNode }) {
    const [tasks, setTasks] = useState<TaskItem[]>([]);

    const track = useCallback(async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
        const id = makeId();
        const startedAt = Date.now();
        const pending: TaskItem = { id, name, status: "pending", startedAt };
        setTasks((prev) => [pending, ...prev].slice(0, HISTORY_CAP));

        try {
            const result = await fn();
            setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "success", endedAt: Date.now() } : t)));
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "error", endedAt: Date.now(), error: message } : t)));
            throw err;
        }
    }, []);

    const clearCompleted = useCallback(() => {
        setTasks((prev) => prev.filter((t) => t.status === "pending"));
    }, []);

    const pendingCount = useMemo(() => tasks.filter((t) => t.status === "pending").length, [tasks]);

    const value = useMemo<TaskNotifications>(
        () => ({ tasks, pendingCount, track, clearCompleted }),
        [tasks, pendingCount, track, clearCompleted],
    );

    return <TaskNotificationsContext.Provider value={value}>{children}</TaskNotificationsContext.Provider>;
}

export function useTaskNotifications(): TaskNotifications {
    const ctx = useContext(TaskNotificationsContext);
    if (!ctx) throw new Error("useTaskNotifications must be used within TaskNotificationsProvider");
    return ctx;
}
