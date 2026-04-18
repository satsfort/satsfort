import { createContext, useContext, useState, type ReactNode } from "react";

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
  const [currency, setCurrency] = useState<FiatCurrency>(() => {
    return (localStorage.getItem("sats-fort-currency") as FiatCurrency) || "USD";
  });
  const [denomination, setDenomination] = useState<Denomination>(() => {
    return (localStorage.getItem("sats-fort-denomination") as Denomination) || "BTC";
  });

  const handleCurrency = (c: FiatCurrency) => {
    setCurrency(c);
    localStorage.setItem("sats-fort-currency", c);
  };

  const handleDenomination = (d: Denomination) => {
    setDenomination(d);
    localStorage.setItem("sats-fort-denomination", d);
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

