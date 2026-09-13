$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $project 'dist/Modivue-windows-x64'
$version = (Get-Content (Join-Path $project 'package.json') -Raw | ConvertFrom-Json).version
dotnet publish (Join-Path $project 'desktop/windows/Modivue.csproj') -c Release -r win-x64 --self-contained true "-p:Version=$version" -o $destination
if ($LASTEXITCODE -ne 0) { throw 'Windows host build failed' }
$app = Join-Path $destination 'app'
New-Item -ItemType Directory -Force -Path $app, (Join-Path $destination 'runtime') | Out-Null
foreach ($name in @('server.mjs','app.js','index.html','styles.css','package.json','package-lock.json','src','cli')) {
  Copy-Item (Join-Path $project $name) $app -Recurse -Force
}
Copy-Item (Get-Command node.exe).Source (Join-Path $destination 'runtime/node.exe') -Force
Push-Location $app
try { npm ci --omit=dev; if ($LASTEXITCODE -ne 0) { throw 'Runtime dependencies failed' } } finally { Pop-Location }
Compress-Archive -Path "$destination/*" -DestinationPath (Join-Path $project 'dist/Modivue-windows-x64.zip') -Force
