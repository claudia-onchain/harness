// Chain registry: the single source of truth for every chain Lumen knows.
// Shared by the CLI (src/chains/*), the server and the per-chain skill templates.
//
// Fields
//   id            short slug used everywhere (`--chain base`, skill names `base-*`)
//   name          display name
//   family        "evm" | "solana" | "bitcoin" | "sui" | "aptos" | "tron" | "starknet"
//   chainId       EVM chain id (null for non-EVM)
//   native        { symbol, decimals, coingecko? }
//   alchemy       Alchemy network slug -> https://{alchemy}.g.alchemy.com/v2/{KEY}
//   publicRpc     keyless fallbacks, tried in order
//   explorer      block explorer base URL (tx: /tx/{hash}, address: /address/{addr})
//   chainlink     reference-data-directory network id -> feeds-{chainlink}.json (null if none)
//   llama         DefiLlama chain key for coins.llama.fi ("{llama}:{tokenAddress}")
//   tags          free-form labels (l2, op-stack, zk, testnet, ...)
//   testnet       true for test networks
//   accent        UI color for the chain chip

const evm = (o) => ({ family: "evm", testnet: false, tags: [], ...o, native: { decimals: 18, ...o.native } });

export const CHAINS = [
  // ── EVM mainnets ────────────────────────────────────────────────────────
  evm({ id: "ethereum", name: "Ethereum", chainId: 1, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "eth-mainnet", publicRpc: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"], explorer: "https://etherscan.io", chainlink: "mainnet", llama: "ethereum", tags: ["l1"], accent: "#8c9eff" }),
  evm({ id: "base", name: "Base", chainId: 8453, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "base-mainnet", publicRpc: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"], explorer: "https://basescan.org", chainlink: "ethereum-mainnet-base-1", llama: "base", tags: ["l2", "op-stack"], accent: "#3b7bff" }),
  evm({ id: "arbitrum", name: "Arbitrum One", chainId: 42161, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "arb-mainnet", publicRpc: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"], explorer: "https://arbiscan.io", chainlink: "ethereum-mainnet-arbitrum-1", llama: "arbitrum", tags: ["l2", "optimistic"], accent: "#28a0f0" }),
  evm({ id: "optimism", name: "OP Mainnet", chainId: 10, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "opt-mainnet", publicRpc: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"], explorer: "https://optimistic.etherscan.io", chainlink: "ethereum-mainnet-optimism-1", llama: "optimism", tags: ["l2", "op-stack"], accent: "#ff0420" }),
  evm({ id: "polygon", name: "Polygon PoS", chainId: 137, native: { symbol: "POL", coingecko: "polygon-ecosystem-token" }, alchemy: "polygon-mainnet", publicRpc: ["https://polygon-rpc.com", "https://polygon-bor-rpc.publicnode.com"], explorer: "https://polygonscan.com", chainlink: "matic-mainnet", llama: "polygon", tags: ["sidechain"], accent: "#8247e5" }),
  evm({ id: "bnb", name: "BNB Smart Chain", chainId: 56, native: { symbol: "BNB", coingecko: "binancecoin" }, alchemy: "bnb-mainnet", publicRpc: ["https://bsc-dataseed.bnbchain.org", "https://bsc-rpc.publicnode.com"], explorer: "https://bscscan.com", chainlink: "bsc-mainnet", llama: "bsc", tags: ["l1"], accent: "#f0b90b" }),
  evm({ id: "avalanche", name: "Avalanche C-Chain", chainId: 43114, native: { symbol: "AVAX", coingecko: "avalanche-2" }, alchemy: "avax-mainnet", publicRpc: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"], explorer: "https://snowtrace.io", chainlink: "avalanche-mainnet", llama: "avax", tags: ["l1"], accent: "#e84142" }),
  evm({ id: "zksync", name: "ZKsync Era", chainId: 324, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "zksync-mainnet", publicRpc: ["https://mainnet.era.zksync.io"], explorer: "https://explorer.zksync.io", chainlink: "ethereum-mainnet-zksync-1", llama: "era", tags: ["l2", "zk"], accent: "#8c8dfc" }),
  evm({ id: "linea", name: "Linea", chainId: 59144, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "linea-mainnet", publicRpc: ["https://rpc.linea.build"], explorer: "https://lineascan.build", chainlink: "ethereum-mainnet-linea-1", llama: "linea", tags: ["l2", "zk"], accent: "#61dfff" }),
  evm({ id: "scroll", name: "Scroll", chainId: 534352, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "scroll-mainnet", publicRpc: ["https://rpc.scroll.io"], explorer: "https://scrollscan.com", chainlink: "ethereum-mainnet-scroll-1", llama: "scroll", tags: ["l2", "zk"], accent: "#ffeeda" }),
  evm({ id: "blast", name: "Blast", chainId: 81457, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "blast-mainnet", publicRpc: ["https://rpc.blast.io"], explorer: "https://blastscan.io", chainlink: null, llama: "blast", tags: ["l2", "optimistic"], accent: "#fcfc03" }),
  evm({ id: "zora", name: "Zora", chainId: 7777777, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "zora-mainnet", publicRpc: ["https://rpc.zora.energy"], explorer: "https://explorer.zora.energy", chainlink: null, llama: "zora", tags: ["l2", "op-stack"], accent: "#a1723a" }),
  evm({ id: "mantle", name: "Mantle", chainId: 5000, native: { symbol: "MNT", coingecko: "mantle" }, alchemy: "mantle-mainnet", publicRpc: ["https://rpc.mantle.xyz"], explorer: "https://mantlescan.xyz", chainlink: "ethereum-mainnet-mantle-1", llama: "mantle", tags: ["l2"], accent: "#65b3ae" }),
  evm({ id: "worldchain", name: "World Chain", chainId: 480, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "worldchain-mainnet", publicRpc: ["https://worldchain-mainnet.g.alchemy.com/public"], explorer: "https://worldscan.org", chainlink: null, llama: "wc", tags: ["l2", "op-stack"], accent: "#d6d6d6" }),
  evm({ id: "unichain", name: "Unichain", chainId: 130, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "unichain-mainnet", publicRpc: ["https://mainnet.unichain.org"], explorer: "https://uniscan.xyz", chainlink: "ethereum-mainnet-unichain-1", llama: "unichain", tags: ["l2", "op-stack"], accent: "#f50db4" }),
  evm({ id: "ink", name: "Ink", chainId: 57073, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "ink-mainnet", publicRpc: ["https://rpc-gel.inkonchain.com"], explorer: "https://explorer.inkonchain.com", chainlink: "ethereum-mainnet-ink-1", llama: "ink", tags: ["l2", "op-stack"], accent: "#7132f5" }),
  evm({ id: "soneium", name: "Soneium", chainId: 1868, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "soneium-mainnet", publicRpc: ["https://rpc.soneium.org"], explorer: "https://soneium.blockscout.com", chainlink: null, llama: "soneium", tags: ["l2", "op-stack"], accent: "#eaeaea" }),
  evm({ id: "abstract", name: "Abstract", chainId: 2741, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "abstract-mainnet", publicRpc: ["https://api.mainnet.abs.xyz"], explorer: "https://abscan.org", chainlink: null, llama: "abstract", tags: ["l2", "zk"], accent: "#00de73" }),
  evm({ id: "apechain", name: "ApeChain", chainId: 33139, native: { symbol: "APE", coingecko: "apecoin" }, alchemy: "apechain-mainnet", publicRpc: ["https://rpc.apechain.com"], explorer: "https://apescan.io", chainlink: null, llama: "apechain", tags: ["l3"], accent: "#0054fa" }),
  evm({ id: "berachain", name: "Berachain", chainId: 80094, native: { symbol: "BERA", coingecko: "berachain-bera" }, alchemy: "berachain-mainnet", publicRpc: ["https://rpc.berachain.com"], explorer: "https://berascan.com", chainlink: null, llama: "berachain", tags: ["l1"], accent: "#f47a20" }),
  evm({ id: "gnosis", name: "Gnosis", chainId: 100, native: { symbol: "xDAI", coingecko: "xdai" }, alchemy: "gnosis-mainnet", publicRpc: ["https://rpc.gnosischain.com"], explorer: "https://gnosisscan.io", chainlink: "xdai-mainnet", llama: "xdai", tags: ["l1"], accent: "#3e6957" }),
  evm({ id: "celo", name: "Celo", chainId: 42220, native: { symbol: "CELO", coingecko: "celo" }, alchemy: "celo-mainnet", publicRpc: ["https://forno.celo.org"], explorer: "https://celoscan.io", chainlink: "celo-mainnet", llama: "celo", tags: ["l2"], accent: "#fcff52" }),
  evm({ id: "sonic", name: "Sonic", chainId: 146, native: { symbol: "S", coingecko: "sonic-3" }, alchemy: "sonic-mainnet", publicRpc: ["https://rpc.soniclabs.com"], explorer: "https://sonicscan.org", chainlink: "sonic-mainnet", llama: "sonic", tags: ["l1"], accent: "#fe9a4c" }),
  evm({ id: "sei", name: "Sei EVM", chainId: 1329, native: { symbol: "SEI", coingecko: "sei-network" }, alchemy: "sei-mainnet", publicRpc: ["https://evm-rpc.sei-apis.com"], explorer: "https://seitrace.com", chainlink: null, llama: "sei", tags: ["l1"], accent: "#9e1f19" }),
  evm({ id: "monad", name: "Monad", chainId: 143, native: { symbol: "MON", coingecko: "monad" }, alchemy: "monad-mainnet", publicRpc: ["https://rpc.monad.xyz"], explorer: "https://monadscan.com", chainlink: "monad-mainnet", llama: "monad", tags: ["l1"], accent: "#836ef9" }),
  evm({ id: "hyperevm", name: "HyperEVM", chainId: 999, native: { symbol: "HYPE", coingecko: "hyperliquid" }, alchemy: "hyperliquid-mainnet", publicRpc: ["https://rpc.hyperliquid.xyz/evm"], explorer: "https://hyperevmscan.io", chainlink: "hyperliquid-mainnet", llama: "hyperliquid", tags: ["l1"], accent: "#97fce4" }),
  evm({ id: "ronin", name: "Ronin", chainId: 2020, native: { symbol: "RON", coingecko: "ronin" }, alchemy: "ronin-mainnet", publicRpc: ["https://api.roninchain.com/rpc"], explorer: "https://app.roninchain.com", chainlink: null, llama: "ronin", tags: ["gaming"], accent: "#1273ea" }),
  evm({ id: "opbnb", name: "opBNB", chainId: 204, native: { symbol: "BNB", coingecko: "binancecoin" }, alchemy: "opbnb-mainnet", publicRpc: ["https://opbnb-mainnet-rpc.bnbchain.org"], explorer: "https://opbnb.bscscan.com", chainlink: null, llama: "op_bnb", tags: ["l2", "op-stack"], accent: "#f0b90b" }),
  evm({ id: "mode", name: "Mode", chainId: 34443, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "mode-mainnet", publicRpc: ["https://mainnet.mode.network"], explorer: "https://modescan.io", chainlink: null, llama: "mode", tags: ["l2", "op-stack"], accent: "#dffe00" }),
  evm({ id: "metis", name: "Metis Andromeda", chainId: 1088, native: { symbol: "METIS", coingecko: "metis-token" }, alchemy: "metis-mainnet", publicRpc: ["https://andromeda.metis.io/?owner=1088"], explorer: "https://andromeda-explorer.metis.io", chainlink: "ethereum-mainnet-andromeda-1", llama: "metis", tags: ["l2"], accent: "#00dacc" }),
  evm({ id: "moonbeam", name: "Moonbeam", chainId: 1284, native: { symbol: "GLMR", coingecko: "moonbeam" }, alchemy: "moonbeam-mainnet", publicRpc: ["https://rpc.api.moonbeam.network"], explorer: "https://moonscan.io", chainlink: null, llama: "moonbeam", tags: ["parachain"], accent: "#e1147b" }),
  evm({ id: "rootstock", name: "Rootstock", chainId: 30, native: { symbol: "RBTC", coingecko: "rootstock" }, alchemy: "rootstock-mainnet", publicRpc: ["https://public-node.rsk.co"], explorer: "https://explorer.rootstock.io", chainlink: null, llama: "rsk", tags: ["bitcoin-sidechain"], accent: "#ff9100" }),
  evm({ id: "flow", name: "Flow EVM", chainId: 747, native: { symbol: "FLOW", coingecko: "flow" }, alchemy: "flow-mainnet", publicRpc: ["https://mainnet.evm.nodes.onflow.org"], explorer: "https://evm.flowscan.io", chainlink: null, llama: "flow", tags: ["l1"], accent: "#00ef8b" }),
  evm({ id: "zetachain", name: "ZetaChain", chainId: 7000, native: { symbol: "ZETA", coingecko: "zetachain" }, alchemy: "zetachain-mainnet", publicRpc: ["https://zetachain-evm.blockpi.network/v1/rpc/public"], explorer: "https://explorer.zetachain.com", chainlink: null, llama: "zetachain", tags: ["l1", "omnichain"], accent: "#005741" }),
  evm({ id: "bob", name: "BOB", chainId: 60808, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "bob-mainnet", publicRpc: ["https://rpc.gobob.xyz"], explorer: "https://explorer.gobob.xyz", chainlink: null, llama: "bob", tags: ["l2", "op-stack"], accent: "#f25d00" }),
  evm({ id: "robinhood", name: "Robinhood Chain", chainId: 4663, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "robinhood-mainnet", publicRpc: ["https://rpc-robinhood.globalstake.io"], explorer: "https://robinhoodchain.blockscout.com", chainlink: null, llama: null, tags: ["l2", "claudia"], accent: "#ccff00" }),
  evm({ id: "story", name: "Story", chainId: 1514, native: { symbol: "IP", coingecko: "story-2" }, alchemy: "story-mainnet", publicRpc: ["https://mainnet.storyrpc.io"], explorer: "https://www.storyscan.io", chainlink: null, llama: "story", tags: ["l1", "ip"], accent: "#e6e6e6" }),
  evm({ id: "shape", name: "Shape", chainId: 360, native: { symbol: "ETH", coingecko: "ethereum" }, alchemy: "shape-mainnet", publicRpc: ["https://mainnet.shape.network"], explorer: "https://shapescan.xyz", chainlink: null, llama: "shape", tags: ["l2", "op-stack"], accent: "#c0c0c0" }),
  evm({ id: "plasma", name: "Plasma", chainId: 9745, native: { symbol: "XPL", coingecko: "plasma" }, alchemy: "plasma-mainnet", publicRpc: ["https://rpc.plasma.to"], explorer: "https://plasmascan.to", chainlink: null, llama: "plasma", tags: ["l1", "stablecoin"], accent: "#2ef2b1" }),

  // ── Non-EVM mainnets ────────────────────────────────────────────────────
  { id: "solana", name: "Solana", family: "solana", chainId: null, native: { symbol: "SOL", decimals: 9, coingecko: "solana" }, alchemy: "solana-mainnet", publicRpc: ["https://api.mainnet-beta.solana.com"], explorer: "https://solscan.io", chainlink: "solana-mainnet", llama: "solana", tags: ["l1", "svm", "claudia"], testnet: false, accent: "#14f195" },
  { id: "bitcoin", name: "Bitcoin", family: "bitcoin", chainId: null, native: { symbol: "BTC", decimals: 8, coingecko: "bitcoin" }, alchemy: "bitcoin-mainnet", publicRpc: ["https://mempool.space/api"], explorer: "https://mempool.space", chainlink: null, llama: "bitcoin", tags: ["l1", "utxo"], testnet: false, accent: "#f7931a" },
  { id: "sui", name: "Sui", family: "sui", chainId: null, native: { symbol: "SUI", decimals: 9, coingecko: "sui" }, alchemy: "sui-mainnet", publicRpc: ["https://fullnode.mainnet.sui.io:443"], explorer: "https://suiscan.xyz/mainnet", chainlink: null, llama: "sui", tags: ["l1", "move"], testnet: false, accent: "#4da2ff" },
  { id: "aptos", name: "Aptos", family: "aptos", chainId: null, native: { symbol: "APT", decimals: 8, coingecko: "aptos" }, alchemy: "aptos-mainnet", publicRpc: ["https://fullnode.mainnet.aptoslabs.com/v1"], explorer: "https://explorer.aptoslabs.com", chainlink: null, llama: "aptos", tags: ["l1", "move"], testnet: false, accent: "#06f7f7" },
  { id: "tron", name: "TRON", family: "tron", chainId: null, native: { symbol: "TRX", decimals: 6, coingecko: "tron" }, alchemy: "tron-mainnet", publicRpc: ["https://api.trongrid.io"], explorer: "https://tronscan.org", chainlink: null, llama: "tron", tags: ["l1"], testnet: false, accent: "#ff060a" },
  { id: "starknet", name: "Starknet", family: "starknet", chainId: null, native: { symbol: "STRK", decimals: 18, coingecko: "starknet" }, alchemy: "starknet-mainnet", publicRpc: ["https://api.cartridge.gg/x/starknet/mainnet"], explorer: "https://voyager.online", chainlink: "ethereum-mainnet-starknet-1", llama: "starknet", tags: ["l2", "zk", "cairo"], testnet: false, accent: "#ec796b" },

  // ── Testnets ────────────────────────────────────────────────────────────
  evm({ id: "sepolia", name: "Ethereum Sepolia", chainId: 11155111, native: { symbol: "ETH" }, alchemy: "eth-sepolia", publicRpc: ["https://ethereum-sepolia-rpc.publicnode.com"], explorer: "https://sepolia.etherscan.io", chainlink: "ethereum-testnet-sepolia", llama: null, tags: ["testnet"], testnet: true, accent: "#8c9eff" }),
  evm({ id: "base-sepolia", name: "Base Sepolia", chainId: 84532, native: { symbol: "ETH" }, alchemy: "base-sepolia", publicRpc: ["https://sepolia.base.org"], explorer: "https://sepolia.basescan.org", chainlink: "ethereum-testnet-sepolia-base-1", llama: null, tags: ["testnet", "op-stack"], testnet: true, accent: "#3b7bff" }),
  evm({ id: "arbitrum-sepolia", name: "Arbitrum Sepolia", chainId: 421614, native: { symbol: "ETH" }, alchemy: "arb-sepolia", publicRpc: ["https://sepolia-rollup.arbitrum.io/rpc"], explorer: "https://sepolia.arbiscan.io", chainlink: "ethereum-testnet-sepolia-arbitrum-1", llama: null, tags: ["testnet"], testnet: true, accent: "#28a0f0" }),
  evm({ id: "op-sepolia", name: "OP Sepolia", chainId: 11155420, native: { symbol: "ETH" }, alchemy: "opt-sepolia", publicRpc: ["https://sepolia.optimism.io"], explorer: "https://sepolia-optimism.etherscan.io", chainlink: null, llama: null, tags: ["testnet", "op-stack"], testnet: true, accent: "#ff0420" }),
  evm({ id: "polygon-amoy", name: "Polygon Amoy", chainId: 80002, native: { symbol: "POL" }, alchemy: "polygon-amoy", publicRpc: ["https://rpc-amoy.polygon.technology"], explorer: "https://amoy.polygonscan.com", chainlink: null, llama: null, tags: ["testnet"], testnet: true, accent: "#8247e5" }),
  evm({ id: "avalanche-fuji", name: "Avalanche Fuji", chainId: 43113, native: { symbol: "AVAX" }, alchemy: "avax-fuji", publicRpc: ["https://api.avax-test.network/ext/bc/C/rpc"], explorer: "https://testnet.snowtrace.io", chainlink: null, llama: null, tags: ["testnet"], testnet: true, accent: "#e84142" }),
  evm({ id: "bnb-testnet", name: "BNB Testnet", chainId: 97, native: { symbol: "tBNB" }, alchemy: "bnb-testnet", publicRpc: ["https://bsc-testnet-rpc.publicnode.com"], explorer: "https://testnet.bscscan.com", chainlink: null, llama: null, tags: ["testnet"], testnet: true, accent: "#f0b90b" }),
  evm({ id: "monad-testnet", name: "Monad Testnet", chainId: 10143, native: { symbol: "MON" }, alchemy: "monad-testnet", publicRpc: ["https://testnet-rpc.monad.xyz"], explorer: "https://testnet.monadexplorer.com", chainlink: null, llama: null, tags: ["testnet"], testnet: true, accent: "#836ef9" }),
  { id: "solana-devnet", name: "Solana Devnet", family: "solana", chainId: null, native: { symbol: "SOL", decimals: 9 }, alchemy: "solana-devnet", publicRpc: ["https://api.devnet.solana.com"], explorer: "https://solscan.io", explorerSuffix: "?cluster=devnet", chainlink: null, llama: null, tags: ["testnet", "svm"], testnet: true, accent: "#14f195" },
];

// Verified Chainlink standard proxies (8 decimals). Anything else is resolved at
// runtime from https://reference-data-directory.vercel.app/feeds-{chainlink}.json
export const CHAINLINK_FEEDS = {
  ethereum: { "ETH/USD": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", "BTC/USD": "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", "LINK/USD": "0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c" },
  arbitrum: { "ETH/USD": "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", "BTC/USD": "0x6ce185860a4963106506C203335A2910413708e9" },
  polygon: { "ETH/USD": "0xF9680D99D6C9589e2a93a78A04A279e509205945", "BTC/USD": "0xc907E116054Ad103354f2D350FD2514433D57F6f" },
  base: { "ETH/USD": "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", "BTC/USD": "0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F" },
};

const byId = new Map(CHAINS.map((c) => [c.id, c]));
const ALIASES = {
  eth: "ethereum", mainnet: "ethereum", arb: "arbitrum", op: "optimism", matic: "polygon", bsc: "bnb", binance: "bnb",
  avax: "avalanche", era: "zksync", sol: "solana", btc: "bitcoin", hood: "robinhood", hyperliquid: "hyperevm",
  hype: "hyperevm", world: "worldchain", xdai: "gnosis", rsk: "rootstock", apt: "aptos", trx: "tron", strk: "starknet",
};

/** Resolve a chain by id, alias, numeric chain id or Alchemy slug. Returns undefined if unknown. */
export function getChain(q) {
  if (q == null) return undefined;
  const s = String(q).trim().toLowerCase();
  if (byId.has(s)) return byId.get(s);
  if (ALIASES[s]) return byId.get(ALIASES[s]);
  if (/^\d+$/.test(s)) return CHAINS.find((c) => c.chainId === Number(s));
  return CHAINS.find((c) => c.alchemy === s || c.name.toLowerCase() === s);
}

export const mainnets = () => CHAINS.filter((c) => !c.testnet);
export const evmChains = () => CHAINS.filter((c) => c.family === "evm");
export const alchemyUrl = (chain, key) => (chain.alchemy && key ? `https://${chain.alchemy}.g.alchemy.com/v2/${key}` : null);
export const explorerTx = (chain, hash) => `${chain.explorer}/tx/${hash}${chain.explorerSuffix ?? ""}`;
export const explorerAddress = (chain, addr) => `${chain.explorer}/${chain.family === "bitcoin" ? "address" : chain.family === "sui" ? "account" : "address"}/${addr}${chain.explorerSuffix ?? ""}`;
