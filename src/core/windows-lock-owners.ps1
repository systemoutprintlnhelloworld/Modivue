[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
# Restart Manager reports open-file owners without changing or releasing locks.
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ModivueFileOwners {
  [StructLayout(LayoutKind.Sequential)] public struct UniqueProcess {
    public uint Pid;
    public System.Runtime.InteropServices.ComTypes.FILETIME Start;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct ProcessInfo {
    public UniqueProcess Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=256)] public string AppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=64)] public string ServiceName;
    public uint AppType, Status, Session;
    [MarshalAs(UnmanagedType.Bool)] public bool Restartable;
  }
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmStartSession(out uint handle, uint flags, StringBuilder key);
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmRegisterResources(uint handle, uint count, string[] files, uint apps, UniqueProcess[] processes, uint services, string[] names);
  [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint handle, out uint needed, ref uint count, [In, Out] ProcessInfo[] info, ref uint reasons);
  [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint handle);
  public static uint[] Read(string path) {
    uint handle;
    if (RmStartSession(out handle, 0, new StringBuilder(33)) != 0) return new uint[0];
    try {
      if (RmRegisterResources(handle, 1, new[] { path }, 0, null, 0, null) != 0) return new uint[0];
      uint needed, count=0, reasons=0;
      if (RmGetList(handle, out needed, ref count, null, ref reasons) != 234) return new uint[0];
      var info = new ProcessInfo[needed]; count=needed;
      if (RmGetList(handle, out needed, ref count, info, ref reasons) != 0) return new uint[0];
      var pids=new uint[count];
      for (int i=0; i<count; i++) pids[i]=info[i].Process.Pid;
      return pids;
    } finally { RmEndSession(handle); }
  }
}
'@
Get-ChildItem -LiteralPath $env:MODIVUE_CODEX_LOCK_DIRECTORY -Filter '*.lock' | ForEach-Object {
  if ($_.Name -eq '.coordination.lock') { return }
  $path = $_.FullName
  foreach ($owner in [ModivueFileOwners]::Read($path)) {
    'p' + $owner
    'n' + $path
  }
}
