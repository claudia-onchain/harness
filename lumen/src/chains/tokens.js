// Well-known token addresses (used for keyless balances and swap-quote symbol lookup).
export const NATIVE_EVM = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const SOL_MINT = "So11111111111111111111111111111111111111112";

const t = (address, decimals, coingecko) => ({ address, decimals, coingecko });

export const KNOWN_TOKENS = {
  ethereum: {
    USDC: t("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6, "usd-coin"), USDT: t("0xdAC17F958D2ee523a2206206994597C13D831ec7", 6, "tether"),
    WETH: t("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 18, "weth"), DAI: t("0x6B175474E89094C44Da98b954EedeAC495271d0F", 18, "dai"),
    LINK: t("0x514910771AF9Ca656af840dff83E8264EcF986CA", 18, "chainlink"), WBTC: t("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 8, "wrapped-bitcoin"),
  },
  base: { USDC: t("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6, "usd-coin"), WETH: t("0x4200000000000000000000000000000000000006", 18, "weth") },
  optimism: { USDC: t("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", 6, "usd-coin"), WETH: t("0x4200000000000000000000000000000000000006", 18, "weth") },
  arbitrum: { USDC: t("0xaf88d065e77c8cC2239327C5EDb3A432268e5831", 6, "usd-coin"), USDT: t("0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", 6, "tether"), WETH: t("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", 18, "weth") },
  polygon: { USDC: t("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", 6, "usd-coin"), USDT: t("0xc2132D05D31c914a87C6611C10748AEb04B58e8F", 6, "tether"), WETH: t("0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", 18, "weth") },
  bnb: { USDC: t("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 18, "usd-coin"), USDT: t("0x55d398326f99059fF775485246999027B3197955", 18, "tether") },
  avalanche: { USDC: t("0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", 6, "usd-coin") },
  solana: {
    SOL: t(SOL_MINT, 9, "solana"), USDC: t("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", 6, "usd-coin"),
    USDT: t("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", 6, "tether"),
  },
};

/** Common symbol -> CoinGecko id (DefiLlama accepts "coingecko:<id>"). */
export const COINGECKO_IDS = {
  ETH: "ethereum", WETH: "ethereum", BTC: "bitcoin", WBTC: "bitcoin", SOL: "solana", USDC: "usd-coin", USDT: "tether", DAI: "dai",
  LINK: "chainlink", BNB: "binancecoin", POL: "polygon-ecosystem-token", MATIC: "polygon-ecosystem-token", AVAX: "avalanche-2",
  ARB: "arbitrum", OP: "optimism", UNI: "uniswap", AAVE: "aave", MKR: "maker", CRV: "curve-dao-token", LDO: "lido-dao",
  SUI: "sui", APT: "aptos", TRX: "tron", STRK: "starknet", DOGE: "dogecoin", PEPE: "pepe", SHIB: "shiba-inu", XRP: "ripple",
  ADA: "cardano", TON: "the-open-network", HYPE: "hyperliquid", MNT: "mantle", CELO: "celo", S: "sonic-3", SEI: "sei-network",
  MON: "monad", RON: "ronin", APE: "apecoin", BERA: "berachain-bera", JUP: "jupiter-exchange-solana", BONK: "bonk", WIF: "dogwifcoin",
  ENA: "ethena", USDE: "ethena-usde", PYTH: "pyth-network", TIA: "celestia", NEAR: "near", ATOM: "cosmos", DOT: "polkadot",
  XDAI: "xdai", GLMR: "moonbeam", FLOW: "flow", ZETA: "zetachain", METIS: "metis-token", IP: "story-2", XPL: "plasma", RBTC: "rootstock",
};

export function knownToken(chainId, symbol) {
  return KNOWN_TOKENS[chainId]?.[String(symbol).toUpperCase()] || null;
}

export const isEvmAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s || ""));
export const isSolanaAddress = (s) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s || ""));
export const isTxHash = (s) => /^0x[0-9a-fA-F]{64}$/.test(String(s || ""));
