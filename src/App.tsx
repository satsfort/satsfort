import { useState } from "react";
import "./App.css";
import { Sidebar } from "./components/Sidebar";
import type { Route } from "./components/Sidebar";
import { BottomNav } from "./components/BottomNav";
import { PortfolioPage } from "./pages/PortfolioPage";
import { AddressesPage } from "./pages/AddressesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AccountPage } from "./pages/AccountPage";
import { LoginPage } from "./pages/LoginPage";
import { SettingsProvider } from "./lib/SettingsContext";
import { TaskNotificationsProvider } from "./lib/TaskNotificationsContext";
import { TaskNotifications } from "./components/TaskNotifications";
import type { Unit } from "./lib/format";

function App() {
    const [user, setUser] = useState<string | null>(null);
    const [route, setRoute] = useState<Route>("portfolio");
    const [collapsed, setCollapsed] = useState(false);
    const [unit, setUnit] = useState<Unit>("BTC");
    const [balancesHidden, setBalancesHidden] = useState(false);
    const toggleBalances = () => setBalancesHidden((h) => !h);

    if (!user) {
        return <LoginPage onLogin={setUser} />;
    }

    const handleLogout = () => {
        setUser(null);
        setRoute("portfolio");
    };

    return (
        <SettingsProvider>
            <TaskNotificationsProvider>
                <div className={`layout ${collapsed ? "is-collapsed" : ""}`}>
                    <Sidebar route={route} onNavigate={setRoute} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
                    <main className="content">
                        <div className="content-inner">
                            {route === "portfolio" && (
                                <PortfolioPage
                                    unit={unit}
                                    setUnit={setUnit}
                                    balancesHidden={balancesHidden}
                                    onToggleBalances={toggleBalances}
                                />
                            )}
                            {route === "addresses" && (
                                <AddressesPage
                                    unit={unit}
                                    setUnit={setUnit}
                                    balancesHidden={balancesHidden}
                                    onToggleBalances={toggleBalances}
                                />
                            )}
                            {route === "settings" && <SettingsPage />}
                            {route === "account" && <AccountPage username={user} onLogout={handleLogout} />}
                        </div>
                    </main>
                    <BottomNav route={route} onNavigate={setRoute} />
                    <TaskNotifications />
                </div>
            </TaskNotificationsProvider>
        </SettingsProvider>
    );
}

export default App;
