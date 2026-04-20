import { useEffect, useRef, useState } from "react";
import "./TaskNotifications.css";
import { useTaskNotifications, type TaskItem } from "../lib/TaskNotificationsContext";
import { AlertIcon, BellIcon, CheckIcon, SpinnerIcon } from "./icons";

function formatRelative(ts: number): string {
    const delta = Math.max(0, Date.now() - ts);
    if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    return `${Math.floor(delta / 3_600_000)}h ago`;
}

function TaskRow({ task }: { task: TaskItem }) {
    const iconClass = `task-status task-status-${task.status}`;
    const icon = task.status === "pending" ? <SpinnerIcon /> : task.status === "success" ? <CheckIcon /> : <AlertIcon />;
    const subtitle =
        task.status === "pending"
            ? "Fetching…"
            : task.status === "error"
              ? (task.error ?? "Failed")
              : `Completed · ${formatRelative(task.endedAt ?? task.startedAt)}`;

    return (
        <li className={`task-row task-row-${task.status}`}>
            <span className={iconClass} aria-hidden>
                {icon}
            </span>
            <div className="task-row-body">
                <div className="task-row-name">{task.name}</div>
                <div className="task-row-sub mono small muted">{subtitle}</div>
            </div>
        </li>
    );
}

export function TaskNotifications() {
    const { tasks, pendingCount, clearCompleted } = useTaskNotifications();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDocClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const hasCompleted = tasks.some((t) => t.status !== "pending");
    const label = pendingCount > 0 ? `Pending tasks: ${pendingCount}` : tasks.length > 0 ? "Task notifications" : "No notifications";

    return (
        <div className="task-notifications" ref={rootRef}>
            <button
                type="button"
                className={`task-bell ${pendingCount > 0 ? "is-pending" : ""}`}
                aria-label={label}
                aria-expanded={open}
                title={label}
                onClick={() => setOpen((v) => !v)}
            >
                <BellIcon />
                {pendingCount > 0 && <span className="task-bell-badge mono">{pendingCount}</span>}
            </button>

            {open && (
                <div className="task-popover" role="dialog" aria-label="Task notifications">
                    <div className="task-popover-head">
                        <div className="eyebrow">Tasks</div>
                        {hasCompleted && (
                            <button type="button" className="link-btn small" onClick={clearCompleted}>
                                Clear history
                            </button>
                        )}
                    </div>
                    {tasks.length === 0 ? (
                        <div className="task-popover-empty mono small muted">No activity yet.</div>
                    ) : (
                        <ul className="task-list">
                            {tasks.map((t) => (
                                <TaskRow key={t.id} task={t} />
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
