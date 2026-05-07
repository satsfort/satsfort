import { useState } from "react";
import "./AccountPage.css";
import { TaskNotifications } from "../components/TaskNotifications";

type BillingCycle = "monthly" | "yearly";

type PlanFeature = { label: string; soon?: boolean };

type Plan = {
    id: "free" | "supporter" | "sponsor";
    name: string;
    tagline: string;
    features: PlanFeature[];
    highlight?: boolean;
    badge?: string;
    cta: string;
    ctaDisabled?: boolean;
};

const PLANS: Plan[] = [
    {
        id: "free",
        name: "Starter",
        tagline: "Everything you need to track your stack",
        features: [
            { label: "Portfolio history and charts" },
            { label: "Transaction history" },
            { label: "Track up to 10 addresses & 2 XPUBs" },
            { label: "XPUB/ZPUB import" },
            { label: "Local encrypted storage" },
            { label: "Export settings and data" },
            { label: "iOS & Android app", soon: true },
        ],
        cta: "Current plan",
        ctaDisabled: true,
    },
    {
        id: "supporter",
        name: "Supporter",
        tagline: "Support development + premium features",
        badge: "Most Popular",
        highlight: true,
        features: [
            { label: "Everything in Starter" },
            { label: "Support development" },
            { label: "Unlimited addresses/XPUBs" },
            { label: "Transaction and address labels", soon: true },
            { label: "Encrypted cloud backup", soon: true },
            { label: "Connect your own node", soon: true },
            { label: "Wallet movement alerts", soon: true },
            { label: "Advanced UTXO analysis", soon: true },
        ],
        cta: "Coming soon",
        ctaDisabled: true,
    },
    {
        id: "sponsor",
        name: "Sponsor",
        tagline: "Become a visible supporter of the project",
        features: [
            { label: "Everything in Supporter" },
            { label: "Your logo on our website" },
            { label: "Your logo in the app's About page" },
            { label: "Your logo in the GitHub README" },
            { label: "Shoutout on social media" },
            { label: "Custom feature requests considered" },
        ],
        cta: "Coming soon",
        ctaDisabled: true,
    },
];

const TRUST_BADGES = ["Open source", "No KYC", "Self-hostable", "No tracking"];

const SUPPORTER_MONTHLY_SATS = 10_000;
const YEARLY_DISCOUNT = 0.2;

function formatSats(n: number): string {
    return n.toLocaleString("en-US");
}

function renderPrice(plan: Plan, cycle: BillingCycle) {
    if (plan.id === "free") {
        return (
            <>
                Free
                <span>Forever</span>
            </>
        );
    }
    if (plan.id === "sponsor") {
        return (
            <>
                Custom
                <span>Tailored to your needs</span>
            </>
        );
    }
    if (cycle === "yearly") {
        const yearly = Math.round(SUPPORTER_MONTHLY_SATS * 12 * (1 - YEARLY_DISCOUNT));
        return (
            <>
                {formatSats(yearly)}
                <span>sats/year</span>
            </>
        );
    }
    return (
        <>
            {formatSats(SUPPORTER_MONTHLY_SATS)}
            <span>sats/month</span>
        </>
    );
}

export function AccountPage() {
    const [cycle, setCycle] = useState<BillingCycle>("monthly");

    return (
        <>
            <header className="page-head">
                <div>
                    <div className="eyebrow">Your plan</div>
                    <h1 className="page-title">Support the project</h1>
                </div>
                <div className="page-actions">
                    <TaskNotifications />
                </div>
            </header>

            <div className="plan-cycle-toggle" role="tablist" aria-label="Billing cycle">
                <button
                    role="tab"
                    aria-selected={cycle === "monthly"}
                    className={cycle === "monthly" ? "active" : ""}
                    onClick={() => setCycle("monthly")}
                >
                    Monthly
                </button>
                <button
                    role="tab"
                    aria-selected={cycle === "yearly"}
                    className={cycle === "yearly" ? "active" : ""}
                    onClick={() => setCycle("yearly")}
                >
                    Yearly
                    <span className="plan-cycle-save">−20%</span>
                </button>
            </div>

            <section className="plan-grid">
                {PLANS.map((plan) => (
                    <div key={plan.id} className={`plan-card ${plan.highlight ? "plan-highlight" : ""}`}>
                        {plan.badge && <div className="plan-badge">{plan.badge}</div>}
                        <div className="plan-head-col">
                            <h3 className="plan-title">{plan.name}</h3>
                            <div className="plan-tagline muted small">{plan.tagline}</div>
                            <div className="plan-price mono">{renderPrice(plan, cycle)}</div>
                        </div>
                        <ul className="plan-list">
                            {plan.features.map((f) => (
                                <li key={f.label}>
                                    {f.label}
                                    {f.soon && <span className="plan-soon">Soon</span>}
                                </li>
                            ))}
                        </ul>
                        <button className={`btn plan-btn ${plan.highlight ? "btn-primary" : ""}`} disabled={plan.ctaDisabled}>
                            {plan.cta}
                        </button>
                    </div>
                ))}
            </section>

            <div className="plan-trust">
                {TRUST_BADGES.map((b) => (
                    <span key={b}>{b}</span>
                ))}
            </div>

            <div className="plan-support-free">
                <div>
                    <h4 className="plan-support-free-title">Support without spending</h4>
                    <p className="muted small">
                        If Sats Fort has been useful to you, we&apos;d be grateful for a star on GitHub, or a recommendation to friends and
                        family who might enjoy it too. Thank you!
                    </p>
                </div>
                <a
                    className="btn plan-support-free-btn"
                    href="https://github.com/satsfort/satsfort"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    ★ Star on GitHub
                </a>
            </div>

            <p className="plan-open-source muted small">
                Sats Fort is free and open source. Upgrading is optional — it helps fund ongoing development.
            </p>
        </>
    );
}
