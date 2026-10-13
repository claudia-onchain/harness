export type NavItem = { route: string; label: string; icon: string };
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Agent", items: [
    { route: "/chat", label: "Chat", icon: "chat" },
    { route: "/approvals", label: "Approvals", icon: "shield" },
    { route: "/sessions", label: "Sessions", icon: "history" },
  ] },
  { group: "Studio", items: [
    { route: "/studio/image", label: "Image", icon: "image" },
    { route: "/studio/photo", label: "Photo", icon: "photo" },
    { route: "/studio/video", label: "Video", icon: "video" },
    { route: "/studio/music", label: "Music", icon: "music" },
    { route: "/studio/audio", label: "Audio", icon: "audio" },
    { route: "/library", label: "Media library", icon: "library" },
  ] },
  { group: "Chain", items: [
    { route: "/chains", label: "Chains", icon: "chain" },
    { route: "/wallet", label: "Wallet & balances", icon: "wallet" },
    { route: "/prices", label: "Prices", icon: "price" },
  ] },
  { group: "Lumen", items: [
    { route: "/skills", label: "Skills", icon: "skills" },
    { route: "/plugins", label: "Plugins", icon: "plug" },
    { route: "/personas", label: "Personas", icon: "persona" },
    { route: "/keys", label: "Keys", icon: "key" },
    { route: "/updates", label: "Updates", icon: "update" },
    { route: "/settings", label: "Settings", icon: "settings" },
  ] },
];
export const ALL_NAV = NAV.flatMap((g) => g.items);
export const titleFor = (path: string) => ALL_NAV.find((n) => path.startsWith(n.route))?.label ?? "Lumen";
/** Which studio route a tool name relates to (pulses that nav item while the agent works). */
export function routeForTool(name?: string): string | undefined {
  if (!name) return;
  if (/image/.test(name)) return "/studio/image";
  if (/video/.test(name)) return "/studio/video";
  if (/music|sfx/.test(name)) return "/studio/music";
  if (/speech|audio|tts/.test(name)) return "/studio/audio";
  if (/balance|transfers|nft/.test(name)) return "/wallet";
  if (/price|chainlink|feed/.test(name)) return "/prices";
  if (/chain|gas|tx|contract|swap|bridge|resolve|token/.test(name)) return "/chains";
  if (/skill/.test(name)) return "/skills";
}
