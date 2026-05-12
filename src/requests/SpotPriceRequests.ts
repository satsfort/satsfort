import { Config } from "../lib/Config";
import { httpFetch } from "../lib/httpFetch";
import type { SpotPrice } from "../services/model/SpotPrice";

type PriceFetcher = {
    name: string;
    fetch: () => Promise<number>;
};

const PRICE_SOURCES: PriceFetcher[] = [
    {
        name: "coingecko",
        fetch: async () => {
            const res = await httpFetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
            if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
            const data = await res.json();
            return data.bitcoin.usd;
        },
    },
    {
        name: "coinbase",
        fetch: async () => {
            const res = await httpFetch("https://api.coinbase.com/v2/prices/BTC-USD/spot");
            if (!res.ok) throw new Error(`Coinbase HTTP ${res.status}`);
            const data = await res.json();
            return parseFloat(data.data.amount);
        },
    },
    {
        name: "kraken",
        fetch: async () => {
            const res = await httpFetch("https://api.kraken.com/0/public/Ticker?pair=XBTUSD");
            if (!res.ok) throw new Error(`Kraken HTTP ${res.status}`);
            const data = await res.json();
            const pair = data.result.XXBTZUSD ?? data.result.XBTUSD;
            return parseFloat(pair.c[0]);
        },
    },
    {
        name: "blockchain.info",
        fetch: async () => {
            const res = await httpFetch("https://blockchain.info/ticker");
            if (!res.ok) throw new Error(`Blockchain.info HTTP ${res.status}`);
            const data = await res.json();
            return data.USD.last;
        },
    },
];

let lastSourceIndex = -1;

export class SpotPriceRequests {
    async execute(): Promise<SpotPrice> {
        if (Config.useMockData) {
            return { usd: 94_820, source: "coingecko", asOf: new Date().toISOString() };
        }

        const startIndex = (lastSourceIndex + 1) % PRICE_SOURCES.length;

        for (let attempt = 0; attempt < PRICE_SOURCES.length; attempt++) {
            const index = (startIndex + attempt) % PRICE_SOURCES.length;
            const source = PRICE_SOURCES[index];
            try {
                const usd = await source.fetch();
                lastSourceIndex = index;
                return { usd, source: source.name, asOf: new Date().toISOString() };
            } catch (error) {
                console.warn(`SpotPriceRequests: ${source.name} failed, trying next`, error);
            }
        }

        throw new Error("SpotPriceRequests: all price sources failed");
    }
}
