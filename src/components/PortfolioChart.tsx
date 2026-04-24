import { useMemo, useState } from "react";
import "./PortfolioChart.css";
import type { HistoryPoint } from "../requests/PortfolioHistoryRequests";
import type { Unit } from "../lib/format";
import { formatAmount, formatAxis, formatSecondary } from "../lib/format";
import { useSettings } from "../lib/SettingsContext";

type Range = "1M" | "3M" | "1Y" | "2Y" | "ALL";

const RANGE_WEEKS: Record<Range, number | "all"> = {
    "1M": 4,
    "3M": 13,
    "1Y": 52,
    "2Y": 104,
    ALL: "all",
};

const W = 880;
const H = 300;
const PAD = { top: 20, right: 20, bottom: 36, left: 56 };

type Props = {
    history: HistoryPoint[];
    priceUsd: number;
    unit: Unit;
};

export function PortfolioChart({ history, priceUsd, unit }: Props) {
    const [range, setRange] = useState<Range>("2Y");
    const [hover, setHover] = useState<number | null>(null);
    const { currency, denomination } = useSettings();

    const points = useMemo(() => {
        const span = RANGE_WEEKS[range];
        if (span === "all") return history;
        return history.slice(-span - 1);
    }, [history, range]);

    const maxBtc = Math.max(...points.map((p) => p.btc), 0.01);
    const minBtc = 0;

    const xAt = (i: number) => PAD.left + (i / Math.max(points.length - 1, 1)) * (W - PAD.left - PAD.right);
    const yAt = (btc: number) => PAD.top + (1 - (btc - minBtc) / (maxBtc - minBtc)) * (H - PAD.top - PAD.bottom);

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(2)},${yAt(p.btc).toFixed(2)}`).join(" ");

    const areaPath =
        `${linePath} L${xAt(points.length - 1).toFixed(2)},${yAt(0).toFixed(2)} ` + `L${xAt(0).toFixed(2)},${yAt(0).toFixed(2)} Z`;

    const yTicks = 4;
    const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => minBtc + (i * (maxBtc - minBtc)) / yTicks);

    const xTickCount = Math.min(6, points.length);
    const tickDivisor = Math.max(1, xTickCount - 1);
    const xTickIndexes = Array.from({ length: xTickCount }, (_, i) => Math.round((i * (points.length - 1)) / tickDivisor));

    const spanDays =
        points.length > 1
            ? (new Date(points[points.length - 1].date + "T00:00:00Z").getTime() - new Date(points[0].date + "T00:00:00Z").getTime()) /
              86_400_000
            : 0;
    const tickStyle: "day" | "year" = spanDays <= 120 ? "day" : "year";

    const hovered = hover !== null ? points[hover] : null;

    const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * W;
        const ratio = (x - PAD.left) / (W - PAD.left - PAD.right);
        const idx = Math.round(ratio * (points.length - 1));
        if (idx >= 0 && idx < points.length) setHover(idx);
    };

    return (
        <div className="chart-card">
            <div className="chart-head">
                <div>
                    <div className="muted small">{hovered ? formatDate(hovered.date) : "Last 2 years"}</div>
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
                    {(Object.keys(RANGE_WEEKS) as Range[]).map((r) => (
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

                {xTickIndexes.map((idx) => (
                    <text key={`xt-${idx}`} x={xAt(idx)} y={H - PAD.bottom + 20} textAnchor="middle" className="axis-label">
                        {formatTick(points[idx].date, tickStyle)}
                    </text>
                ))}

                <path d={areaPath} fill="url(#areaFill)" />
                <path d={linePath} fill="none" stroke="#F7931A" strokeWidth="2" filter="url(#glow)" />

                {hover !== null && (
                    <g>
                        <line
                            x1={xAt(hover)}
                            x2={xAt(hover)}
                            y1={PAD.top}
                            y2={H - PAD.bottom}
                            stroke="rgba(247,147,26,0.4)"
                            strokeDasharray="3 3"
                        />
                        <circle cx={xAt(hover)} cy={yAt(points[hover].btc)} r="5" fill="#F7931A" stroke="#0b0f1a" strokeWidth="2" />
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
