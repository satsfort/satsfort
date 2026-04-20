import type { ReactNode } from "react";
import "./BottomNav.css";
import type { Route } from "./Sidebar";
import { AddressIcon, ChartIcon, SettingsIcon, UserIcon } from "./icons";

type Item = { id: Route; label: string; icon: ReactNode };

const ITEMS: Item[] = [
    { id: "portfolio", label: "Portfolio", icon: <ChartIcon size={20} /> },
    { id: "addresses", label: "Addresses", icon: <AddressIcon size={20} /> },
    { id: "settings", label: "Settings", icon: <SettingsIcon size={20} /> },
    { id: "account", label: "Account", icon: <UserIcon size={20} /> },
];

type Props = {
    route: Route;
    onNavigate: (r: Route) => void;
};

export function BottomNav({ route, onNavigate }: Props) {
    return (
        <nav className="bottom-nav" role="tablist" aria-label="Primary">
            {ITEMS.map((item) => {
                const active = route === item.id;
                return (
                    <button
                        key={item.id}
                        role="tab"
                        aria-selected={active}
                        className={`bottom-nav-item ${active ? "active" : ""}`}
                        onClick={() => onNavigate(item.id)}
                    >
                        <span className="bottom-nav-icon">{item.icon}</span>
                        <span className="bottom-nav-label">{item.label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
