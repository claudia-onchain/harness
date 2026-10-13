// Provider brand mark with a letter fallback. Files live in public/brand/providers (provenance in SOURCES.md there);
// SVG marks get breathing room, raster app icons already carry their own background and fill the tile.
import { BRAND } from "../lib/brand";

export function ProviderMark({ id, name, size = 34, className = "" }: { id: string; name: string; size?: number; className?: string }) {
  const b = BRAND[id];
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (!b) return <div className={`ic ${className}`} style={style} aria-hidden>{name.slice(0, 1).toUpperCase()}</div>;
  return (
    <div className={`ic mark ${b.file.endsWith(".svg") ? "pad" : ""} ${className}`} style={style} title={name}>
      <img src={`/brand/providers/${b.file}`} alt={`${name} logo`} width={size} height={size} loading="lazy" draggable={false} />
    </div>
  );
}
