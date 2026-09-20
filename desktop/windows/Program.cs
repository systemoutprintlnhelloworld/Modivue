using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Modivue;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        try { Application.Run(new MonitorContext(Environment.GetCommandLineArgs().Contains("--background"))); }
        catch (Exception error) { MessageBox.Show(error.Message, "Modivue", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}

internal sealed class IslandForm : Form
{
    public bool ClickThrough { get; set; }
    private (RectangleF Bounds, float Radius)[] surfaces = [];

    public void SetSurfaces(IEnumerable<(RectangleF Bounds, float Radius)> value)
    {
        surfaces = value.ToArray();
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        // WebView2 draws in a child HWND. A color-key-only parent remains
        // transparent to native mouse input even under visible web content.
        // Back the interactive surfaces, leaving the surrounding desktop clear.
        using var brush = new SolidBrush(Color.FromArgb(20, 24, 32));
        var scale = DeviceDpi / 96f;
        e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        foreach (var (bounds, radius) in surfaces) {
            var rect = new RectangleF(bounds.X * scale, bounds.Y * scale, bounds.Width * scale, bounds.Height * scale);
            if (rect.Width <= 0 || rect.Height <= 0) continue;
            var diameter = Math.Clamp(radius * scale * 2, 0, Math.Min(rect.Width, rect.Height));
            if (diameter == 0) { e.Graphics.FillRectangle(brush, rect); continue; }
            using var path = new System.Drawing.Drawing2D.GraphicsPath();
            path.AddArc(rect.Left, rect.Top, diameter, diameter, 180, 90);
            path.AddArc(rect.Right - diameter, rect.Top, diameter, diameter, 270, 90);
            path.AddArc(rect.Right - diameter, rect.Bottom - diameter, diameter, diameter, 0, 90);
            path.AddArc(rect.Left, rect.Bottom - diameter, diameter, diameter, 90, 90);
            path.CloseFigure();
            e.Graphics.FillPath(brush, path);
        }
    }

    protected override void WndProc(ref Message message)
    {
        const int WM_NCHITTEST = 0x84, HTTRANSPARENT = -1;
        if (ClickThrough && message.Msg == WM_NCHITTEST) { message.Result = (IntPtr)HTTRANSPARENT; return; }
        base.WndProc(ref message);
    }
}

internal sealed class MonitorContext : ApplicationContext
{
    private const string StartupRegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string AppRegistryPath = @"Software\Modivue";
    private readonly Process service;
    private readonly Form main = new() { Text = "Modivue", Width = 1240, Height = 860, MinimumSize = new(820, 620) };
    private readonly IslandForm island = new() { Text = "Modivue Island", Width = 112, Height = 160, FormBorderStyle = FormBorderStyle.None,
        ShowInTaskbar = false, TopMost = true, BackColor = Color.Black, TransparencyKey = Color.Black };
    private readonly WebView2 mainWeb = new() { Dock = DockStyle.Fill };
    private readonly WebView2 islandWeb = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Transparent };
    private readonly NotifyIcon tray = new() { Text = "Modivue", Visible = true };
    private readonly ContextMenuStrip trayMenu = new();
    private readonly ToolStripItem menuOpen, menuIsland, menuExit;
    private readonly ToolStripMenuItem menuStartup;
    private readonly System.Windows.Forms.Timer pointer = new() { Interval = 16 };
    private readonly Uri origin;
    private readonly string payloadRoot;
    private readonly Icon appIcon;
    private bool mainReady;
    private string? pendingNavigation;
    private RectangleF rail = new(6, 18, 100, 20), islandBounds = new(6, 18, 100, 220), buffer;
    private float islandWidth = 112, islandExpandedWidth = 570, islandScale = 100, islandContentHeight = 160;
    private bool pressed, pendingDrag, dragging, resizing, expanded, right = true, exiting, ticking, bufferDrag, clickThrough, hasIslandLayout;
    private bool islandResizeModeActive, resizeRestoreExpanded, resizeRestoreRight, resizeRestoreClickThrough;
    private Rectangle resizeRestoreBounds;
    private Point dragStart, windowStart;
    private float resizeStartScale, resizeValue;
    private RectangleF resizeStartRail;
    private long dragPressedAt;
    private Point? snapStart, snapEnd;
    private long snapAt;
    private bool interfaceEnglish = !System.Globalization.CultureInfo.CurrentUICulture.TwoLetterISOLanguageName.Equals("zh", StringComparison.OrdinalIgnoreCase);
    private string Localized(string chinese, string english) => interfaceEnglish ? english : chinese;
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")] private static extern nint GetWindowLongPtr(nint window, int index);
    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")] private static extern nint SetWindowLongPtr(nint window, int index, nint value);

    public MonitorContext(bool background)
    {
        appIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? (Icon)SystemIcons.Application.Clone();
        main.Icon = appIcon; island.Icon = appIcon; tray.Icon = appIcon;
        // Node binds loopback only. The short reservation avoids choosing a fixed user port.
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
        origin = new($"http://127.0.0.1:{port}");
        payloadRoot = Path.Combine(AppContext.BaseDirectory, "resources");
        var start = new ProcessStartInfo(Path.Combine(payloadRoot, "runtime", "node.exe")) { WorkingDirectory = Path.Combine(payloadRoot, "app"),
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardError = true };
        start.ArgumentList.Add(Path.Combine(payloadRoot, "app", "server.mjs"));
        start.ArgumentList.Add("--desktop-parent");
        start.Environment["MODIVUE_PORT"] = port.ToString();
        start.Environment["MODIVUE_DATA_DIR"] = Environment.GetEnvironmentVariable("MODIVUE_DATA_DIR")
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Modivue");
        start.Environment["MODIVUE_LANGUAGES"] = System.Globalization.CultureInfo.CurrentUICulture.Name;
        service = Process.Start(start) ?? throw new InvalidOperationException(Localized("无法启动 Modivue 本地服务。", "Cannot start the local Modivue service."));
        main.Controls.Add(mainWeb); island.Controls.Add(islandWeb);
        main.FormClosing += (_, e) => { if (!exiting) { e.Cancel = true; main.Hide(); } };
        island.FormClosing += (_, e) => { if (!exiting) { e.Cancel = true; island.Hide(); } };
        menuOpen = trayMenu.Items.Add("Modivue", null, (_, _) => { main.Show(); main.Activate(); });
        menuIsland = trayMenu.Items.Add("", null, (_, _) => island.Show());
        menuStartup = new ToolStripMenuItem();
        menuStartup.Click += (_, _) => SetStartupEnabled(!StartupEnabled());
        trayMenu.Items.Add(menuStartup);
        menuExit = trayMenu.Items.Add("", null, (_, _) => ExitThread());
        tray.ContextMenuStrip = trayMenu; UpdateTrayMenu(System.Globalization.CultureInfo.CurrentUICulture.Name);
        tray.DoubleClick += (_, _) => { main.Show(); main.Activate(); };
        pointer.Tick += async (_, _) => await TickPointer();
        if (!background) main.Show();
        island.Show();
        var area = Screen.PrimaryScreen!.WorkingArea; island.Location = new(area.Right - island.Width, area.Top + 120);
        _ = Initialize();
    }

    private async Task Initialize()
    {
        try {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(1) };
            bool ready = false;
            for (int i = 0; i < 80 && !service.HasExited; i++) {
                try { using var response = await http.GetAsync(new Uri(origin, "/api/config")); ready = response.IsSuccessStatusCode; } catch (HttpRequestException) {} catch (TaskCanceledException) {}
                if (ready) break;
                await Task.Delay(250);
            }
            if (!ready) {
                var details = service.HasExited ? (await service.StandardError.ReadToEndAsync()).Trim() : "";
                if (details.Length > 1000) details = details[..1000];
                throw new InvalidOperationException($"{Localized("本地服务未能启动。", "Local service failed to start.")}{(details.Length > 0 ? $"\n\n{details}" : "")}");
            }
            var profile = Path.Combine(service.StartInfo.Environment["MODIVUE_DATA_DIR"]!, "WebView2");
            var environment = await CreateWebViewEnvironment(profile);
            if (environment is null) { ExitThread(); return; }
            await Prepare(mainWeb, environment, "main"); await Prepare(islandWeb, environment, "island");
            pointer.Start();
            PromptForStartup();
        } catch (Exception error) {
            MessageBox.Show(error.Message, "Modivue", MessageBoxButtons.OK, MessageBoxIcon.Error); ExitThread();
        }
    }

    private async Task<CoreWebView2Environment?> CreateWebViewEnvironment(string profile)
    {
        try { return await CoreWebView2Environment.CreateAsync(null, profile); }
        catch (WebView2RuntimeNotFoundException) {
            var bootstrapper = Path.Combine(payloadRoot, "prerequisites", "MicrosoftEdgeWebview2Setup.exe");
            if (!File.Exists(bootstrapper)) throw new InvalidOperationException(Localized(
                "缺少 Microsoft Edge WebView2 Runtime，安装组件也未随程序提供。请重新安装 Modivue。",
                "Microsoft Edge WebView2 Runtime is missing, and its installer was not packaged. Reinstall Modivue."));
            var install = MessageBox.Show(Localized(
                "Modivue 需要 Microsoft Edge WebView2 Runtime。是否现在从 Microsoft 下载并安装？",
                "Modivue requires Microsoft Edge WebView2 Runtime. Download and install it from Microsoft now?"),
                "Modivue", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (install != DialogResult.Yes) return null;
            using var process = Process.Start(new ProcessStartInfo(bootstrapper) { UseShellExecute = false, CreateNoWindow = true,
                ArgumentList = { "/silent", "/install" } }) ?? throw new InvalidOperationException(Localized(
                    "无法启动 WebView2 安装程序。", "Could not start the WebView2 installer."));
            await process.WaitForExitAsync();
            if (process.ExitCode != 0) throw new InvalidOperationException(Localized(
                $"WebView2 安装失败，退出码 {process.ExitCode}。", $"WebView2 installation failed with exit code {process.ExitCode}."));
            return await CoreWebView2Environment.CreateAsync(null, profile);
        }
    }

    private async Task Prepare(WebView2 web, CoreWebView2Environment environment, string mode)
    {
        await web.EnsureCoreWebView2Async(environment);
        await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync($"window.modivueLanguages = {JsonSerializer.Serialize(new[] { System.Globalization.CultureInfo.CurrentUICulture.Name })};");
        web.CoreWebView2.Settings.IsStatusBarEnabled = false;
        web.CoreWebView2.NewWindowRequested += (_, e) => { e.Handled = true; OpenExternal(e.Uri); };
        web.CoreWebView2.NavigationStarting += (_, e) => {
            if (!e.Uri.StartsWith(origin.AbsoluteUri, StringComparison.Ordinal)) { e.Cancel = true; OpenExternal(e.Uri); }
            else if (web == mainWeb) mainReady = false;
        };
        web.CoreWebView2.WebMessageReceived += async (_, e) => {
            if (!e.Source.StartsWith(origin.AbsoluteUri, StringComparison.Ordinal)) return;
            using var message = JsonDocument.Parse(e.WebMessageAsJson); var body = message.RootElement;
            if (!body.TryGetProperty("type", out var type)) return;
            switch (type.GetString()) {
                case "notification-permission":
                    await Reply(web, body.GetProperty("requestId").GetString()!, new { granted = true });
                    break;
                case "notify":
                    var wantsSystem = !body.TryGetProperty("system", out var system) || system.GetBoolean();
                    var wantsSound = body.TryGetProperty("sound", out var sound) && sound.GetBoolean();
                    if (wantsSound) {
                        var soundName = body.TryGetProperty("soundName", out var selectedSound) ? selectedSound.GetString() : "chime";
                        if (soundName == "urgent") System.Media.SystemSounds.Exclamation.Play();
                        else if (soundName == "subtle") System.Media.SystemSounds.Beep.Play();
                        else System.Media.SystemSounds.Asterisk.Play();
                    }
                    if (wantsSystem) tray.ShowBalloonTip(5000, body.GetProperty("title").GetString()!, body.GetProperty("body").GetString()!, ToolTipIcon.Info);
                    if (body.TryGetProperty("requestId", out var notificationId)) await Reply(web, notificationId.GetString()!, new { sent = true });
                    break;
                case "export":
                    var requestId = body.GetProperty("requestId").GetString()!;
                    using (var dialog = new SaveFileDialog { FileName = Path.GetFileName(body.GetProperty("filename").GetString()), RestoreDirectory = true }) {
                        if (dialog.ShowDialog(main) != DialogResult.OK) await Reply(web, requestId, new { cancelled = true });
                        else try {
                            await File.WriteAllTextAsync(dialog.FileName!, body.GetProperty("text").GetString(), new System.Text.UTF8Encoding(false));
                            await Reply(web, requestId, new { saved = true });
                        } catch (Exception error) { await Reply(web, requestId, new { error = error.Message }); }
                    }
                    break;
                case "locale":
                    UpdateTrayMenu(body.GetProperty("locale").GetString()!);
                    break;
                case "island-layout":
                    islandBounds = Rect(body);
                    if (body.TryGetProperty("visualHeight", out var visualHeight) && visualHeight.TryGetSingle(out var visualHeightValue) && float.IsFinite(visualHeightValue)) islandBounds.Height = visualHeightValue;
                    hasIslandLayout = islandBounds.Width > 0 && islandBounds.Height > 0;
                    rail = body.TryGetProperty("grip", out var grip) ? Rect(grip) : islandBounds;
                    if (body.TryGetProperty("scale", out var scaleValue)) islandScale = scaleValue.GetSingle();
                    islandWidth = islandBounds.Width;
                    if (body.TryGetProperty("buffer", out var b)) buffer = Rect(b);
                    var area = Screen.FromControl(island).WorkingArea;
                    if (!resizing && !islandResizeModeActive) {
                        var reportedHeight = body.GetProperty("height").GetSingle();
                        var visibleHeight = body.TryGetProperty("visualHeight", out var visual) && visual.TryGetSingle(out var nextVisualHeight) && float.IsFinite(nextVisualHeight)
                            ? nextVisualHeight : reportedHeight;
                        islandContentHeight = Math.Max(1, reportedHeight);
                        ResizeIslandHost(expanded, area, island.Top + island.Height / 2);
                    }
                    if (resizing || islandResizeModeActive) {
                        islandContentHeight = islandBounds.Height;
                        var width = Pixels(islandBounds.Width);
                        var height = Pixels(islandBounds.Height);
                        var x = islandResizeModeActive ? area.Left + (area.Width - width) / 2 : right ? island.Right - width : island.Left;
                        var y = islandResizeModeActive ? area.Top + (area.Height - height) / 2 : island.Top;
                        island.Bounds = new Rectangle(x, y, width, height);
                    }
                    if (body.TryGetProperty("surfaces", out var surfaces))
                        island.SetSurfaces(surfaces.EnumerateArray().Select(surface =>
                            (Rect(surface), surface.GetProperty("radius").GetSingle())));
                    break;
                case "island-interaction":
                    var requestedClickThrough = body.GetProperty("clickThrough").GetBoolean();
                    if (islandResizeModeActive) resizeRestoreClickThrough = requestedClickThrough;
                    else SetIslandClickThrough(requestedClickThrough);
                    if (requestedClickThrough && !islandResizeModeActive) await islandWeb.ExecuteScriptAsync("window.modivue?.nativeHover(null)");
                    break;
                case "island-size":
                    if (body.TryGetProperty("expandedWidth", out var expandedWidth) && expandedWidth.TryGetSingle(out var nextExpandedWidth) && float.IsFinite(nextExpandedWidth)) islandExpandedWidth = Math.Clamp(nextExpandedWidth, 320, 900);
                    if (!islandResizeModeActive) ResizeIslandHost(expanded, Screen.FromControl(island).WorkingArea, island.Top + island.Height / 2);
                    break;
                case "island-hover":
                    if (!islandResizeModeActive) {
                        expanded = body.GetProperty("expanded").GetBoolean();
                        ResizeIslandHost(expanded, Screen.FromControl(island).WorkingArea, island.Top + island.Height / 2);
                    }
                    break;
                case "open-main":
                    pendingNavigation = body.GetRawText();
                    if (main.WindowState == FormWindowState.Minimized) main.WindowState = FormWindowState.Normal;
                    main.Show(); main.Activate();
                    await ApplyPendingNavigation();
                    break;
                case "main-ready":
                    if (web == mainWeb) { mainReady = true; await ApplyPendingNavigation(); }
                    break;
                case "start-island-resize": await BeginIslandResizeMode(); break;
                case "start-island-tour": island.Show(); await islandWeb.ExecuteScriptAsync("window.modivue?.startTour()"); break;
            }
        };
        web.Source = new Uri(origin, $"/?desktop={mode}");
    }

    private async Task ApplyPendingNavigation()
    {
        if (!mainReady || pendingNavigation is null) return;
        var navigation = pendingNavigation;
        pendingNavigation = null;
        // ExecuteScriptAsync does not await a JavaScript Promise. Keep model
        // selection and tab navigation in one ordered JavaScript operation.
        await mainWeb.ExecuteScriptAsync($"void (async () => {{ const target = {navigation}; if (target.modelId) await window.modivue.selectModel(target.modelId); if (target.view) window.modivue.openView(target.view); }})()");
    }

    private static Task<string> Reply(WebView2 web, string requestId, object result)
    {
        var payload = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(JsonSerializer.Serialize(result))!;
        payload["requestId"] = JsonSerializer.SerializeToElement(requestId);
        return web.ExecuteScriptAsync($"window.modivueNativeReply?.({JsonSerializer.Serialize(payload)})");
    }

    private static string StartupCommand => $"\"{Application.ExecutablePath}\" --background";

    private static bool StartupEnabled()
    {
        try {
            using var key = Registry.CurrentUser.OpenSubKey(StartupRegistryPath);
            return string.Equals(key?.GetValue("Modivue") as string, StartupCommand, StringComparison.OrdinalIgnoreCase);
        } catch { return false; }
    }

    private void SetStartupEnabled(bool enabled)
    {
        try {
            using var key = Registry.CurrentUser.CreateSubKey(StartupRegistryPath);
            if (enabled) key.SetValue("Modivue", StartupCommand, RegistryValueKind.String);
            else key.DeleteValue("Modivue", false);
            menuStartup.Checked = enabled;
        } catch (Exception error) {
            MessageBox.Show(error.Message, "Modivue", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void PromptForStartup()
    {
        try {
            using var key = Registry.CurrentUser.CreateSubKey(AppRegistryPath);
            if (key is null || Convert.ToInt32(key.GetValue("StartupPrompted", 0)) == 1) return;
            key.SetValue("StartupPrompted", 1, RegistryValueKind.DWord);
            if (StartupEnabled()) return;
            var enable = MessageBox.Show(main, Localized(
                "是否在登录 Windows 时自动启动 Modivue？自动启动只显示灵动岛，不打开分析窗口。",
                "Start Modivue automatically when you sign in to Windows? Automatic startup shows only the island."),
                "Modivue", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (enable == DialogResult.Yes) SetStartupEnabled(true);
        } catch {}
    }

    private void UpdateTrayMenu(string locale)
    {
        interfaceEnglish = !locale.StartsWith("zh", StringComparison.OrdinalIgnoreCase);
        menuOpen.Text = Localized("打开分析窗口", "Open Dashboard");
        menuIsland.Text = Localized("显示灵动岛", "Show Island");
        menuStartup.Text = Localized("登录时自动启动", "Start at sign-in");
        menuStartup.Checked = StartupEnabled();
        menuExit.Text = Localized("退出 Modivue", "Quit Modivue");
    }

    private static RectangleF Rect(JsonElement value) => new(value.GetProperty("x").GetSingle(), value.GetProperty("y").GetSingle(), value.GetProperty("width").GetSingle(), value.GetProperty("height").GetSingle());
    private int Pixels(float value) => (int)Math.Round(value * island.DeviceDpi / 96f);
    private int ClampIslandTop(int proposedTop, Rectangle area)
    {
        var panelMinimum = area.Top;
        var panelMaximum = Math.Max(panelMinimum, area.Bottom - island.Height);
        if (!hasIslandLayout || islandBounds.Width <= 0 || islandBounds.Height <= 0 || islandBounds.Bottom > island.Height + 2)
            return Math.Clamp(proposedTop, panelMinimum, panelMaximum);
        // islandBounds is reported in top-left CSS coordinates. Clamp the
        // visible rail edges instead of the transparent host form so the rail
        // can touch both work-area edges.
        var visualTop = Pixels(islandBounds.Top);
        var visualBottom = Pixels(islandBounds.Bottom);
        var minimum = area.Top - visualTop;
        var maximum = area.Bottom - visualBottom;
        return minimum <= maximum ? Math.Clamp(proposedTop, minimum, maximum)
            : Math.Clamp(proposedTop, panelMinimum, panelMaximum);
    }
    private void SetIslandClickThrough(bool enabled)
    {
        clickThrough = enabled;
        island.ClickThrough = enabled;
        var style = GetWindowLongPtr(island.Handle, -20).ToInt64();
        SetWindowLongPtr(island.Handle, -20, (nint)(enabled ? style | 0x80020 : style & ~0x20));
    }

    private static void OpenExternal(string value) {
        if (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https") Process.Start(new ProcessStartInfo(value) { UseShellExecute = true });
    }

    private void ResizeIslandHost(bool useExpandedWidth, Rectangle area, int centerY)
    {
        var previousTop = island.Top;
        var width = Pixels(useExpandedWidth ? Math.Max(islandExpandedWidth, islandWidth + 456) : islandWidth);
        var height = Math.Min(area.Height, Pixels(islandContentHeight));
        if (right) island.Left = area.Right - width;
        else island.Left = area.Left;
        island.Width = width;
        island.Height = height;
        var proposedTop = previousTop;
        island.Top = islandResizeModeActive
            ? Math.Clamp(proposedTop, area.Top, Math.Max(area.Top, area.Bottom - height))
            : ClampIslandTop(proposedTop, area);
    }

    private async Task BeginIslandResizeMode()
    {
        if (!islandResizeModeActive) {
            islandResizeModeActive = true;
            resizeRestoreBounds = island.Bounds;
            resizeRestoreExpanded = expanded;
            resizeRestoreRight = right;
            resizeRestoreClickThrough = clickThrough;
        }
        expanded = false;
        SetIslandClickThrough(false);
        await islandWeb.ExecuteScriptAsync("window.modivue?.nativeResizeMode?.(true)");
        var area = Screen.FromControl(island).WorkingArea;
        var width = Math.Min(Pixels(islandWidth), area.Width);
        var height = Math.Min(Pixels(islandBounds.Height > 0 ? islandBounds.Height : islandContentHeight), area.Height);
        island.Bounds = new Rectangle(area.Left + (area.Width - width) / 2, area.Top + (area.Height - height) / 2, width, height);
        island.Show(); island.BringToFront();
        if (mainWeb.CoreWebView2 is not null) await mainWeb.ExecuteScriptAsync("window.modivue?.nativeResizeOverlay?.(true)");
    }

    private async Task FinishIslandResizeMode()
    {
        if (!islandResizeModeActive) return;
        islandResizeModeActive = false;
        expanded = resizeRestoreExpanded;
        right = resizeRestoreRight;
        var screen = Screen.AllScreens.FirstOrDefault(candidate => candidate.WorkingArea.IntersectsWith(resizeRestoreBounds)) ?? Screen.FromControl(island);
        var area = screen.WorkingArea;
        island.Top = resizeRestoreBounds.Top;
        ResizeIslandHost(expanded, area, resizeRestoreBounds.Top + resizeRestoreBounds.Height / 2);
        SetIslandClickThrough(resizeRestoreClickThrough);
        await islandWeb.ExecuteScriptAsync("window.modivue?.nativeResizeMode?.(false)");
        if (mainWeb.CoreWebView2 is not null) await mainWeb.ExecuteScriptAsync("window.modivue?.nativeResizeOverlay?.(false)");
    }

    private void ResizeIslandBy(Point pointer)
    {
        var dpi = island.DeviceDpi / 96f;
        var extent = (bufferDrag ? resizeStartRail.Width : resizeStartRail.Height) * dpi;
        if (extent <= 0) return;
        var change = bufferDrag ? (right ? dragStart.X - pointer.X : pointer.X - dragStart.X) : dragStart.Y - pointer.Y;
        resizeValue = Math.Clamp(resizeStartScale * (1 + change * (islandResizeModeActive ? 2 : 1) / extent), 10, 200);
        _ = islandWeb.ExecuteScriptAsync($"window.modivue?.nativeResizePreview?.({JsonSerializer.Serialize(resizeValue)})");
    }

    private async Task FinishIslandResize()
    {
        await islandWeb.ExecuteScriptAsync($"window.modivue?.nativeResizeValue?.({{ scale: {JsonSerializer.Serialize(resizeValue)} }})");
        Cursor.Current = Cursors.Default;
        resizing = false;
        dragging = false;
        pendingDrag = false;
        await FinishIslandResizeMode();
    }

    private async Task TickPointer()
    {
        if (ticking || clickThrough || !island.Visible || islandWeb.CoreWebView2 is null) return;
        ticking = true;
        try {
            var point = island.PointToClient(Cursor.Position); float scale = island.DeviceDpi / 96f;
            var css = new PointF(point.X / scale, point.Y / scale);
            bool down = GetAsyncKeyState(1) < 0;
            var handle = buffer.Contains(css) || rail.Contains(css);
            if (down && !pressed && !pendingDrag && !dragging && handle) {
                bufferDrag = buffer.Contains(css); dragStart = Cursor.Position; windowStart = island.Location; snapEnd = null;
                if (islandResizeModeActive) {
                    resizing = true; dragging = true;
                    resizeStartScale = resizeValue = islandScale; resizeStartRail = islandBounds;
                    Cursor.Current = bufferDrag ? Cursors.SizeWE : Cursors.SizeNS;
                    await islandWeb.ExecuteScriptAsync($"window.modivue?.nativeResize('started',{bufferDrag.ToString().ToLowerInvariant()})");
                } else {
                    pendingDrag = true;
                    dragPressedAt = Environment.TickCount64;
                    await islandWeb.ExecuteScriptAsync($"window.modivue?.nativeDrag('pressed',{bufferDrag.ToString().ToLowerInvariant()})");
                }
            }
            if (pendingDrag && down && !dragging) {
                var moved = Math.Abs(Cursor.Position.X - dragStart.X) >= 4 || Math.Abs(Cursor.Position.Y - dragStart.Y) >= 4;
                if (Environment.TickCount64 - dragPressedAt >= 500 && !moved) {
                    resizing = true; dragging = true; pendingDrag = false;
                    resizeStartScale = resizeValue = islandScale; resizeStartRail = islandBounds;
                    Cursor.Current = bufferDrag ? Cursors.SizeWE : Cursors.SizeNS;
                    await islandWeb.ExecuteScriptAsync($"window.modivue?.nativeResize('started',{bufferDrag.ToString().ToLowerInvariant()})");
                } else if (moved) {
                    dragging = true; pendingDrag = false;
                    await islandWeb.ExecuteScriptAsync($"window.modivue?.nativeDrag('dragging',{bufferDrag.ToString().ToLowerInvariant()})");
                }
            }
            if (dragging && down) {
                if (resizing) ResizeIslandBy(Cursor.Position);
                else {
                    var area = Screen.FromPoint(Cursor.Position).WorkingArea;
                    var y = ClampIslandTop(windowStart.Y + Cursor.Position.Y - dragStart.Y, area);
                    island.Location = new(windowStart.X + Cursor.Position.X - dragStart.X, y);
                }
            }
            if ((dragging || pendingDrag) && !down) {
                if (resizing) {
                    await FinishIslandResize();
                    await islandWeb.ExecuteScriptAsync($"window.modivue?.nativeResize('idle',{bufferDrag.ToString().ToLowerInvariant()})");
                } else if (dragging) {
                    dragging = false;
                    var area = Screen.FromPoint(Cursor.Position).WorkingArea;
                    right = island.Left + island.Width / 2 >= area.Left + area.Width / 2;
                    snapStart = island.Location;
                    snapEnd = new(right ? area.Right - island.Width : area.Left, ClampIslandTop(island.Top, area));
                    snapAt = Environment.TickCount64;
                    await islandWeb.ExecuteScriptAsync($"window.modivue?.nativeDrag('idle',{bufferDrag.ToString().ToLowerInvariant()});window.modivue?.setIslandSide('{(right ? "right" : "left")}')");
                }
                pendingDrag = false;
            }
            if (snapEnd is Point end && snapStart is Point start) {
                var t = Math.Min(1, (Environment.TickCount64 - snapAt) / 280d); var eased = 1 - Math.Pow(1 - t, 3);
                island.Location = new((int)(start.X + (end.X - start.X) * eased), (int)(start.Y + (end.Y - start.Y) * eased));
                if (t == 1) snapEnd = null;
            }
            pressed = down;
            if (!dragging && !pendingDrag) await islandWeb.ExecuteScriptAsync($"window.modivue?.nativeHover({JsonSerializer.Serialize(new { clientX = css.X, clientY = css.Y, screenX = Cursor.Position.X, screenY = Cursor.Position.Y })})");
        } finally { ticking = false; }
    }

    protected override void ExitThreadCore()
    {
        exiting = true; pointer.Stop(); pointer.Dispose(); tray.Visible = false; tray.Dispose();
        main.Dispose(); island.Dispose();
        if (!service.HasExited) service.Kill(entireProcessTree: true);
        service.Dispose(); appIcon.Dispose(); base.ExitThreadCore();
    }
}
