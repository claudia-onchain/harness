// usage: osascript -l JavaScript overlay.js X Y W H SECONDS [LABEL]
// coordinates are top-left origin (like System Events / CGWindow bounds)
ObjC.import('Cocoa');
function run(argv) {
  const [x, y, w, h, secs] = argv.slice(0, 5).map(Number);
  const label = argv[5] || '';
  const TEST_INVISIBLE = $.NSProcessInfo.processInfo.environment.objectForKey('OVERLAY_TEST').js === '1';
  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory); // no Dock icon
  const screen = $.NSScreen.mainScreen.frame;           // Cocoa origin = bottom-left
  const frame = $.NSMakeRect(x, screen.size.height - y - h, w, h);
  const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
    frame, $.NSWindowStyleMaskBorderless, $.NSBackingStoreBuffered, false);
  win.opaque = false;
  win.backgroundColor = $.NSColor.clearColor;
  win.hasShadow = false;
  win.ignoresMouseEvents = true;                         // click-through
  win.level = $.CGWindowLevelForKey($.kCGScreenSaverWindowLevelKey); // above everything
  win.collectionBehavior = $.NSWindowCollectionBehaviorCanJoinAllSpaces |
                           $.NSWindowCollectionBehaviorStationary |
                           $.NSWindowCollectionBehaviorFullScreenAuxiliary;
  const view = win.contentView;
  view.wantsLayer = true;
  view.layer.borderWidth = 4;
  view.layer.cornerRadius = 8;
  view.layer.borderColor = $.NSColor.systemRedColor.CGColor;
  view.layer.backgroundColor = $.NSColor.colorWithSRGBRedGreenBlueAlpha(1, 0, 0, 0.12).CGColor;
  if (label) {
    const tf = $.NSTextField.labelWithString(label);
    tf.textColor = $.NSColor.whiteColor;
    tf.drawsBackground = true;
    tf.backgroundColor = $.NSColor.systemRedColor;
    tf.font = $.NSFont.boldSystemFontOfSize(14);
    tf.sizeToFit;
    tf.setFrameOrigin($.NSMakePoint(6, h - tf.frame.size.height - 6));
    view.addSubview(tf);
  }
  if (TEST_INVISIBLE) win.alphaValue = 0;
  win.orderFrontRegardless;
  const until = $.NSDate.dateWithTimeIntervalSinceNow(secs);
  $.NSRunLoop.currentRunLoop.runUntilDate(until);       // keep alive N seconds, then exit
  win.orderOut(null);
  return 'ok';
}
