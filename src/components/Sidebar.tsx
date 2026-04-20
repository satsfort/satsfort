import { AddressIcon, ChartIcon, ChevronLeft, ChevronRight, SettingsIcon, UserIcon } from "./icons";
import type { ReactNode } from "react";

export type Route = "portfolio" | "addresses" | "settings" | "account";

type NavItem = { id: Route; label: string; icon: ReactNode };

const ITEMS: NavItem[] = [
    { id: "portfolio", label: "Portfolio", icon: <ChartIcon /> },
    { id: "addresses", label: "Addresses", icon: <AddressIcon /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon /> },
    { id: "account", label: "Account", icon: <UserIcon /> },
];

type Props = {
    route: Route;
    onNavigate: (r: Route) => void;
    collapsed: boolean;
    onToggle: () => void;
};

export function Sidebar({ route, onNavigate, collapsed, onToggle }: Props) {
    return (
        <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`}>
            <div className="sidebar-brand">
                <div className="brand-mark">
                    <span>₿</span>
                </div>
                {!collapsed && <div className="brand-name">SATS&nbsp;FORT</div>}
            </div>

            <nav className="sidebar-nav">
                {ITEMS.map((item) => (
                    <button
                        key={item.id}
                        className={`sidebar-item ${route === item.id ? "active" : ""}`}
                        onClick={() => onNavigate(item.id)}
                        title={collapsed ? item.label : undefined}
                        aria-current={route === item.id ? "page" : undefined}
                    >
                        <span className="sidebar-icon">{item.icon}</span>
                        {!collapsed && <span className="sidebar-label">{item.label}</span>}
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                {!collapsed && (
                    <div className="sidebar-meta">
                        <div className="eyebrow">Node</div>
                        <div className="mono small">
                            <span className="node-dot" /> Local Core · synced
                        </div>
                    </div>
                )}
                <button
                    className="sidebar-toggle"
                    onClick={onToggle}
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    title={collapsed ? "Expand" : "Collapse"}
                >
                    {collapsed ? <ChevronRight /> : <ChevronLeft />}
                </button>
            </div>
        </aside>
    );
}
