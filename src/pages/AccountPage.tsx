import "./AccountPage.css";
import { TaskNotifications } from "../components/TaskNotifications";

type Props = {
    onLogout: () => void;
};

type Plan = {
    id: "free" | "supporter" | "sponsor";
    name: string;
    tagline: string;
    price: string;
    priceSuffix?: string;
    features: string[];
    highlight?: boolean;
    badge?: string;
    cta: string;
    ctaDisabled?: boolean;
};

const PLANS: Plan[] = [
    {
        id: "free",
        name: "Free Forever",
        tagline: "Everything you need to track your stack",
        price: "Free",
        features: [
            "Up to 10 addresses/XPUBs",
            "XPUB/ZPUB import",
            "UTXO management",
            "Local encrypted storage",
            "Basic labels",
            "Export to CSV",
        ],
        cta: "Current plan",
        ctaDisabled: true,
    },
    {
        id: "supporter",
        name: "Supporter",
        tagline: "Support development + premium features",
        price: "10,000",
        priceSuffix: "sats/month",
        badge: "Most Popular",
        highlight: true,
        features: [
            "Everything in Free",
            "Unlimited addresses/XPUBs",
            "Connect your own node",
            "Encrypted cloud backup",
            "Mobile app (iOS & Android)",
            "Wallet movement alerts",
            "Advanced UTXO analysis",
            "Fee estimation alerts",
            "Multi-device sync",
        ],
        cta: "Coming soon",
        ctaDisabled: true,
    },
    {
        id: "sponsor",
        name: "Sponsor",
        tagline: "Become a visible supporter of the project",
        price: "Custom",
        priceSuffix: "Tailored to your needs",
        features: [
            "Everything in Supporter",
            "Your logo on our website",
            "Your logo in the app's About page",
            "Your logo in the GitHub README",
            "Shoutout on social media",
            "Custom feature requests considered",
        ],
        cta: "Coming soon",
        ctaDisabled: true,
    },
];

export function AccountPage({ onLogout }: Props) {
    return (
        <>
            <header className="page-head">
                <div>
                    <div className="eyebrow">Your plan</div>
                    <h1 className="page-title">Support the project</h1>
                </div>
                <div className="page-actions">
                    <button className="btn btn-danger" onClick={onLogout}>
                        Log Out
                    </button>
                    <TaskNotifications />
                </div>
            </header>

            <div className="plan-current-banner">
                <span className="muted small">You're currently on</span>
                <span className="tx-tag buy">Free</span>
            </div>

            <section className="plan-grid">
                {PLANS.map((plan) => (
                    <div key={plan.id} className={`plan-card ${plan.highlight ? "plan-highlight" : ""}`}>
                        {plan.badge && <div className="plan-badge">{plan.badge}</div>}
                        <div className="plan-head-col">
                            <h3 className="plan-title">{plan.name}</h3>
                            <div className="plan-tagline muted small">{plan.tagline}</div>
                            <div className="plan-price mono">
                                {plan.price}
                                {plan.priceSuffix && <span> {plan.priceSuffix}</span>}
                            </div>
                        </div>
                        <ul className="plan-list">
                            {plan.features.map((f) => (
                                <li key={f}>{f}</li>
                            ))}
                        </ul>
                        <button className={`btn plan-btn ${plan.highlight ? "btn-primary" : ""}`} disabled={plan.ctaDisabled}>
                            {plan.cta}
                        </button>
                    </div>
                ))}
            </section>

            <p className="plan-open-source muted small">
                Sats Fort is free and open source. Upgrading is optional — it helps fund ongoing development.
            </p>
        </>
    );
}
