import { useMemo, useState } from "react";
import "./PortfolioChart.css";
import type { HistoryPoint } from "../services/model/HistoryPoint";
import type { Unit } from "../lib/format";
import { formatAmount, formatAxis, formatSecondary } from "../lib/format";
import { useSettings } from "../lib/SettingsContext";

type Range = "1W" | "1M" | "3M" | "1Y" | "4Y" | "ALL";

const RANGE_DAYS: Record<Range, number | "all"> = {
    "1W": 7,
    "1M": 30,
    "3M": 91,
    "1Y": 365,
    "4Y": 1460,
    ALL: "all",
};

const DAY_MS = 86_400_000;
const W = 880;
const H = 300;
const PAD = { top: 20, right: 20, bottom: 36, left: 56 };

type Props = {
    history: HistoryPoint[];
    priceUsd: number;
    unit: Unit;
};

function dateMs(iso: string) {
    return new Date(iso + "T00:00:00Z").getTime();
}

export function PortfolioChart({ history, priceUsd, unit }: Props) {
    const [range, setRange] = useState<Range>("1M");
    const [hover, setHover] = useState<number | null>(null);
    const { currency, denomination } = useSettings();

    const { points, domain } = useMemo(() => {
        if (history.length === 0) return { points: [] as HistoryPoint[], domain: null };
        const latestMs = dateMs(history[history.length - 1].date);
        const span = RANGE_DAYS[range];
        const startMs = span === "all" ? dateMs(history[0].date) : latestMs - span * DAY_MS;
        const visible = span === "all" ? history : history.filter((p) => dateMs(p.date) >= startMs);
        return { points: visible, domain: { start: startMs, end: latestMs } };
    }, [history, range]);

    const maxBtc = Math.max(...points.map((p) => p.btc), 0.01);
    const minBtc = 0;

    const plotLeft = PAD.left;
    const plotWidth = W - PAD.left - PAD.right;

    const xAt = (iso: string) => {
        if (!domain) return plotLeft;
        const span = Math.max(domain.end - domain.start, 1);
        const ratio = (dateMs(iso) - domain.start) / span;
        return plotLeft + ratio * plotWidth;
    };
    const yAt = (btc: number) => PAD.top + (1 - (btc - minBtc) / (maxBtc - minBtc)) * (H - PAD.top - PAD.bottom);

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(p.date).toFixed(2)},${yAt(p.btc).toFixed(2)}`).join(" ");

    const areaPath =
        points.length > 0
            ? `${linePath} L${xAt(points[points.length - 1].date).toFixed(2)},${yAt(0).toFixed(2)} L${xAt(points[0].date).toFixed(2)},${yAt(0).toFixed(2)} Z`
            : "";

    const yTicks = 4;
    const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => minBtc + (i * (maxBtc - minBtc)) / yTicks);

    const xTickCount = 6;
    const xTickDates = useMemo(() => {
        if (!domain) return [] as string[];
        const span = domain.end - domain.start;
        return Array.from({ length: xTickCount }, (_, i) => {
            const t = domain.start + (i * span) / (xTickCount - 1);
            return new Date(t).toISOString().slice(0, 10);
        });
    }, [domain]);

    const spanDays = domain ? (domain.end - domain.start) / DAY_MS : 0;
    const tickStyle: "day" | "year" = spanDays <= 120 ? "day" : "year";

    const hovered = hover !== null ? points[hover] : null;

    const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!domain || points.length === 0) return;
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * W;
        let nearest = 0;
        let bestDist = Infinity;
        for (let i = 0; i < points.length; i++) {
            const dist = Math.abs(xAt(points[i].date) - x);
            if (dist < bestDist) {
                bestDist = dist;
                nearest = i;
            }
        }
        setHover(nearest);
    };

    return (
        <div className="chart-card">
            <div className="chart-head">
                <div>
                    <div className="muted small">{hovered ? formatDate(hovered.date) : "Last 4 years"}</div>
                    <div className="chart-value">
                        {formatAmount((hovered ?? points[points.length - 1]).btc, unit, priceUsd, {
                            btcDigits: 8,
                            fiat: currency,
                            denom: denomination,
                        })}
                    </div>
                    <div className="muted small mono">
                        {formatSecondary((hovered ?? points[points.length - 1]).btc, unit, priceUsd, currency, denomination)}
                    </div>
                </div>
                <div className="range-group">
                    {(Object.keys(RANGE_DAYS) as Range[]).map((r) => (
                        <button key={r} className={`range-btn ${range === r ? "active" : ""}`} onClick={() => setRange(r)}>
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="chart-svg"
                preserveAspectRatio="none"
                onMouseMove={onMove}
                onMouseLeave={() => setHover(null)}
            >
                <defs>
                    <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F7931A" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="#F7931A" stopOpacity="0" />
                    </linearGradient>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {tickValues.map((v, i) => {
                    const y = yAt(v);
                    return (
                        <g key={`yt-${i}`}>
                            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" />
                            <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="axis-label">
                                {formatAxis(v, unit, priceUsd, currency, denomination)}
                            </text>
                        </g>
                    );
                })}

                {xTickDates.map((iso, i) => (
                    <text key={`xt-${i}`} x={xAt(iso)} y={H - PAD.bottom + 20} textAnchor="middle" className="axis-label">
                        {formatTick(iso, tickStyle)}
                    </text>
                ))}

                <path d={areaPath} fill="url(#areaFill)" />
                <path d={linePath} fill="none" stroke="#F7931A" strokeWidth="2" filter="url(#glow)" />

                {hover !== null && points[hover] && (
                    <g>
                        <line
                            x1={xAt(points[hover].date)}
                            x2={xAt(points[hover].date)}
                            y1={PAD.top}
                            y2={H - PAD.bottom}
                            stroke="rgba(247,147,26,0.4)"
                            strokeDasharray="3 3"
                        />
                        <circle
                            cx={xAt(points[hover].date)}
                            cy={yAt(points[hover].btc)}
                            r="5"
                            fill="#F7931A"
                            stroke="#0b0f1a"
                            strokeWidth="2"
                        />
                    </g>
                )}
            </svg>
        </div>
    );
}

function formatDate(iso: string) {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    });
}

function formatTick(iso: string, style: "day" | "year") {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString(
        undefined,
        style === "day" ? { month: "short", day: "numeric", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" },
    );
}
