using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Modivue;

internal static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        try { Application.Run(new MonitorContext()); }
        catch (Exception error) { MessageBox.Show(error.Message, "Modivue", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }
}

internal sealed class MonitorContext : ApplicationContext
{
    private readonly Process service;
    private readonly Form main = new() { Text = "Modivue", Width = 1240, Height = 860, MinimumSize = new(820, 620) };
    private readonly Form island = new() { Text = "Modivue Island", Width = 112, Height = 420, FormBorderStyle = FormBorderStyle.None,
        ShowInTaskbar = false, TopMost = true, BackColor = Color.Black, TransparencyKey = Color.Black };
    private readonly WebView2 mainWeb = new() { Dock = DockStyle.Fill };
    private readonly WebView2 islandWeb = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Transparent };
    private readonly NotifyIcon tray = new() { Text = "Modivue", Icon = SystemIcons.Application, Visible = true };
    private readonly System.Windows.Forms.Timer pointer = new() { Interval = 16 };
    private readonly Uri origin;
    private RectangleF rail = new(6, 18, 100, 220), buffer;
    private bool pressed, dragging, expanded, right = true, exiting, ticking, bufferDrag;
    private Point dragStart, windowStart;
    private Point? snapStart, snapEnd;
    private long snapAt;
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);

    public MonitorContext()
    {
        // Node binds loopback only. The short reservation avoids choosing a fixed user port.
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port; listener.Stop();
        origin = new($"http://127.0.0.1:{port}");
        var root = AppContext.BaseDirectory;
        var start = new ProcessStartInfo(Path.Combine(root, "runtime", "node.exe")) { WorkingDirectory = Path.Combine(root, "app"), UseShellExecute = false, CreateNoWindow = true };
        start.ArgumentList.Add(Path.Combine(root, "app", "server.mjs"));
        start.Environment["MODIVUE_PORT"] = port.ToString();
        start.Environment["MODIVUE_DATA_DIR"] = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Modivue");
        service = Process.Start(start) ?? throw new InvalidOperationException("Cannot start the local Modivue service.");
        main.Controls.Add(mainWeb); island.Controls.Add(islandWeb);
        main.FormClosing += (_, e) => { if (!exiting) { e.Cancel = true; main.Hide(); } };
        island.FormClosing += (_, e) => { if (!exiting) { e.Cancel = true; island.Hide(); } };
        var menu = new ContextMenuStrip();
        menu.Items.Add("Modivue", null, (_, _) => { main.Show(); main.Activate(); });
        menu.Items.Add("Island / 灵动岛", null, (_, _) => island.Show());
        menu.Items.Add("Exit / 退出", null, (_, _) => ExitThread());
        tray.ContextMenuStrip = menu; tray.DoubleClick += (_, _) => { main.Show(); main.Activate(); };
        pointer.Tick += async (_, _) => await TickPointer();
        main.Show(); island.Show();
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
            if (!ready) throw new InvalidOperationException("Local service failed to start.");
            var profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Modivue", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(null, profile);
            await Prepare(mainWeb, environment, "main"); await Prepare(islandWeb, environment, "island");
            pointer.Start();
        } catch (Exception error) {
            MessageBox.Show($"{error.Message}\nWindows requires Microsoft Edge WebView2 Runtime.", "Modivue"); ExitThread();
        }
    }

    private async Task Prepare(WebView2 web, CoreWebView2Environment environment, string mode)
    {
        await web.EnsureCoreWebView2Async(environment);
        web.CoreWebView2.Settings.IsStatusBarEnabled = false;
        web.CoreWebView2.NewWindowRequested += (_, e) => { e.Handled = true; OpenExternal(e.Uri); };
        web.CoreWebView2.NavigationStarting += (_, e) => {
            if (!e.Uri.StartsWith(origin.AbsoluteUri, StringComparison.Ordinal)) { e.Cancel = true; OpenExternal(e.Uri); }
        };
        web.CoreWebView2.WebMessageReceived += async (_, e) => {
            if (!e.Source.StartsWith(origin.AbsoluteUri, StringComparison.Ordinal)) return;
            using var message = JsonDocument.Parse(e.WebMessageAsJson); var body = message.RootElement;
            if (!body.TryGetProperty("type", out var type)) return;
            switch (type.GetString()) {
                case "island-layout":
                    rail = Rect(body);
                    if (body.TryGetProperty("buffer", out var b)) buffer = Rect(b);
                    island.Height = Math.Min(Screen.FromControl(island).WorkingArea.Height, Pixels(Math.Max(420, rail.Bottom + 20)));
                    break;
                case "island-hover":
                    expanded = body.GetProperty("expanded").GetBoolean();
                    int width = Pixels(expanded ? 570 : 112);
                    if (right) island.Left += island.Width - width;
                    island.Width = width; break;
                case "open-main":
                    main.Show(); main.Activate();
                    if (body.TryGetProperty("modelId", out var model)) await mainWeb.ExecuteScriptAsync($"window.modivue?.selectModel({model.GetRawText()})");
                    if (body.TryGetProperty("view", out var view)) await mainWeb.ExecuteScriptAsync($"window.modivue?.openView({view.GetRawText()})");
                    break;
                case "start-island-tour": island.Show(); await islandWeb.ExecuteScriptAsync("window.modivue?.startTour()"); break;
            }
        };
        web.Source = new Uri(origin, $"/?desktop={mode}");
    }

    private static RectangleF Rect(JsonElement value) => new(value.GetProperty("x").GetSingle(), value.GetProperty("y").GetSingle(), value.GetProperty("width").GetSingle(), value.GetProperty("height").GetSingle());
    private int Pixels(float value) => (int)Math.Round(value * island.DeviceDpi / 96f);
    private static void OpenExternal(string value) {
        if (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https") Process.Start(new ProcessStartInfo(value) { UseShellExecute = true });
    }

    private async Task TickPointer()
    {
        if (ticking || !island.Visible || islandWeb.CoreWebView2 is null) return;
        ticking = true;
        try {
            var point = island.PointToClient(Cursor.Position); float scale = island.DeviceDpi / 96f;
            var css = new PointF(point.X / scale, point.Y / scale);
            bool down = GetAsyncKeyState(1) < 0;
            if (down && !pressed && (buffer.Contains(css) || new RectangleF(rail.X, rail.Y, rail.Width, 22).Contains(css))) {
                dragging = true; bufferDrag = buffer.Contains(css); dragStart = Cursor.Position; windowStart = island.Location; snapEnd = null;
                await islandWeb.ExecuteScriptAsync($"window.modivue?.nativeDrag('dragging',{bufferDrag.ToString().ToLowerInvariant()})");
            }
            if (dragging && down) island.Location = new(windowStart.X + Cursor.Position.X - dragStart.X, windowStart.Y + Cursor.Position.Y - dragStart.Y);
            if (dragging && !down) {
                dragging = false;
                var area = Screen.FromPoint(Cursor.Position).WorkingArea;
                right = island.Left + island.Width / 2 >= area.Left + area.Width / 2;
                snapStart = island.Location;
                snapEnd = new(right ? area.Right - island.Width : area.Left, Math.Clamp(island.Top, area.Top, Math.Max(area.Top, area.Bottom - island.Height)));
                snapAt = Environment.TickCount64;
                await islandWeb.ExecuteScriptAsync($"window.modivue?.nativeDrag('idle',{bufferDrag.ToString().ToLowerInvariant()});window.modivue?.setIslandSide('{(right ? "right" : "left")}')");
            }
            if (snapEnd is Point end && snapStart is Point start) {
                var t = Math.Min(1, (Environment.TickCount64 - snapAt) / 280d); var eased = 1 - Math.Pow(1 - t, 3);
                island.Location = new((int)(start.X + (end.X - start.X) * eased), (int)(start.Y + (end.Y - start.Y) * eased));
                if (t == 1) snapEnd = null;
            }
            pressed = down;
            if (!dragging) await islandWeb.ExecuteScriptAsync($"window.modivue?.nativeHover({JsonSerializer.Serialize(new { clientX = css.X, clientY = css.Y })})");
        } finally { ticking = false; }
    }

    protected override void ExitThreadCore()
    {
        exiting = true; pointer.Stop(); pointer.Dispose(); tray.Visible = false; tray.Dispose();
        main.Dispose(); island.Dispose();
        if (!service.HasExited) service.Kill(entireProcessTree: true);
        service.Dispose(); base.ExitThreadCore();
    }
}
