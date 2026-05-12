import { createContext, useContext, type ReactNode } from "react";

export type PremiumLimits = {
    maxAddresses: number;
    maxXpubs: number;
};

export type PremiumState = {
    isPremium: boolean;
    limits: PremiumLimits;
};

const FREE_LIMITS: PremiumLimits = {
    maxAddresses: 10,
    maxXpubs: 2,
};

// Placeholder: premium gating is wired in but no billing/auth backend exists
// yet. Always returns false so every user is on the free tier; flip the value
// once a real subscription check lands.
const DEFAULT_STATE: PremiumState = {
    isPremium: false,
    limits: FREE_LIMITS,
};

const PremiumContext = createContext<PremiumState>(DEFAULT_STATE);

export function PremiumProvider({ children }: { children: ReactNode }) {
    return <PremiumContext.Provider value={DEFAULT_STATE}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumState {
    return useContext(PremiumContext);
}
