$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $project 'dist/Modivue-windows-x64'
$version = (Get-Content (Join-Path $project 'package.json') -Raw | ConvertFrom-Json).version
$certificatePath = Join-Path $project 'dist/.modivue-signing.pfx'
$signTool = $null
function Invoke-Sign([string]$path) {
  if (-not $signTool) { return }
  & $signTool sign /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com /f $certificatePath /p $env:WINDOWS_CERTIFICATE_PASSWORD $path
  if ($LASTEXITCODE -ne 0) { throw "Authenticode signing failed: $path" }
  & $signTool verify /pa $path
  if ($LASTEXITCODE -ne 0) { throw "Authenticode verification failed: $path" }
}
try {
  if ($env:WINDOWS_CERTIFICATE_BASE64) {
    if (-not $env:WINDOWS_CERTIFICATE_PASSWORD) { throw 'WINDOWS_CERTIFICATE_PASSWORD is required when signing' }
    New-Item -ItemType Directory -Force -Path (Split-Path $certificatePath -Parent) | Out-Null
    [IO.File]::WriteAllBytes($certificatePath, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE_BASE64))
    $signTool = Get-ChildItem "${env:ProgramFiles(x86)}/Windows Kits/10/bin/*/x64/signtool.exe" -ErrorAction SilentlyContinue |
      Sort-Object FullName | Select-Object -Last 1 -ExpandProperty FullName
    if (-not $signTool) { $signTool = (Get-Command signtool.exe -ErrorAction Stop).Source }
  }
  dotnet publish (Join-Path $project 'desktop/windows/Modivue.csproj') -c Release -r win-x64 --self-contained true "-p:Version=$version" -o $destination
  if ($LASTEXITCODE -ne 0) { throw 'Windows host build failed' }
  $app = Join-Path $destination 'app'
  New-Item -ItemType Directory -Force -Path $app, (Join-Path $destination 'runtime') | Out-Null
  foreach ($name in @('server.mjs','app.js','index.html','styles.css','package.json','package-lock.json','LICENSE','src','cli')) {
    Copy-Item (Join-Path $project $name) $app -Recurse -Force
  }
  Copy-Item (Get-Command node.exe).Source (Join-Path $destination 'runtime/node.exe') -Force
  Push-Location $app
  try { npm ci --omit=dev; if ($LASTEXITCODE -ne 0) { throw 'Runtime dependencies failed' } } finally { Pop-Location }
  Invoke-Sign (Join-Path $destination 'Modivue.exe')
  Compress-Archive -Path "$destination/*" -DestinationPath (Join-Path $project 'dist/Modivue-windows-x64.zip') -Force
  $iscc = Get-Item "${env:ProgramFiles(x86)}/Inno Setup 6/ISCC.exe" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
  if ($iscc) {
    & $iscc "/DAppSource=$destination" "/DAppVersion=$version" "/DOutputDir=$(Join-Path $project 'dist')" (Join-Path $project 'desktop/windows/Modivue.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed' }
    Invoke-Sign (Join-Path $project 'dist/Modivue-windows-x64-setup.exe')
  } elseif ($env:WINDOWS_CERTIFICATE_BASE64) { throw 'Inno Setup 6 is required for signed releases' }
} finally {
  if (Test-Path $certificatePath) { Remove-Item $certificatePath -Force }
}
