import { useEffect, useState } from "react";
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
import { PortfolioHistoryRequests } from "./requests/PortfolioHistoryRequests";
import type { Unit } from "./lib/format";
import { lockDb } from "./db";

function App() {
    const portfolioHistoryRequests = new PortfolioHistoryRequests();

    const [user, setUser] = useState<string | null>(null);
    const [route, setRoute] = useState<Route>("portfolio");
    const [collapsed, setCollapsed] = useState(false);
    const [unit, setUnit] = useState<Unit>("BTC");
    const [balancesHidden, setBalancesHidden] = useState(false);
    const toggleBalances = () => setBalancesHidden((h) => !h);

    useEffect(() => {
        if (!user) return;
        void portfolioHistoryRequests
            .ensureBaseline()
            .catch((err) => console.error("Failed to seed portfolio baseline", err));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    if (!user) {
        return <LoginPage onLogin={setUser} />;
    }

    const handleLogout = () => {
        void (async () => {
            try {
                await lockDb();
            } catch (lockError) {
                console.error("Failed to lock database", lockError);
            }

            setUser(null);
            setRoute("portfolio");
        })();
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
                                    onNavigate={setRoute}
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
                            {route === "settings" && <SettingsPage username={user} onLogout={handleLogout} />}
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
