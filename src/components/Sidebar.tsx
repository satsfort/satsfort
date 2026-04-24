import {
    AddressIcon,
    BellIcon,
    ChartIcon,
    ChevronLeft,
    ChevronRight,
    SettingsIcon,
    TransactionsIcon,
    UserIcon,
    UtxoIcon,
} from "./icons";
import "./Sidebar.css";
import type { ReactNode } from "react";
import logo from "../img/128x128.png";

export type Route = "portfolio" | "addresses" | "settings" | "account";

type NavItem = { id: Route; label: string; icon: ReactNode };
type ComingSoonItem = { id: string; label: string; icon: ReactNode };

const ITEMS: NavItem[] = [
    { id: "portfolio", label: "Portfolio", icon: <ChartIcon /> },
    { id: "addresses", label: "Addresses", icon: <AddressIcon /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon /> },
    { id: "account", label: "Account", icon: <UserIcon /> },
];

const COMING_SOON: ComingSoonItem[] = [
    { id: "transactions", label: "Transactions", icon: <TransactionsIcon /> },
    { id: "utxo", label: "UTXO Management", icon: <UtxoIcon /> },
    { id: "alerts", label: "Alerts", icon: <BellIcon /> },
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
                    <img src={logo} alt="Sats Fort" />
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

                {COMING_SOON.map((item) => (
                    <button
                        key={item.id}
                        className="sidebar-item is-coming-soon"
                        disabled
                        aria-disabled="true"
                        title={collapsed ? `${item.label} — coming soon` : "Coming soon"}
                    >
                        <span className="sidebar-icon">{item.icon}</span>
                        {!collapsed && (
                            <>
                                <span className="sidebar-label">{item.label}</span>
                                <span className="sidebar-badge">Soon</span>
                            </>
                        )}
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
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
