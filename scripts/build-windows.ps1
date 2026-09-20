$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $project 'dist/Modivue-windows-x64'
$dist = Join-Path $project 'dist'
$version = (Get-Content (Join-Path $project 'package.json') -Raw | ConvertFrom-Json).version
$certificatePath = Join-Path $project 'dist/.modivue-signing.pfx'
$signTool = $null
$localDotnet = Join-Path $project '.local/dotnet/dotnet.exe'
$dotnet = if ($env:MODIVUE_DOTNET_EXE) { (Get-Item $env:MODIVUE_DOTNET_EXE -ErrorAction Stop).FullName }
  elseif (Test-Path -LiteralPath $localDotnet) { $localDotnet }
  else { (Get-Command dotnet.exe -ErrorAction Stop).Source }
if (-not ((& $dotnet --list-sdks) -match '^8\.')) { throw ".NET SDK 8 is required; selected host has no SDK 8: $dotnet" }
$nodeRuntime = if ($env:MODIVUE_NODE_EXE) { (Get-Item $env:MODIVUE_NODE_EXE -ErrorAction Stop).FullName } else { (Get-Command node.exe -ErrorAction Stop).Source }
$nodeVersion = [version](& $nodeRuntime -p 'process.versions.node')
if ($nodeVersion.Major -lt 24) { throw "Windows packages require Node.js 24 or newer; selected runtime is $nodeVersion at $nodeRuntime" }
& $nodeRuntime --input-type=module --eval "await import('node:sqlite')"
if ($LASTEXITCODE -ne 0) { throw "Selected Node.js runtime does not provide node:sqlite: $nodeRuntime" }
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$npmCli = Join-Path (Split-Path $npmCommand -Parent) 'node_modules/npm/bin/npm-cli.js'
if (-not (Test-Path -LiteralPath $npmCli)) { throw "npm CLI not found beside $npmCommand" }

function Test-MicrosoftSignature([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return $false }
  $signature = Get-AuthenticodeSignature -FilePath $path
  return $signature.Status -eq 'Valid' -and $signature.SignerCertificate.Subject -match '(^|, )O=Microsoft Corporation(,|$)'
}

function Get-WebView2Bootstrapper {
  $cache = Join-Path $project '.local/MicrosoftEdgeWebview2Setup.exe'
  if (-not (Test-MicrosoftSignature $cache)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $cache -Parent) | Out-Null
    Invoke-WebRequest -UseBasicParsing -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $cache
  }
  if (-not (Test-MicrosoftSignature $cache)) { throw 'Downloaded WebView2 bootstrapper is not validly signed by Microsoft' }
  return $cache
}

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
  $destinationPath = [IO.Path]::GetFullPath($destination).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $distPath = [IO.Path]::GetFullPath($dist).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  if (-not $destinationPath.StartsWith($distPath, [StringComparison]::OrdinalIgnoreCase)) { throw 'Windows output escaped the dist directory' }
  if (Test-Path -LiteralPath $destinationPath) { Remove-Item -LiteralPath $destinationPath -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null
  & $dotnet publish (Join-Path $project 'desktop/windows/Modivue.csproj') -c Release -r win-x64 --self-contained true "-p:Version=$version" -o $destinationPath
  if ($LASTEXITCODE -ne 0) { throw 'Windows host build failed' }
  $resources = Join-Path $destinationPath 'resources'
  $app = Join-Path $resources 'app'
  $runtime = Join-Path $resources 'runtime'
  $prerequisites = Join-Path $resources 'prerequisites'
  New-Item -ItemType Directory -Force -Path $app, $runtime, $prerequisites | Out-Null
  foreach ($name in @('server.mjs','app.js','index.html','styles.css','package.json','package-lock.json','LICENSE','src','cli')) {
    Copy-Item (Join-Path $project $name) $app -Recurse -Force
  }
  Copy-Item $nodeRuntime (Join-Path $runtime 'node.exe') -Force
  Copy-Item (Get-WebView2Bootstrapper) (Join-Path $prerequisites 'MicrosoftEdgeWebview2Setup.exe') -Force
  Push-Location $app
  try { & $nodeRuntime $npmCli ci --omit=dev; if ($LASTEXITCODE -ne 0) { throw 'Runtime dependencies failed' } } finally { Pop-Location }
  $unexpected = Get-ChildItem -LiteralPath $destinationPath -Force | Where-Object { $_.Name -notin @('Modivue.exe', 'resources') }
  if ($unexpected) { throw "Unexpected files in portable root: $($unexpected.Name -join ', ')" }
  Invoke-Sign (Join-Path $destinationPath 'Modivue.exe')
  Compress-Archive -Path "$destinationPath/*" -DestinationPath (Join-Path $dist 'Modivue-windows-x64.zip') -Force
  $iscc = Get-Item "${env:ProgramFiles(x86)}/Inno Setup 6/ISCC.exe" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
  if ($iscc) {
    & $iscc "/DAppSource=$destinationPath" "/DAppVersion=$version" "/DOutputDir=$dist" (Join-Path $project 'desktop/windows/Modivue.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Windows installer build failed' }
    Invoke-Sign (Join-Path $project 'dist/Modivue-windows-x64-setup.exe')
  } elseif ($env:WINDOWS_CERTIFICATE_BASE64) { throw 'Inno Setup 6 is required for signed releases' }
} finally {
  if (Test-Path $certificatePath) { Remove-Item $certificatePath -Force }
}
