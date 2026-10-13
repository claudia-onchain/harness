// Lists displays in top-left global coordinates: [{ index, x, y, w, h, main }]
ObjC.import('Cocoa');
function run() {
  const s = $.NSScreen.screens;
  const mainH = s.objectAtIndex(0).frame.size.height;
  const out = [];
  for (let i = 0; i < s.count; i++) {
    const f = s.objectAtIndex(i).frame;
    out.push({ index: i, x: f.origin.x, y: mainH - f.origin.y - f.size.height, w: f.size.width, h: f.size.height, main: i === 0 });
  }
  return JSON.stringify(out);
}
