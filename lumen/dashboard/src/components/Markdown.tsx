// Safe Markdown → React (never innerHTML). Links only to http(s); images only from local /api/files or data: URLs.
import { Fragment, type ReactNode } from "react";

function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(!\[[^\]\n]*\]\(((?:\/api\/files\/|data:image\/)[^\s)]+)\))|(\[[^\]\n]+\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let n = 0;
  for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    const s = m[0];
    if (m[1]) out.push(<code key={k}>{s.slice(1, -1)}</code>);
    else if (m[2] || m[3]) out.push(<strong key={k}>{inline(s.slice(2, -2), k)}</strong>);
    else if (m[4]) out.push(<em key={k}>{inline(s.slice(1, -1), k)}</em>);
    else if (m[5]) out.push(<img key={k} src={m[6]} alt="" className="md-img" />);
    else if (m[7]) out.push(<a key={k} href={m[8]} target="_blank" rel="noopener noreferrer nofollow">{s.slice(1, s.indexOf("]("))}</a>);
    last = m.index + s.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^```(\w*)/.exec(line);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push(<pre key={k++} data-lang={fence[1] || undefined}><code>{buf.join("\n")}</code></pre>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const L = h[1].length;
      blocks.push(L === 1 ? <h2 key={k++}>{inline(h[2])}</h2> : L === 2 ? <h3 key={k++}>{inline(h[2])}</h3> : <h4 key={k++}>{inline(h[2])}</h4>);
      i++;
      continue;
    }
    const listM = /^(\s*)([-*•]|\d+[.)])\s+/.exec(line);
    if (listM) {
      const ordered = /\d/.test(listM[2]);
      const base = listM[1].length;
      const itemRe = ordered ? /^(\s*)\d+[.)]\s+/ : /^(\s*)[-*•]\s+/;
      const items: string[][] = [];
      while (i < lines.length) {
        const l = lines[i];
        const im = itemRe.exec(l);
        if (im && im[1].length <= base) { items.push([l.slice(im[0].length)]); i++; continue; }
        const indented = l.length - l.trimStart().length > base;
        if (items.length && l.trim() && indented) { items[items.length - 1].push(l); i++; continue; }
        if (items.length && !l.trim() && i + 1 < lines.length && lines[i + 1].trim() && (lines[i + 1].length - lines[i + 1].trimStart().length > base || itemRe.test(lines[i + 1]))) {
          if (itemRe.test(lines[i + 1]) && (itemRe.exec(lines[i + 1])![1].length <= base)) { i++; continue; }
          items[items.length - 1].push(""); i++; continue;
        }
        break;
      }
      const renderItem = (it: string[], j: number) => {
        const [first, ...rest] = it;
        const body = rest.filter((x, n) => x.trim() || n < rest.length - 1);
        const ind = Math.min(...body.filter((x) => x.trim()).map((x) => x.length - x.trimStart().length), 99);
        const nested = body.map((x) => x.slice(Math.min(ind, x.length - x.trimStart().length))).join("\n");
        // plain wrapped continuation lines join the first line; structured content renders as nested markdown
        const structured = /^(\s*[-*•]\s|\s*\d+[.)]\s|\s*```|\s*\|)/m.test(nested);
        const task = /^\[( |x)\]\s+/.exec(first);
        const head = task ? first.slice(task[0].length) : first;
        return (
          <li key={j} className={task ? "task" : undefined}>
            {task && <input type="checkbox" checked={task[1] === "x"} readOnly />}
            {inline(structured || !nested.trim() ? head : `${head} ${nested.replace(/\s*\n\s*/g, " ")}`, `l${j}`)}
            {structured && <Markdown text={nested} />}
          </li>
        );
      };
      blocks.push(ordered ? <ol key={k++}>{items.map(renderItem)}</ol> : <ul key={k++}>{items.map(renderItem)}</ul>);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={k++}>{inline(buf.join("\n"))}</blockquote>);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const row = (s: string) => s.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = row(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
      blocks.push(
        <div key={k++} className="md-table">
          <table><thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `h${j}`)}</th>)}</tr></thead>
            <tbody>{body.map((r, a) => <tr key={a}>{r.map((c, j) => <td key={j}>{inline(c, `c${a}${j}`)}</td>)}</tr>)}</tbody></table>
        </div>,
      );
      continue;
    }
    if (/^---+\s*$/.test(line)) { blocks.push(<hr key={k++} />); i++; continue; }
    if (!line.trim()) { i++; continue; }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\s*[-*•]\s+|\s*\d+[.)]\s+|>|\|)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) buf.push(lines[i++]);
    blocks.push(<p key={k++}>{buf.map((b, j) => <Fragment key={j}>{j > 0 && "\n"}{inline(b, `p${j}`)}</Fragment>)}</p>);
  }
  return <div className={`md ${streaming ? "streaming" : ""}`}>{blocks}</div>;
}
