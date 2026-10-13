// Lumen "show me" overlay: one transparent, click-through window per screen, drawing many markers.
// usage: osascript -l JavaScript markers.js '<json>'
//   json = { seconds, markers: [{ x, y, w, h, label?, color?, shape?: "box"|"circle"|"arrow" }] }
//   Coordinates are global, top-left origin (CGWindow / System Events space), already resolved to screen.
//   arrow: drawn from (x, y) to (x + w, y + h) with a head at the end.
// Env OVERLAY_TEST=1 renders fully transparent (for automated tests).
ObjC.import('Cocoa');
ObjC.import('QuartzCore');

const COLORS = { red: [0.957, 0.247, 0.369], violet: [0.486, 0.361, 1], cyan: [0.133, 0.827, 0.933], green: [0.204, 0.827, 0.6], amber: [0.984, 0.749, 0.141], white: [1, 1, 1] };
function rgb(c) {
  if (!c) return COLORS.violet;
  if (COLORS[c]) return COLORS[c];
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) return COLORS.violet;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const ns = (c, a) => $.NSColor.colorWithSRGBRedGreenBlueAlpha(c[0], c[1], c[2], a);

function pulse(layer, key, from, to, dur) {
  const anim = $.CABasicAnimation.animationWithKeyPath(key);
  anim.fromValue = $(from); anim.toValue = $(to);
  anim.duration = dur; anim.autoreverses = true; anim.repeatCount = 1e9;
  anim.timingFunction = $.CAMediaTimingFunction.functionWithName($.kCAMediaTimingFunctionEaseInEaseOut);
  layer.addAnimationForKey(anim, key + 'Pulse');
}

function fadeIn(layer, dur) {
  const anim = $.CABasicAnimation.animationWithKeyPath('opacity');
  anim.fromValue = $(0); anim.toValue = $(1); anim.duration = dur;
  layer.addAnimationForKey(anim, 'fadeIn');
}

function run(argv) {
  const spec = JSON.parse(argv[0] || '{}');
  const secs = Math.max(0.5, Math.min(120, Number(spec.seconds) || 4));
  const markers = Array.isArray(spec.markers) ? spec.markers : [];
  const TEST = $.NSProcessInfo.processInfo.environment.objectForKey('OVERLAY_TEST').js === '1';
  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  const screens = $.NSScreen.screens;
  const mainH = screens.objectAtIndex(0).frame.size.height; // Cocoa global origin = bottom-left of the main screen
  const wins = [];
  let drawn = 0;
  for (let s = 0; s < screens.count; s++) {
    const f = screens.objectAtIndex(s).frame;
    const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(f, $.NSWindowStyleMaskBorderless, $.NSBackingStoreBuffered, false);
    win.opaque = false; win.backgroundColor = $.NSColor.clearColor; win.hasShadow = false; win.ignoresMouseEvents = true;
    win.level = $.CGWindowLevelForKey($.kCGScreenSaverWindowLevelKey);
    win.collectionBehavior = $.NSWindowCollectionBehaviorCanJoinAllSpaces | $.NSWindowCollectionBehaviorStationary | $.NSWindowCollectionBehaviorFullScreenAuxiliary;
    const view = win.contentView;
    view.wantsLayer = true;
    const root = view.layer;
    const toLocal = (x, y) => [x - f.origin.x, (mainH - y) - f.origin.y]; // global top-left -> window-local bottom-left
    for (const m of markers) {
      const x = Number(m.x) || 0, y = Number(m.y) || 0, w = Number(m.w) || 0, h = Number(m.h) || 0;
      const shape = m.shape || 'box';
      const minX = Math.min(x, x + w), maxX = Math.max(x, x + w), minY = Math.min(y, y + h), maxY = Math.max(y, y + h);
      const visible = maxX >= f.origin.x && minX <= f.origin.x + f.size.width && (mainH - minY) >= f.origin.y && (mainH - maxY) <= f.origin.y + f.size.height;
      if (!visible) continue;
      drawn++;
      const c = rgb(m.color);
      if (shape === 'arrow') {
        const [x1, y1] = toLocal(x, y), [x2, y2] = toLocal(x + w, y + h);
        const ang = Math.atan2(y2 - y1, x2 - x1), head = 22;
        const bp = $.NSBezierPath.bezierPath;
        bp.moveToPoint($.NSMakePoint(x1, y1));
        bp.lineToPoint($.NSMakePoint(x2, y2));
        bp.moveToPoint($.NSMakePoint(x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45)));
        bp.lineToPoint($.NSMakePoint(x2, y2));
        bp.lineToPoint($.NSMakePoint(x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45)));
        const path = bp.CGPath; // macOS 14+
        const sl = $.CAShapeLayer.layer;
        sl.path = path; sl.strokeColor = ns(c, 1).CGColor; sl.fillColor = $.NSColor.clearColor.CGColor;
        sl.lineWidth = 6; sl.lineCap = $.kCALineCapRound; sl.lineJoin = $.kCALineJoinRound;
        sl.shadowColor = ns(c, 1).CGColor; sl.shadowOpacity = 0.8; sl.shadowRadius = 8; sl.shadowOffset = $.CGSizeMake(0, 0);
        root.addSublayer(sl); fadeIn(sl, 0.25); pulse(sl, 'opacity', 1, 0.55, 0.7);
      } else {
        const [lx, ly] = toLocal(x, y + h);
        const L = $.CALayer.layer;
        L.frame = $.CGRectMake(lx, ly, Math.abs(w), Math.abs(h));
        L.borderWidth = 4; L.borderColor = ns(c, 1).CGColor; L.backgroundColor = ns(c, 0.10).CGColor;
        L.cornerRadius = shape === 'circle' ? Math.min(Math.abs(w), Math.abs(h)) / 2 : 10;
        L.shadowColor = ns(c, 1).CGColor; L.shadowOpacity = 0.9; L.shadowRadius = 14; L.shadowOffset = $.CGSizeMake(0, 0);
        root.addSublayer(L); fadeIn(L, 0.25); pulse(L, 'borderWidth', 4, 8, 0.75);
      }
      if (m.label) {
        const tf = $.NSTextField.labelWithString(' ' + String(m.label).slice(0, 120) + ' ');
        tf.textColor = $.NSColor.whiteColor; tf.drawsBackground = true; tf.backgroundColor = ns(c, 0.95);
        tf.font = $.NSFont.boldSystemFontOfSize(15); tf.sizeToFit;
        tf.wantsLayer = true; tf.layer.cornerRadius = 6; tf.layer.masksToBounds = true;
        const th = tf.frame.size.height;
        const anchorX = shape === 'arrow' ? Math.min(x, x + w) : minX;
        const [ax, ay] = toLocal(anchorX, shape === 'arrow' ? y : minY);
        const above = ay + 8 + th < f.size.height;
        tf.setFrameOrigin($.NSMakePoint(Math.max(4, ax), above ? ay + 8 : ay - th - 8));
        view.addSubview(tf);
      }
    }
    if (TEST) win.alphaValue = 0;
    win.orderFrontRegardless;
    wins.push(win);
  }
  const until = $.NSDate.dateWithTimeIntervalSinceNow(secs);
  $.NSRunLoop.currentRunLoop.runUntilDate(until);
  for (let i = 10; i >= 0; i--) { for (const w of wins) w.alphaValue = TEST ? 0 : i / 10; $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.03)); }
  for (const w of wins) w.orderOut(null);
  return JSON.stringify({ ok: true, screens: screens.count, drawn });
}
