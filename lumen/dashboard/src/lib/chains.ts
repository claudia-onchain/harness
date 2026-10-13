// Chains: live from /api/chains, falling back to the shared registry bundled at build time (offline/demo).
import { CHAINS } from "../../../src/chains/registry.js";
import { api } from "./api";
import type { Chain } from "./types";

export const BUNDLED_CHAINS = CHAINS as unknown as Chain[];

export async function loadChains(testnets = false): Promise<{ chains: Chain[]; live: boolean }> {
  try {
    const chains = await api<Chain[]>(`/api/chains${testnets ? "?testnets=1" : ""}`);
    return { chains, live: true };
  } catch {
    return { chains: BUNDLED_CHAINS.filter((c) => testnets || !c.testnet), live: false };
  }
}
export const chainById = (id: string) => BUNDLED_CHAINS.find((c) => c.id === id);
