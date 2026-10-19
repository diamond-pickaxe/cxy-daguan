import AppKit
import Foundation
import Darwin

struct LaunchError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

// The signed application is immutable. User records live outside its bundle.
final class LocalService {
    let root: URL
    let data: URL
    private let process = Process()
    private let input = Pipe()
    private let output = Pipe()
    private let errors = Pipe()
    private var lockFD: Int32 = -1
    private let mutex = NSLock()
    private var stdout = ""
    private var stderr = ""
    private(set) var origin: URL?

    init(root: URL, data: URL) { self.root = root; self.data = data }

    func start() throws -> URL {
        try FileManager.default.createDirectory(at: data, withIntermediateDirectories: true)
        lockFD = Darwin.open(data.appendingPathComponent("launcher.lock").path, O_CREAT | O_RDWR | O_CLOEXEC, S_IRUSR | S_IWUSR)
        guard lockFD >= 0, flock(lockFD, LOCK_EX | LOCK_NB) == 0 else {
            throw LaunchError(message: "应用已经在运行。请返回已打开的启动窗口，或先退出旧版。")
        }
        let ready = DispatchSemaphore(value: 0)
        process.executableURL = root.appendingPathComponent("runtime/node")
        process.arguments = [root.appendingPathComponent("server.mjs").path]
        process.currentDirectoryURL = data
        var env = ProcessInfo.processInfo.environment
        env.removeValue(forKey: "NODE_OPTIONS"); env.removeValue(forKey: "NODE_PATH")
        env["EXAM_PORT"] = "0"; env["EXAM_LAUNCHER"] = "1"; env["EXAM_DATA_DIR"] = data.path
        process.environment = env
        process.standardInput = input; process.standardOutput = output; process.standardError = errors
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let bytes = handle.availableData
            guard let self = self, !bytes.isEmpty else { return }
            self.mutex.lock()
            self.stdout += String(decoding: bytes, as: UTF8.self)
            let complete = self.stdout.contains("YU_READY ") && self.stdout.contains("\n")
            self.mutex.unlock()
            if complete { ready.signal() }
        }
        errors.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let bytes = handle.availableData
            guard let self = self, !bytes.isEmpty else { return }
            self.mutex.lock()
            if self.stderr.count < 2000 { self.stderr += String(decoding: bytes, as: UTF8.self) }
            self.mutex.unlock()
        }
        process.terminationHandler = { _ in ready.signal() }
        do {
            try process.run()
            guard ready.wait(timeout: .now() + 30) == .success else { throw LaunchError(message: "启动超时，请退出后重试。") }
            mutex.lock(); let text = stdout; let details = stderr; mutex.unlock()
            guard process.isRunning,
                  let line = text.split(separator: "\n").first(where: { $0.hasPrefix("YU_READY ") }),
                  let address = URL(string: String(line.dropFirst(9)).trimmingCharacters(in: .whitespacesAndNewlines)),
                  address.scheme == "http", address.host == "127.0.0.1", address.port != nil,
                  address.path.isEmpty || address.path == "/" else {
                throw LaunchError(message: "本机服务未能启动。\n" + details)
            }
            origin = address
            return address
        } catch { stop(); throw error }
    }

    func stop() {
        if process.isRunning {
            try? input.fileHandleForWriting.write(contentsOf: Data("shutdown\n".utf8))
            try? input.fileHandleForWriting.close()
            let until = Date().addingTimeInterval(15)
            while process.isRunning && Date() < until { Thread.sleep(forTimeInterval: 0.05) }
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            process.waitUntilExit()
        }
        output.fileHandleForReading.readabilityHandler = nil
        errors.fileHandleForReading.readabilityHandler = nil
        if lockFD >= 0 { flock(lockFD, LOCK_UN); Darwin.close(lockFD); lockFD = -1 }
    }

    deinit { stop() }
}

func request(_ origin: URL, _ route: String, method: String = "GET", body: Data? = nil, etag: String? = nil) throws -> (Data, HTTPURLResponse) {
    var req = URLRequest(url: URL(string: route, relativeTo: origin)!); req.httpMethod = method; req.httpBody = body; req.timeoutInterval = 30
    if body != nil { req.setValue("application/json", forHTTPHeaderField: "Content-Type"); req.setValue(origin.absoluteString, forHTTPHeaderField: "Origin") }
    if let etag = etag { req.setValue(etag, forHTTPHeaderField: "If-Match") }
    let done = DispatchSemaphore(value: 0)
    var result: Result<(Data, HTTPURLResponse), Error>?
    let task = URLSession.shared.dataTask(with: req) { data, response, error in
        if let error = error { result = .failure(error) }
        else if let data = data, let response = response as? HTTPURLResponse { result = .success((data, response)) }
        else { result = .failure(LaunchError(message: "本机服务响应无效")) }
        done.signal()
    }
    task.resume()
    guard done.wait(timeout: .now() + 35) == .success else { task.cancel(); throw LaunchError(message: "测试请求超时") }
    return try result!.get()
}

func smoke(root: URL, data: URL) throws {
    var service = LocalService(root: root, data: data)
    defer { service.stop() }
    var origin = try service.start()
    let duplicate = LocalService(root: root, data: data)
    var duplicateBlocked = false
    do { _ = try duplicate.start() } catch { duplicateBlocked = true }
    duplicate.stop()
    guard duplicateBlocked else { throw LaunchError(message: "Concurrent application instance was not blocked") }
    for route in ["/", "/math/", "/408/", "/assets/subject-membership.json", "/data/questions.json"] {
        let (bytes, response) = try request(origin, route)
        guard response.statusCode == 200, !bytes.isEmpty else { throw LaunchError(message: "Smoke GET failed: " + route) }
        if route == "/data/questions.json" {
            guard let questions = try JSONSerialization.jsonObject(with: bytes) as? [Any], questions.count == 7083 else { throw LaunchError(message: "Math corpus incomplete") }
        }
    }
    let states: [(String, String)] = [
        ("/api/progress", "{\"version\":1,\"records\":{\"129\":{\"note\":\"macOS smoke\"}},\"history\":[],\"targetDate\":\"\"}"),
        ("/api/408/progress", "{\"version\":1,\"mastery\":{\"800\":1},\"notes\":{},\"attempts\":{},\"history\":{},\"answers\":{},\"collections\":[]}")
    ]
    for (route, body) in states {
        let (_, old) = try request(origin, route)
        let (_, saved) = try request(origin, route, method: "PUT", body: Data(body.utf8), etag: old.value(forHTTPHeaderField: "ETag"))
        guard saved.statusCode == 200 else { throw LaunchError(message: "Smoke save failed: " + route) }
    }
    service.stop()
    service = LocalService(root: root, data: data); origin = try service.start()
    for (route, _) in states {
        let (bytes, response) = try request(origin, route)
        let value = String(decoding: bytes, as: UTF8.self)
        guard response.statusCode == 200, value.contains(route.contains("408") ? "800" : "macOS smoke") else { throw LaunchError(message: "Restart lost data: " + route) }
    }
    print("MAC_SMOKE_OK: full corpus, math/408 persistence, restart and graceful shutdown")
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    let service: LocalService
    var window: NSWindow!
    var status: NSTextField!
    var openButton: NSButton!
    var quitting = false
    init(service: LocalService) { self.service = service }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu(); let item = NSMenuItem(); let appMenu = NSMenu()
        appMenu.addItem(withTitle: "退出宇的大观本地版", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu = appMenu; menu.addItem(item); NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 440, height: 200), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "宇的大观本地版"; window.isReleasedWhenClosed = false
        let title = NSTextField(labelWithString: "数学 + 408 · 离线学习")
        title.font = NSFont.systemFont(ofSize: 21, weight: .semibold)
        status = NSTextField(wrappingLabelWithString: "正在打开本机题库…")
        openButton = NSButton(title: "打开学习页面", target: self, action: #selector(openPage)); openButton.isEnabled = false
        let folderButton = NSButton(title: "打开数据文件夹", target: self, action: #selector(openData))
        let quitButton = NSButton(title: "退出程序", target: NSApp, action: #selector(NSApplication.terminate(_:)))
        let buttons = NSStackView(views: [openButton, folderButton, quitButton]); buttons.orientation = .horizontal; buttons.spacing = 10
        let stack = NSStackView(views: [title, status, buttons]); stack.orientation = .vertical; stack.alignment = .leading; stack.spacing = 22; stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -24), stack.centerYAnchor.constraint(equalTo: window.contentView!.centerYAnchor)])
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        DispatchQueue.global().async {
            do {
                _ = try self.service.start()
                DispatchQueue.main.async { if !self.quitting { self.status.stringValue = "已就绪。保留此窗口即可在浏览器中学习。"; self.openButton.isEnabled = true; self.openPage() } }
            } catch {
                DispatchQueue.main.async { if !self.quitting { self.status.stringValue = "启动失败"; let alert = NSAlert(); alert.messageText = "无法打开学习系统"; alert.informativeText = error.localizedDescription; alert.runModal(); NSApp.terminate(nil) } }
            }
        }
    }
    @objc func openPage() { if let origin = service.origin { NSWorkspace.shared.open(origin) } }
    @objc func openData() { NSWorkspace.shared.open(service.data) }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window.makeKeyAndOrderFront(nil); openPage(); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if quitting { return .terminateLater }; quitting = true
        status?.stringValue = "正在结束本机服务…"; openButton?.isEnabled = false
        DispatchQueue.global().async { self.service.stop(); DispatchQueue.main.async { sender.reply(toApplicationShouldTerminate: true) } }
        return .terminateLater
    }
}

let root = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/site")
if CommandLine.arguments.contains("--smoke-test") {
    guard let i = CommandLine.arguments.firstIndex(of: "--data-dir"), i + 1 < CommandLine.arguments.count else { fputs("Missing isolated smoke data directory\n", stderr); exit(2) }
    do { try smoke(root: root, data: URL(fileURLWithPath: CommandLine.arguments[i+1], isDirectory: true)); exit(0) }
    catch { fputs("\(error.localizedDescription)\n", stderr); exit(1) }
}
let data = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("cxy-daguan", isDirectory: true)
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate(service: LocalService(root: root, data: data))
app.delegate = delegate
app.run()
