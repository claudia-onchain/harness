ObjC.import('CoreGraphics');
function run(argv) {
  const owner = argv[0];
  const opts = $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements;
  const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(opts, $.kCGNullWindowID)));
  return JSON.stringify(list
    .filter(w => !owner || w.kCGWindowOwnerName === owner)
    .map(w => ({ app: w.kCGWindowOwnerName, title: w.kCGWindowName || '', layer: w.kCGWindowLayer,
                 pid: w.kCGWindowOwnerPID, id: w.kCGWindowNumber, ...w.kCGWindowBounds })));
}
