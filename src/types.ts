export interface TokenData {
    address: string;
    name: string;
    symbol: string;
    priceUsd: string;
    liquidity: string;
    volume24h: string;
}

export interface DiscoveredNarrative {
    name: string;
    description: string;
    tokenName: string;
    symbol: string;
    confidence: number; // 1-10 score from the LLM
    matchingTokens: string[];
}

export interface HistoryEntry {
    narrative: string;
    tokenName: string;
    symbol: string;
    mintAddress: string;
    txSignature: string;
    matchingTokens: string[];
    confidence: number;
    createdAt: string;
}

export interface HistoryData {
    entries: HistoryEntry[];
}
