import { createContext, useContext, useState, type ReactNode } from "react";
import { SettingsRequests } from "../requests/SettingsRequests";

export type FiatCurrency = "USD" | "EUR" | "GBP" | "JPY" | "CAD" | "AUD";

export type Denomination = "BTC" | "SATS";

export type AppSettings = {
    currency: FiatCurrency;
    setCurrency: (c: FiatCurrency) => void;
    denomination: Denomination;
    setDenomination: (d: Denomination) => void;
};

const SettingsContext = createContext<AppSettings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const settingsRequests = new SettingsRequests();

    const [currency, setCurrency] = useState<FiatCurrency>(() => {
        return SettingsRequests.loadSync().currency;
    });
    const [denomination, setDenomination] = useState<Denomination>(() => {
        return SettingsRequests.loadSync().denomination;
    });

    const persistSettings = (nextCurrency: FiatCurrency, nextDenomination: Denomination) => {
        const current = SettingsRequests.loadSync();
        void settingsRequests.save({
            ...current,
            currency: nextCurrency,
            denomination: nextDenomination,
        });
    };

    const handleCurrency = (c: FiatCurrency) => {
        setCurrency(c);
        persistSettings(c, denomination);
    };

    const handleDenomination = (d: Denomination) => {
        setDenomination(d);
        persistSettings(currency, d);
    };

    return (
        <SettingsContext.Provider
            value={{
                currency,
                setCurrency: handleCurrency,
                denomination,
                setDenomination: handleDenomination,
            }}
        >
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings(): AppSettings {
    const ctx = useContext(SettingsContext);
    if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
    return ctx;
}
