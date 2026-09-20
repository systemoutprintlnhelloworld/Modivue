using System.Runtime.InteropServices;
using System.Windows.Interop;

namespace Modivue;

// Keep native geometry in physical pixels, matching WinForms screens and cursor
// coordinates. WPF owns per-pixel alpha; no color key or opaque input backing.
internal sealed class IslandWindow : System.Windows.Window
{
    public IslandWindow()
    {
        Title = "Modivue Island";
        Width = 112; Height = 160;
        WindowStyle = System.Windows.WindowStyle.None;
        ResizeMode = System.Windows.ResizeMode.NoResize;
        AllowsTransparency = true;
        Background = System.Windows.Media.Brushes.Transparent;
        ShowInTaskbar = false;
        ShowActivated = false;
        Topmost = true;
        System.Windows.Forms.Integration.ElementHost.EnableModelessKeyboardInterop(this);
    }

    public nint Handle => new WindowInteropHelper(this).EnsureHandle();
    public int DeviceDpi => (int)GetDpiForWindow(Handle);
    public Rectangle PixelBounds
    {
        get {
            GetWindowRect(Handle, out var rect);
            return Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom);
        }
        set {
            if (PixelBounds == value) return;
            SetWindowPos(Handle, 0, value.X, value.Y, value.Width, value.Height, 0x0014);
        }
    }
    public Point PixelLocation
    {
        get => PixelBounds.Location;
        set { var bounds = PixelBounds; bounds.Location = value; PixelBounds = bounds; }
    }
    public int PixelTop
    {
        get => PixelBounds.Top;
        set { var bounds = PixelBounds; bounds.Y = value; PixelBounds = bounds; }
    }
    public Point PointToClient(Point screenPoint)
    {
        var bounds = PixelBounds;
        return new Point(screenPoint.X - bounds.Left, screenPoint.Y - bounds.Top);
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NativeRect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] private static extern bool GetWindowRect(nint window, out NativeRect rect);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(nint window, nint after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(nint window);
}
