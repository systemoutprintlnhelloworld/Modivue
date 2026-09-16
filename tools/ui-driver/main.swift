import AppKit
import ApplicationServices
import Foundation

struct DriverError: Error { let message: String }
func fail(_ message: String) throws -> Never { throw DriverError(message: message) }
func emit(_ value: Any) {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
    print(String(decoding: data, as: UTF8.self))
}
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success ? value : nil
}
func children(_ element: AXUIElement) -> [AXUIElement] { attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [] }
func requireAX() throws {
    if !AXIsProcessTrusted() { try fail("UNTESTED: Accessibility permission is required for the host terminal / ui-driver") }
}
func application(_ target: String) throws -> NSRunningApplication {
    if let pid = Int32(target), let app = NSRunningApplication(processIdentifier: pid) { return app }
    if let app = NSRunningApplication.runningApplications(withBundleIdentifier: target).last { return app }
    try fail("Application not running: \(target)")
}
func pointValue(_ value: CFTypeRef?) -> [String: Double]? {
    guard let value, CFGetTypeID(value) == AXValueGetTypeID() else { return nil }
    let ax = unsafeBitCast(value, to: AXValue.self)
    if AXValueGetType(ax) == .cgPoint {
        var point = CGPoint.zero; AXValueGetValue(ax, .cgPoint, &point)
        return ["x": point.x, "y": point.y]
    }
    if AXValueGetType(ax) == .cgSize {
        var size = CGSize.zero; AXValueGetValue(ax, .cgSize, &size)
        return ["width": size.width, "height": size.height]
    }
    return nil
}
func snapshot(_ root: AXUIElement) -> [[String: Any]] {
    var rows = [[String: Any]]()
    func visit(_ element: AXUIElement, _ path: String, _ depth: Int) {
        guard depth < 25, rows.count < 4000 else { return }
        var row: [String: Any] = ["path": path]
        for key in [kAXRoleAttribute, kAXSubroleAttribute, kAXTitleAttribute, kAXDescriptionAttribute, kAXIdentifierAttribute, kAXValueAttribute] {
            if let value = attribute(element, key) as? String { row[key] = String(value.prefix(600)) }
        }
        if let enabled = attribute(element, kAXEnabledAttribute) as? Bool { row[kAXEnabledAttribute] = enabled }
        row["position"] = pointValue(attribute(element, kAXPositionAttribute))
        row["size"] = pointValue(attribute(element, kAXSizeAttribute))
        rows.append(row)
        if row[kAXRoleAttribute] as? String == kAXMenuBarItemRole && row[kAXTitleAttribute] as? String == "Apple" { return }
        for (index, child) in children(element).enumerated() { visit(child, "\(path).\(index)", depth + 1) }
    }
    visit(root, "0", 0)
    return rows
}
func elementAt(_ root: AXUIElement, _ path: String) throws -> AXUIElement {
    var element = root
    guard path.split(separator: ".").first == "0" else { try fail("Invalid AX path") }
    for part in path.split(separator: ".").dropFirst() {
        guard let index = Int(part), children(element).indices.contains(index) else { try fail("AX path no longer exists") }
        element = children(element)[index]
    }
    return element
}
func mouse(_ type: CGEventType, _ point: CGPoint, _ button: CGMouseButton = .left) throws {
    guard let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: point, mouseButton: button) else { try fail("Cannot create mouse event") }
    event.post(tap: .cghidEventTap)
}
let args = Array(CommandLine.arguments.dropFirst())
do {
    guard let command = args.first else { try fail("commands: permissions, launch <app>, activate <pid>, windows [pid], elements <pid>, press <pid> <path>, menu <pid> <path>, move x y, click x y, right-click x y, drag x y x y, screenshot <path>, quit <pid>") }
    func arg(_ index: Int) throws -> String { guard args.indices.contains(index) else { try fail("Missing argument \(index)") }; return args[index] }
    func coord(_ index: Int) throws -> CGFloat { guard let value = Double(try arg(index)), value.isFinite else { try fail("Invalid coordinate") }; return value }
    switch command {
    case "permissions":
        let session = CGSessionCopyCurrentDictionary() as? [String: Any]
        emit(["accessibility": AXIsProcessTrusted(), "screenCapture": CGPreflightScreenCaptureAccess(),
              "postEvents": CGPreflightPostEventAccess(), "screenLocked": session?["CGSSessionScreenIsLocked"] as? Bool ?? false])
    case "screens":
        let top = NSScreen.screens.first?.frame.maxY ?? 0
        emit(NSScreen.screens.map { screen in
            let visible = screen.visibleFrame
            return ["x": visible.minX, "y": top - visible.maxY, "width": visible.width, "height": visible.height]
        })
    case "launch":
        let url = URL(fileURLWithPath: try arg(1))
        let config = NSWorkspace.OpenConfiguration(); config.createsNewApplicationInstance = true
        if args.count > 2 { config.environment = ["MODIVUE_UI_ARTIFACTS": args[2]] }
        var finished = false
        var launched: NSRunningApplication?; var errorText: String?
        NSWorkspace.shared.openApplication(at: url, configuration: config) { app, error in
            launched = app; errorText = error?.localizedDescription; finished = true
        }
        let deadline = Date().addingTimeInterval(20)
        while !finished && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
        guard let app = launched else { try fail(errorText ?? "Launch timed out") }
        emit(["pid": app.processIdentifier, "bundleId": app.bundleIdentifier ?? ""])
    case "activate", "quit":
        let app = try application(arg(1))
        let result = command == "quit" ? app.terminate() : app.activate(options: [.activateIgnoringOtherApps])
        guard result else { try fail("Application action rejected") }
        if command == "activate" {
            try requireAX()
            let root = AXUIElementCreateApplication(app.processIdentifier)
            AXUIElementSetAttributeValue(root, kAXFrontmostAttribute as CFString, kCFBooleanTrue)
            let deadline = Date().addingTimeInterval(3)
            while NSWorkspace.shared.frontmostApplication?.processIdentifier != app.processIdentifier && Date() < deadline {
                RunLoop.current.run(until: Date().addingTimeInterval(0.05))
            }
        }
        emit(["ok": true, "pid": app.processIdentifier, "frontmostPid": NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1])
    case "windows":
        let pid = args.count > 1 ? try application(arg(1)).processIdentifier : nil
        let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        emit(windows.filter { pid == nil || ($0[kCGWindowOwnerPID as String] as? Int32) == pid })
    case "elements", "press", "menu", "raise", "position":
        try requireAX()
        let root = AXUIElementCreateApplication(try application(arg(1)).processIdentifier)
        AXUIElementSetMessagingTimeout(root, 3)
        if command == "elements" { emit(snapshot(root)) }
        else {
            let element = try elementAt(root, arg(2))
            let result: AXError
            if command == "position" {
                var point = try CGPoint(x: coord(3), y: coord(4))
                result = AXUIElementSetAttributeValue(element, kAXPositionAttribute as CFString, AXValueCreate(.cgPoint, &point)!)
            } else {
                let action = command == "menu" ? kAXShowMenuAction : command == "raise" ? kAXRaiseAction : kAXPressAction
                result = AXUIElementPerformAction(element, action as CFString)
            }
            guard result == .success else { try fail("AX action failed: \(result.rawValue)") }
            emit(["ok": true])
        }
    case "move", "click", "right-click", "drag":
        try requireAX()
        let start = try CGPoint(x: coord(1), y: coord(2))
        var motion = [[String: Any]]()
        let trackedWindow = command == "drag" && args.count > 5 ? UInt32(args[5]) : nil
        func recordMotion(_ phase: String, _ point: CGPoint) {
            guard let trackedWindow,
                  let frame = (CGWindowListCopyWindowInfo(.optionIncludingWindow, trackedWindow) as? [[String: Any]])?.first?[kCGWindowBounds as String] else { return }
            motion.append(["phase": phase, "pointer": ["x": point.x, "y": point.y], "frame": frame])
        }
        try mouse(.mouseMoved, start)
        if command == "click" || command == "right-click" {
            let right = command == "right-click"
            try mouse(right ? .rightMouseDown : .leftMouseDown, start, right ? .right : .left)
            Thread.sleep(forTimeInterval: 0.08)
            try mouse(right ? .rightMouseUp : .leftMouseUp, start, right ? .right : .left)
        } else if command == "drag" {
            let end = try CGPoint(x: coord(3), y: coord(4))
            recordMotion("before", start)
            try mouse(.leftMouseDown, start)
            for step in 1...30 {
                let t = Double(step) / 30
                let point = CGPoint(x: start.x + (end.x-start.x)*t, y: start.y + (end.y-start.y)*t)
                try mouse(.leftMouseDragged, point)
                Thread.sleep(forTimeInterval: 0.02)
                if step % 10 == 0 { recordMotion("held", point) }
            }
            try mouse(.leftMouseUp, end)
            if trackedWindow != nil {
                for _ in 0..<12 {
                    Thread.sleep(forTimeInterval: 0.04)
                    recordMotion("released", end)
                }
            }
        }
        Thread.sleep(forTimeInterval: 0.15)
        let pointer = CGEvent(source: nil)?.location ?? CGPoint(x: -1, y: -1)
        emit(["ok": true, "pointerX": pointer.x, "pointerY": pointer.y, "motion": motion])
    case "screenshot", "screenshot-window":
        guard CGPreflightScreenCaptureAccess() else { try fail("UNTESTED: Screen Recording permission is required for the host terminal / ui-driver") }
        let path = try arg(1)
        let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = command == "screenshot-window" ? ["-x", "-l", try arg(2), path] : ["-x", path]
        try process.run(); process.waitUntilExit()
        guard process.terminationStatus == 0, let image = NSImage(contentsOfFile: path), image.size.width > 0 else { try fail("Screenshot missing or invalid") }
        emit(["path": path, "width": image.size.width, "height": image.size.height])
    default: try fail("Unknown command: \(command)")
    }
} catch {
    let message = (error as? DriverError)?.message ?? String(describing: error)
    emit(["error": message]); exit(message.hasPrefix("UNTESTED:") ? 77 : 1)
}
