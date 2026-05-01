import { describe, it, expect, vi, afterEach } from "vitest";
import { BlockchainTransactionsRequests } from "./BlockchainTransactionsRequests";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function fetchOk(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => body,
    } as unknown as Response;
}

function fetchFail(status = 500): Response {
    return {
        ok: false,
        status,
        statusText: "Server Error",
        json: async () => ({}),
    } as unknown as Response;
}

const ADDRESS = "bc1qexampleaddress";

const SAMPLE_TX = {
    txid: "tx-1",
    status: { confirmed: true, block_time: 1_700_000_000 },
    vin: [
        { prevout: { scriptpubkey_address: "bc1qsender", value: 0 } },
    ],
    vout: [
        { scriptpubkey_address: ADDRESS, value: 50_000 },
        { scriptpubkey_address: "bc1qchange", value: 12_345 },
    ],
};

describe("BlockchainTransactionsRequests.getForAddress", () => {
    it("returns the net per-address sat delta for incoming transactions", async () => {
        const fetchSpy = vi.fn(async () => fetchOk([SAMPLE_TX]));
        // Second page empty stops pagination.
        fetchSpy.mockImplementationOnce(async () => fetchOk([SAMPLE_TX]));
        fetchSpy.mockImplementationOnce(async () => fetchOk([]));
        vi.stubGlobal("fetch", fetchSpy);

        const result = await new BlockchainTransactionsRequests().getForAddress(ADDRESS);

        expect(result).toEqual([
            { txid: "tx-1", amountSat: 50_000, blockTime: 1_700_000_000, confirmed: true },
        ]);
    });

    it("computes a negative delta for outgoing transactions", async () => {
        const outgoingTx = {
            txid: "tx-out",
            status: { confirmed: true, block_time: 1_700_500_000 },
            vin: [{ prevout: { scriptpubkey_address: ADDRESS, value: 100_000 } }],
            vout: [
                { scriptpubkey_address: "bc1qreceiver", value: 80_000 },
                { scriptpubkey_address: ADDRESS, value: 19_000 }, // change back to self
            ],
        };
        const fetchSpy = vi.fn();
        fetchSpy.mockImplementationOnce(async () => fetchOk([outgoingTx]));
        fetchSpy.mockImplementationOnce(async () => fetchOk([]));
        vi.stubGlobal("fetch", fetchSpy);

        const result = await new BlockchainTransactionsRequests().getForAddress(ADDRESS);
        expect(result).toEqual([
            { txid: "tx-out", amountSat: -81_000, blockTime: 1_700_500_000, confirmed: true },
        ]);
    });

    it("marks unconfirmed transactions correctly", async () => {
        const pendingTx = {
            txid: "tx-pending",
            status: { confirmed: false },
            vin: [],
            vout: [{ scriptpubkey_address: ADDRESS, value: 1_000 }],
        };
        const fetchSpy = vi.fn();
        fetchSpy.mockImplementationOnce(async () => fetchOk([pendingTx]));
        // No confirmed tx in batch -> pagination should stop on first page.
        vi.stubGlobal("fetch", fetchSpy);

        const result = await new BlockchainTransactionsRequests().getForAddress(ADDRESS);
        expect(result).toEqual([{ txid: "tx-pending", amountSat: 1_000, blockTime: null, confirmed: false }]);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("falls back to the secondary endpoint when the primary fails", async () => {
        const fetchSpy = vi.fn(async (url: string) => {
            if (url.includes("mempool.space")) return fetchFail(503);
            if (url.includes("blockstream.info")) return fetchOk([]);
            throw new Error(`Unexpected URL: ${url}`);
        });
        vi.stubGlobal("fetch", fetchSpy);

        const result = await new BlockchainTransactionsRequests().getForAddress(ADDRESS);
        expect(result).toEqual([]);
        expect(fetchSpy).toHaveBeenCalled();
    });

    it("throws when every endpoint fails", async () => {
        const fetchSpy = vi.fn(async () => fetchFail(500));
        vi.stubGlobal("fetch", fetchSpy);

        await expect(new BlockchainTransactionsRequests().getForAddress(ADDRESS)).rejects.toThrow(
            /Failed to fetch transactions for/,
        );
    });

    it("paginates using the last confirmed txid until an empty page", async () => {
        const page1 = [
            {
                txid: "tx-a",
                status: { confirmed: true, block_time: 100 },
                vin: [],
                vout: [{ scriptpubkey_address: ADDRESS, value: 10 }],
            },
            {
                txid: "tx-b",
                status: { confirmed: true, block_time: 90 },
                vin: [],
                vout: [{ scriptpubkey_address: ADDRESS, value: 20 }],
            },
        ];
        const page2 = [
            {
                txid: "tx-c",
                status: { confirmed: true, block_time: 80 },
                vin: [],
                vout: [{ scriptpubkey_address: ADDRESS, value: 30 }],
            },
        ];

        const fetchSpy = vi.fn();
        fetchSpy.mockImplementationOnce(async () => fetchOk(page1));
        fetchSpy.mockImplementationOnce(async () => fetchOk(page2));
        fetchSpy.mockImplementationOnce(async () => fetchOk([]));
        vi.stubGlobal("fetch", fetchSpy);

        const result = await new BlockchainTransactionsRequests().getForAddress(ADDRESS);
        expect(result.map((r) => r.txid)).toEqual(["tx-a", "tx-b", "tx-c"]);
        // Second-page URL should reference the last confirmed txid of page1 ("tx-b").
        expect((fetchSpy.mock.calls[1] as unknown[])[0]).toContain("/chain/tx-b");
    });
});
