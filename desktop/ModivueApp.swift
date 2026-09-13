import AppKit
import Darwin
import Foundation
import WebKit
import UserNotifications

final class IslandPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class IslandWebView: WKWebView {
    private var hoverTracking: NSTrackingArea?
    private var pointerTimer: Timer?
    var dragRect = NSRect.zero
    var secondaryDragRect = NSRect.zero
    var onDragMoved: ((NSPoint) -> Void)?
    var onDragEnded: ((NSPoint) -> Void)?
    var onTitleClick: (() -> Void)?
    var onBufferClick: (() -> Void)?
    private var dragging = false
    private var pendingDrag = false
    private var dragStartPointer = NSPoint.zero
    private var dragStartOrigin = NSPoint.zero
    private var bufferGesture = false
    private(set) var dragPhase = "idle"

    private func screenPoint(for event: NSEvent) -> NSPoint {
        guard let point = event.cgEvent?.location, let screen = NSScreen.screens.first else { return NSEvent.mouseLocation }
        return NSPoint(x: point.x, y: screen.frame.maxY - point.y)
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        let local = convert(point, from: superview)
        if dragRect.contains(local) || secondaryDragRect.contains(local) { return self }
        return super.hitTest(point)
    }

    override func mouseDown(with event: NSEvent) {
        let local = convert(event.locationInWindow, from: nil)
        if dragRect.contains(local) || secondaryDragRect.contains(local) {
            // The native title strip owns both gestures. WebKit's internal
            // content view cannot receive clicks intercepted by hitTest.
            pendingDrag = true
            dragging = false
            dragPhase = "pending"
            dragStartPointer = screenPoint(for: event)
            dragStartOrigin = window?.frame.origin ?? .zero
            bufferGesture = secondaryDragRect.contains(local)
            evaluateJavaScript("window.modivue?.nativeDrag?.('pressed', \(bufferGesture))")
        } else {
            super.mouseDown(with: event)
        }
    }

    override func mouseDragged(with event: NSEvent) {
        let pointer = screenPoint(for: event)
        if pendingDrag && !dragging {
            let distance = hypot(pointer.x - dragStartPointer.x, pointer.y - dragStartPointer.y)
            guard distance >= 4 else { return }
            dragging = true
            dragPhase = "started"
        }
        guard dragging else { super.mouseDragged(with: event); return }
        evaluateJavaScript("window.modivue?.nativeDrag?.('dragging', \(bufferGesture))")
        onDragMoved?(NSPoint(x: dragStartOrigin.x + pointer.x - dragStartPointer.x,
            y: dragStartOrigin.y + pointer.y - dragStartPointer.y))
    }

    override func mouseUp(with event: NSEvent) {
        guard dragging else {
            let titleClick = pendingDrag
            pendingDrag = false
            evaluateJavaScript("window.modivue?.nativeDrag?.('idle', \(bufferGesture))")
            if titleClick { if bufferGesture { onBufferClick?() } else { onTitleClick?() } }
            else { super.mouseUp(with: event) }
            return
        }
        let pointer = screenPoint(for: event)
        onDragMoved?(NSPoint(x: dragStartOrigin.x + pointer.x - dragStartPointer.x,
            y: dragStartOrigin.y + pointer.y - dragStartPointer.y))
        dragging = false
        pendingDrag = false
        dragPhase = "released"
        onDragEnded?(pointer)
        evaluateJavaScript("window.modivue?.nativeDrag?.('idle', \(bufferGesture))")
        updateHover()
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        pointerTimer?.invalidate()
        pointerTimer = nil
        guard window != nil else { return }
        // WebKit may consume tracking events while this nonactivating panel
        // is not key. Sample the actual pointer without changing focus.
        let timer = Timer(timeInterval: 0.08, repeats: true) { [weak self] _ in self?.updateHover() }
        RunLoop.main.add(timer, forMode: .common)
        pointerTimer = timer
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let hoverTracking { removeTrackingArea(hoverTracking) }
        let tracking = NSTrackingArea(rect: bounds,
            options: [.mouseMoved, .mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self)
        addTrackingArea(tracking)
        hoverTracking = tracking
    }

    override func mouseEntered(with event: NSEvent) { updateHover() }
    override func mouseMoved(with event: NSEvent) { updateHover() }
    override func mouseExited(with event: NSEvent) {
        guard !dragging, let window, !window.frame.contains(NSEvent.mouseLocation) else { return }
        evaluateJavaScript("window.modivue?.nativeHover?.(null)")
    }

    func updateHover() {
        guard !dragging, let window else { return }
        guard window.frame.contains(NSEvent.mouseLocation) else {
            evaluateJavaScript("window.modivue?.nativeHover?.(null)")
            return
        }
        let point = convert(window.convertPoint(fromScreen: NSEvent.mouseLocation), from: nil)
        let y = isFlipped ? point.y : bounds.height - point.y
        evaluateJavaScript("window.modivue?.nativeHover?.({clientX:\(point.x),clientY:\(y)})")
    }
}

@main
final class ModivueApp: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UNUserNotificationCenterDelegate {
    private var serverProcess: Process?
    private var baseURL: URL!
    private var islandWindow: NSPanel?
    private var mainWindow: NSWindow?
    private var islandWebView: WKWebView?
    private var mainWebView: WKWebView?
    private var statusItem: NSStatusItem?
    private var isQuitting = false
    private var pendingView: String?
    private var pendingModelID: String?
    private var islandAutoHidden = false
    private var mainLoaded = false
    private var islandOnLeft = false
    // Keep the native panel close to the island content. A full-screen
    // transparent WebView can be composited as an opaque black rectangle.
    private var islandContentHeight: CGFloat = 420
    private var islandTourActive = false
    private var pendingCollapse: DispatchWorkItem?

    static func main() {
        let application = NSApplication.shared
        let delegate = ModivueApp()
        application.delegate = delegate
        application.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        UNUserNotificationCenter.current().delegate = self
        NSApp.setActivationPolicy(.regular)
        configureStatusItem()
        do {
            try startServer()
            waitForServer(attempt: 0)
        } catch {
            showLaunchError(error.localizedDescription)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        isQuitting = true
        serverProcess?.terminate()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if flag {
            islandWindow?.orderFrontRegardless()
        } else {
            openDashboard()
        }
        return true
    }

    private func configureStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if #available(macOS 11.0, *) {
            item.button?.image = NSImage(systemSymbolName: "waveform.path.ecg", accessibilityDescription: "Modivue")
        } else {
            item.button?.title = "M"
        }
        item.button?.toolTip = "Modivue"
        let menu = NSMenu()
        menu.addItem(withTitle: localizedMenuTitle("打开分析窗口", "Open Dashboard"), action: #selector(openDashboard), keyEquivalent: "o").target = self
        menu.addItem(withTitle: localizedMenuTitle("显示灵动岛", "Show Island"), action: #selector(showIsland), keyEquivalent: "i").target = self
        menu.addItem(.separator())
        menu.addItem(withTitle: localizedMenuTitle("退出 Modivue", "Quit Modivue"), action: #selector(quitApplication), keyEquivalent: "q").target = self
        item.menu = menu
        statusItem = item
    }

    private var interfaceEnglish = Locale.preferredLanguages.first?.hasPrefix("zh") == false
    private func localizedMenuTitle(_ chinese: String, _ english: String) -> String { interfaceEnglish ? english : chinese }

    private func startServer() throws {
        guard let resources = Bundle.main.resourceURL else { throw LaunchError(localizedMenuTitle("应用资源目录不可用", "Application resources are unavailable")) }
        let node = resources.appendingPathComponent("runtime/node")
        let application = resources.appendingPathComponent("app")
        let server = application.appendingPathComponent("server.mjs")
        guard FileManager.default.isExecutableFile(atPath: node.path), FileManager.default.fileExists(atPath: server.path) else {
            throw LaunchError(localizedMenuTitle("应用包缺少监测运行时", "The app bundle is missing the monitoring runtime"))
        }

        let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true).appendingPathComponent("Modivue", isDirectory: true)
        try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
        let port = availablePort()
        baseURL = URL(string: "http://127.0.0.1:\(port)")!

        let process = Process()
        process.executableURL = node
        process.arguments = [server.path]
        process.currentDirectoryURL = application
        var environment = ProcessInfo.processInfo.environment
        // Finder launches do not inherit a terminal's Homebrew search path.
        // The bundled service still needs the installed Herdr executable.
        let searchPaths = (environment["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin").split(separator: ":").map(String.init)
        environment["PATH"] = (searchPaths + ["/opt/homebrew/bin", "/usr/local/bin"].filter { !searchPaths.contains($0) }).joined(separator: ":")
        environment["MODIVUE_PORT"] = String(port)
        environment["MODIVUE_DATA_DIR"] = support.path
        environment["MODIVUE_LANGUAGES"] = Locale.preferredLanguages.joined(separator: ",")
        process.environment = environment
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        serverProcess = process
    }

    private func availablePort() -> UInt16 {
        let descriptor = socket(AF_INET, SOCK_STREAM, 0)
        guard descriptor >= 0 else { return 4173 }
        defer { close(descriptor) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bound == 0 else { return 4173 }
        var length = socklen_t(MemoryLayout<sockaddr_in>.size)
        let resolved = withUnsafeMutablePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                getsockname(descriptor, $0, &length)
            }
        }
        return resolved == 0 ? UInt16(bigEndian: address.sin_port) : 4173
    }

    private func waitForServer(attempt: Int) {
        guard !isQuitting else { return }
        guard attempt < 80 else {
            showLaunchError(localizedMenuTitle("本地监测服务未能启动", "The local monitoring service failed to start"))
            return
        }
        URLSession.shared.dataTask(with: baseURL.appendingPathComponent("api/config")) { [weak self] _, response, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                if (response as? HTTPURLResponse)?.statusCode == 200 {
                    self.createIslandWindow()
                } else {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { self.waitForServer(attempt: attempt + 1) }
                }
            }
        }.resume()
    }

    private func webView(mode: String) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(self, name: "modivue")
        if let data = try? JSONSerialization.data(withJSONObject: Locale.preferredLanguages), let languages = String(data: data, encoding: .utf8) {
            controller.addUserScript(WKUserScript(source: "window.modivueLanguages = \(languages);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        let view = mode == "island" ? IslandWebView(frame: .zero, configuration: configuration) : WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self
        view.uiDelegate = self
        view.setValue(false, forKey: "drawsBackground")
        view.underPageBackgroundColor = .clear
        view.load(URLRequest(url: URL(string: "\(baseURL.absoluteString)/?desktop=\(mode)")!))
        return view
    }

    private func createIslandWindow() {
        guard islandWindow == nil else { return }
        let size = islandSize(expanded: false)
        let panel = IslandPanel(contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .statusBar
        panel.hidesOnDeactivate = false
        panel.isFloatingPanel = true
        panel.acceptsMouseMovedEvents = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.isReleasedWhenClosed = false
        panel.isMovableByWindowBackground = false
        panel.delegate = self
        let view = webView(mode: "island")
        (view as? IslandWebView)?.onDragMoved = { [weak self] origin in self?.islandWindow?.setFrameOrigin(origin) }
        (view as? IslandWebView)?.onDragEnded = { [weak self] pointer in self?.snapIsland(pointer: pointer) }
        (view as? IslandWebView)?.onTitleClick = { [weak self] in self?.openDashboard() }
        (view as? IslandWebView)?.onBufferClick = { [weak self] in
            self?.islandWebView?.evaluateJavaScript("window.modivue?.showAllAgents?.()")
        }
        let surface = NSView(frame: NSRect(origin: .zero, size: size))
        surface.autoresizesSubviews = false
        surface.wantsLayer = true
        surface.layer?.masksToBounds = true
        panel.contentView = surface
        surface.addSubview(view)
        islandWindow = panel
        islandWebView = view
        layoutIslandSurface()
        placeIsland(panel, size: size)
        panel.orderFrontRegardless()
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = false
        panel.begin { response in completionHandler(response == .OK ? panel.urls : nil) }
    }

    private func islandSize(expanded: Bool) -> NSSize {
        let screenHeight = (NSScreen.main?.visibleFrame.height ?? 720) - 40
        // The visible rail controls its own height. Reserve transparent space
        // for history without shifting the model under the pointer.
        let height = min(islandTourActive ? 760 : max(420, islandContentHeight), screenHeight)
        return NSSize(width: expanded || islandTourActive ? 570 : 112, height: height)
    }

    private func placeIsland(_ panel: NSPanel, size: NSSize) {
        let visible = (panel.screen ?? NSScreen.main)?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
        panel.setFrame(NSRect(x: visible.maxX - size.width, y: visible.midY - size.height / 2,
            width: size.width, height: size.height), display: true)
    }

    private func resizeIsland(expanded: Bool) {
        guard let panel = islandWindow else { return }
        let oldFrame = panel.frame
        let size = islandSize(expanded: expanded)
        guard oldFrame.size != size else { return }
        let next = NSRect(x: islandOnLeft ? oldFrame.minX : oldFrame.maxX - size.width, y: oldFrame.midY - size.height / 2,
            width: size.width, height: size.height)
        // The visible rail animates in CSS; resize its transparent host without
        // an additional native size animation.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        panel.setFrame(next, display: false)
        layoutIslandSurface()
        CATransaction.commit()
        panel.displayIfNeeded()
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.islandWebView?.evaluateJavaScript("window.modivue?.reportIslandLayout?.()")
            (self.islandWebView as? IslandWebView)?.updateHover()
        }
    }

    private func layoutIslandSurface() {
        guard let panel = islandWindow, let view = islandWebView else { return }
        let width = panel.frame.width
        view.autoresizingMask = []
        view.frame = NSRect(x: 0, y: 0,
            width: width, height: panel.contentView?.bounds.height ?? panel.frame.height)
    }

    private func snapIsland(pointer: NSPoint) {
        guard let panel = islandWindow, let view = islandWebView as? IslandWebView,
              let screen = NSScreen.screens.first(where: { $0.frame.contains(pointer) }) ?? panel.screen ?? NSScreen.main else { return }
        let visible = screen.visibleFrame
        let oldLeft = islandOnLeft
        let railCenter = oldLeft ? panel.frame.minX + 44 : panel.frame.maxX - 44
        let nextSide = railCenter < visible.midX
        if islandOnLeft != nextSide {
            islandOnLeft = nextSide
            // Preserve the visible rail's position when its side changes inside
            // the transparent WebView, then animate only the native window.
            let offset = panel.frame.width - 100
            panel.setFrameOrigin(NSPoint(x: panel.frame.minX + (nextSide ? offset : -offset), y: panel.frame.minY))
            layoutIslandSurface()
            view.evaluateJavaScript("window.modivue?.setIslandSide?.('\(islandOnLeft ? "left" : "right")')")
        }
        let origin = NSPoint(x: islandOnLeft ? visible.minX : visible.maxX - panel.frame.width,
            y: min(max(panel.frame.minY, visible.minY), visible.maxY - panel.frame.height))
        NSAnimationContext.runAnimationGroup { context in
            context.duration = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? 0 : 0.36
            context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
            // NSWindow does not consistently animate `setFrameOrigin` for a
            // borderless nonactivating panel. Animate the complete frame so
            // the release snap always reaches the screen edge.
            let frame = NSRect(origin: origin, size: panel.frame.size)
            panel.animator().setFrame(frame, display: true)
        }
    }

    @objc private func openDashboard() {
        if mainWindow == nil {
            let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
            let width = min(1320, visible.width - 80)
            let height = min(860, visible.height - 70)
            let window = NSWindow(contentRect: NSRect(x: visible.midX - width / 2, y: visible.midY - height / 2,
                width: width, height: height), styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered, defer: false)
            window.title = "Modivue"
            window.isMovableByWindowBackground = false
            window.isRestorable = false
            window.minSize = NSSize(width: 1080, height: 620)
            window.isReleasedWhenClosed = false
            window.delegate = self
            let view = webView(mode: "main")
            let surface = NSView()
            window.contentView = surface
            surface.addSubview(view)
            view.translatesAutoresizingMaskIntoConstraints = false
            let layout = window.contentLayoutGuide as! NSLayoutGuide
            NSLayoutConstraint.activate([
                view.leadingAnchor.constraint(equalTo: layout.leadingAnchor),
                view.trailingAnchor.constraint(equalTo: layout.trailingAnchor),
                view.topAnchor.constraint(equalTo: layout.topAnchor),
                view.bottomAnchor.constraint(equalTo: layout.bottomAnchor)
            ])
            mainWindow = window
            mainWebView = view
        }
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        mainWindow?.makeKeyAndOrderFront(nil)
        mainWindow?.orderFrontRegardless()
        if mainLoaded { applyPendingNavigation() }
    }

    @objc private func showIsland() { islandWindow?.orderFrontRegardless() }

    @objc private func quitApplication() {
        isQuitting = true
        NSApp.terminate(nil)
    }

    func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
        let menu = NSMenu()
        menu.addItem(withTitle: localizedMenuTitle("打开分析窗口", "Open Dashboard"), action: #selector(openDashboard), keyEquivalent: "")
        menu.addItem(withTitle: localizedMenuTitle("显示灵动岛", "Show Island"), action: #selector(showIsland), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: localizedMenuTitle("退出 Modivue", "Quit Modivue"), action: #selector(quitApplication), keyEquivalent: "")
        menu.items.forEach { $0.target = self }
        return menu
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if sender === mainWindow {
            sender.orderOut(nil)
            islandWindow?.orderFrontRegardless()
            return false
        }
        return true
    }

    func windowDidResignKey(_ notification: Notification) {
        if notification.object as? NSWindow === mainWindow { mainWebView?.evaluateJavaScript("document.body.classList.remove('window-focused')") }
        if notification.object as? NSWindow === islandWindow { islandWebView?.evaluateJavaScript("window.modivue?.nativeFocus?.(false)") }
    }

    func windowDidBecomeKey(_ notification: Notification) {
        if notification.object as? NSWindow === mainWindow { mainWebView?.evaluateJavaScript("document.body.classList.add('window-focused')") }
        if notification.object as? NSWindow === islandWindow { islandWebView?.evaluateJavaScript("window.modivue?.nativeFocus?.(true)") }
    }

    func windowDidResize(_ notification: Notification) {
        if notification.object as? NSWindow === islandWindow { layoutIslandSurface() }
    }

    private func reply(_ webView: WKWebView?, requestID: String, result: [String: Any]) {
        var payload = result; payload["requestId"] = requestID
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { webView?.evaluateJavaScript("window.modivueNativeReply?.(\(json))") }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "modivue", let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if type == "ui-evidence", let directory = ProcessInfo.processInfo.environment["MODIVUE_UI_ARTIFACTS"] {
            var evidence = body
            evidence["dragPhase"] = (islandWebView as? IslandWebView)?.dragPhase
            evidence["islandSide"] = islandOnLeft ? "left" : "right"
            evidence["recordedAt"] = Date().timeIntervalSince1970
            if let panel = islandWindow {
                evidence["nativeFrame"] = ["x": panel.frame.minX, "y": panel.frame.minY,
                    "width": panel.frame.width, "height": panel.frame.height]
            }
            if message.webView === mainWebView, let window = mainWindow, let view = mainWebView {
                evidence["mainWebFrame"] = ["x": view.frame.minX, "y": view.frame.minY, "width": view.frame.width, "height": view.frame.height]
                evidence["mainContentLayout"] = ["x": window.contentLayoutRect.minX, "y": window.contentLayoutRect.minY, "width": window.contentLayoutRect.width, "height": window.contentLayoutRect.height]
                evidence["mainAppearance"] = window.effectiveAppearance.name.rawValue
            }
            if let view = islandWebView {
                // UI-driver coordinates are relative to the native panel, not the clipped web surface.
                func panelRect(_ rect: [String: Any]) -> [String: Any] {
                    var result = rect
                    for key in ["x", "left", "right"] {
                        if let value = rect[key] as? Double { result[key] = value + view.frame.minX }
                    }
                    return result
                }
                if let rail = body["rail"] as? [String: Any] { evidence["rail"] = panelRect(rail) }
                if let models = body["models"] as? [[String: Any]] {
                    evidence["models"] = models.map { model in
                        var result = model
                        if let rect = model["rect"] as? [String: Any] { result["rect"] = panelRect(rect) }
                        return result
                    }
                }
                evidence["surfaceX"] = view.frame.minX
                evidence["surfaceSize"] = ["width": view.frame.width, "height": view.frame.height]
            }
            if let data = try? JSONSerialization.data(withJSONObject: evidence, options: .prettyPrinted) {
                let filename = message.webView === mainWebView ? "main-geometry.json" : "native-geometry.json"
                try? data.write(to: URL(fileURLWithPath: directory).appendingPathComponent(filename), options: .atomic)
            }
            return
        }
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.host == "127.0.0.1",
              message.frameInfo.request.url?.port == baseURL.port else { return }
        switch type {
        case "notification-permission":
            guard let id = body["requestId"] as? String else { return }
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
                self.reply(message.webView, requestID: id, result: error.map { ["error": $0.localizedDescription] } ?? ["granted": granted])
            }
        case "notify":
            let content = UNMutableNotificationContent()
            content.title = body["title"] as? String ?? "Modivue"
            content.body = body["body"] as? String ?? ""
            content.sound = .default
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: body["id"] as? String ?? UUID().uuidString, content: content, trigger: nil)) { error in
                if let id = body["requestId"] as? String { self.reply(message.webView, requestID: id, result: error.map { ["error": $0.localizedDescription] } ?? ["sent": true]) }
            }
        case "export":
            guard let id = body["requestId"] as? String, let text = body["text"] as? String,
                  let name = body["filename"] as? String, let window = message.webView?.window else { return }
            let panel = NSSavePanel()
            panel.nameFieldStringValue = URL(fileURLWithPath: name).lastPathComponent
            panel.canCreateDirectories = true
            if let directory = ProcessInfo.processInfo.environment["MODIVUE_UI_ARTIFACTS"] { panel.directoryURL = URL(fileURLWithPath: directory) }
            panel.beginSheetModal(for: window) { response in
                guard response == .OK, let url = panel.url else { self.reply(message.webView, requestID: id, result: ["cancelled": true]); return }
                do {
                    try text.write(to: url, atomically: true, encoding: .utf8)
                    self.reply(message.webView, requestID: id, result: ["saved": true])
                } catch { self.reply(message.webView, requestID: id, result: ["error": error.localizedDescription]) }
            }
        case "locale":
            interfaceEnglish = body["locale"] as? String == "en"
            for item in statusItem?.menu?.items ?? [] {
                if item.action == #selector(openDashboard) { item.title = localizedMenuTitle("打开分析窗口", "Open Dashboard") }
                if item.action == #selector(showIsland) { item.title = localizedMenuTitle("显示灵动岛", "Show Island") }
                if item.action == #selector(quitApplication) { item.title = localizedMenuTitle("退出 Modivue", "Quit Modivue") }
            }
        case "appearance":
            if message.webView === mainWebView {
                mainWindow?.appearance = NSAppearance(named: body["dark"] as? Bool == true ? .darkAqua : .aqua)
                mainWindow?.titlebarAppearsTransparent = true
                if let hex = body["background"] as? String, hex.count == 7, hex.hasPrefix("#"), let rgb = UInt32(hex.dropFirst(), radix: 16) {
                    mainWindow?.backgroundColor = NSColor(srgbRed: CGFloat((rgb >> 16) & 255) / 255, green: CGFloat((rgb >> 8) & 255) / 255, blue: CGFloat(rgb & 255) / 255, alpha: 1)
                }
            }
        case "start-island-tour":
            pendingCollapse?.cancel()
            islandTourActive = true
            resizeIsland(expanded: true)
            islandWindow?.makeKeyAndOrderFront(nil)
            islandWebView?.evaluateJavaScript("window.modivue?.startTour?.()")
        case "island-tour":
            islandTourActive = body["active"] as? Bool == true
            pendingCollapse?.cancel()
            resizeIsland(expanded: islandTourActive)
        case "island-layout":
            if let view = islandWebView as? IslandWebView,
               let x = body["x"] as? Double, let y = body["y"] as? Double, let width = body["width"] as? Double {
                view.dragRect = NSRect(x: x, y: view.isFlipped ? y : view.bounds.height - y - 20, width: width, height: 20)
                if let buffer = body["buffer"] as? [String: Any], let bx = buffer["x"] as? Double,
                   let by = buffer["y"] as? Double, let bw = buffer["width"] as? Double, let bh = buffer["height"] as? Double {
                    view.secondaryDragRect = NSRect(x: bx, y: view.isFlipped ? by : view.bounds.height - by - bh, width: bw, height: bh)
                } else { view.secondaryDragRect = .zero }
                if let reportedHeight = body["height"] as? Double, reportedHeight.isFinite {
                    let screenHeight = (islandWindow?.screen ?? NSScreen.main)?.visibleFrame.height ?? 720
                    let nextHeight = min(max(420, CGFloat(reportedHeight) + 32), screenHeight - 40)
                    if abs(nextHeight - islandContentHeight) > 1 {
                        islandContentHeight = nextHeight
                        resizeIsland(expanded: (islandWindow?.frame.width ?? 0) > 200)
                    }
                }
            }
        case "island-hover":
            pendingCollapse?.cancel()
            if body["expanded"] as? Bool == true {
                resizeIsland(expanded: true)
            } else {
                let collapse = DispatchWorkItem { [weak self] in self?.resizeIsland(expanded: false) }
                pendingCollapse = collapse
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: collapse)
            }
        case "island-visibility":
            if let visible = body["visible"] as? Bool, visible != !islandAutoHidden {
                islandAutoHidden = !visible
                if visible { islandWindow?.orderFrontRegardless() } else { islandWindow?.orderOut(nil) }
            }
        case "open-main":
            pendingView = body["view"] as? String
            pendingModelID = body["modelId"] as? String
            openDashboard()
        case "main-ready":
            if message.webView === mainWebView {
                mainLoaded = true
                applyPendingNavigation()
            }
        default: break
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === islandWebView {
            webView.evaluateJavaScript("window.modivue?.nativeFocus?.(\(islandWindow?.isKeyWindow == true))")
        }
        if webView === islandWebView && ProcessInfo.processInfo.environment["MODIVUE_UI_ARTIFACTS"] != nil {
            webView.evaluateJavaScript("""
                let lastPointer = null;
                document.addEventListener('pointermove', event => { lastPointer = {x:event.clientX,y:event.clientY}; });
                setInterval(() => window.webkit.messageHandlers.modivue.postMessage({type:'ui-evidence',
                  viewport:{width:innerWidth,height:innerHeight}, pointer:lastPointer,
                  rail:document.querySelector('#quick-island').getBoundingClientRect().toJSON(),
                  buffer:document.querySelector('#island-buffer').getBoundingClientRect().toJSON(),
                  stage:document.querySelector('.island-stage').getBoundingClientRect().toJSON(),
                  models:[...document.querySelectorAll('[data-island-model]')].map(el=>({id:el.dataset.identity,label:el.getAttribute('aria-label'),rect:el.getBoundingClientRect().toJSON()})),
                  ringCount:document.querySelectorAll('#island-models .ring-value').length,
                  focusCount:document.querySelectorAll('#island-focus .ring-value').length,
                  islandMode:document.body.dataset.islandMode,
                  focusRects:[...document.querySelectorAll('[data-focus-metric]')].map(el=>el.getBoundingClientRect().toJSON()),
                  popoverRect:document.querySelector('#hover-popover').getBoundingClientRect().toJSON(),
                  tour:document.querySelector('.spotlight-card') ? {
                    title:document.querySelector('.spotlight-card strong').textContent,
                    rect:document.querySelector('.spotlight-card').getBoundingClientRect().toJSON()
                  } : null,
                  expanded:document.querySelector('#quick-island').classList.contains('expanded'),
                  popover:document.querySelector('#hover-popover').classList.contains('visible')}), 250);
                """)
        }
        if webView === mainWebView && ProcessInfo.processInfo.environment["MODIVUE_UI_ARTIFACTS"] != nil {
            webView.evaluateJavaScript("""
                setInterval(() => window.webkit.messageHandlers.modivue.postMessage({type:'ui-evidence',
                  topbar:document.querySelector(".topbar").getBoundingClientRect().toJSON(),
                  theme:document.body.dataset.themePreset, locale:document.documentElement.lang,
                  view:document.querySelector('.nav-item.active')?.dataset.view,
                  selectedId:document.querySelector('#model-strip .model-chip.active')?.dataset.modelId}), 250);
                """)
        }
    }

    private func applyPendingNavigation() {
        if let view = pendingView,
           ["overview", "models", "routes", "cache", "ttft", "quality", "alerts", "logs", "settings"].contains(view) {
            mainWebView?.evaluateJavaScript("window.modivue?.openView?.('\(view)')")
        }
        pendingView = nil
        if let modelID = pendingModelID,
           let data = try? JSONSerialization.data(withJSONObject: modelID, options: .fragmentsAllowed),
           let literal = String(data: data, encoding: .utf8) {
            mainWebView?.evaluateJavaScript("window.modivue?.selectModel?.(\(literal))")
        }
        pendingModelID = nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.host == "127.0.0.1" && url.port == baseURL.port {
            decisionHandler(.allow)
        } else {
            if navigationAction.navigationType == .linkActivated { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        }
    }

    private func showLaunchError(_ message: String) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = localizedMenuTitle("Modivue 无法启动", "Modivue could not start")
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
    }
}

private struct LaunchError: LocalizedError {
    let description: String
    init(_ description: String) { self.description = description }
    var errorDescription: String? { description }
}
