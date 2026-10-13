// Terminal capabilities: colour depth (0 none, 1 16-colour, 2 256, 3 truecolor), Unicode, hyperlinks.
export function detectTerm({ noColor = false, ascii = false, env = process.env, stream = process.stdout } = {}) {
  const isTTY = !!stream.isTTY;
  let color;
  const force = env.FORCE_COLOR;
  if (force !== undefined && force !== "") color = force === "0" || force === "false" ? 0 : Math.min(3, Math.max(1, Number(force) || 1));
  else if (noColor || (env.NO_COLOR !== undefined && env.NO_COLOR !== "")) color = 0;
  else if (!isTTY || env.TERM === "dumb") color = 0;
  else if (/^(truecolor|24bit)$/i.test(env.COLORTERM || "") || ["iTerm.app", "WezTerm", "vscode", "ghostty", "Hyper"].includes(env.TERM_PROGRAM) || env.WT_SESSION || /kitty|alacritty|ghostty/.test(env.TERM || "")) color = 3;
  else if (/256/.test(env.TERM || "") || env.TERM_PROGRAM === "Apple_Terminal") color = 2;
  else color = 1;
  let unicode;
  if (ascii || /^(1|true|yes)$/i.test(env.LUMEN_ASCII || "")) unicode = false;
  else if (env.TERM === "dumb") unicode = false;
  else if (process.platform === "win32") unicode = !!(env.WT_SESSION || env.TERM_PROGRAM === "vscode");
  else { const loc = env.LC_ALL || env.LC_CTYPE || env.LANG || ""; unicode = loc ? /utf-?8/i.test(loc) : process.platform === "darwin"; }
  const hyperlinks = isTTY && color > 0 && !!(env.TERM_PROGRAM && !["Apple_Terminal"].includes(env.TERM_PROGRAM) || /kitty|ghostty|wezterm/.test(env.TERM || ""));
  return { color, unicode, hyperlinks, isTTY, cols: stream.columns || Number(env.COLUMNS) || 80, rows: stream.rows || Number(env.LINES) || 24 };
}
