$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8080
$url = "http://localhost:$port/"

function Find-Browser {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($candidate in $candidates) { if ($candidate -and (Test-Path $candidate)) { return $candidate } }
  return $null
}

function Open-UniPlan {
  $browser = Find-Browser
  if ($browser) { Start-Process -FilePath $browser -ArgumentList "--app=$url", "--start-maximized" | Out-Null }
  else { Start-Process $url | Out-Null }
}

# Se a mesma aplicação já estiver a servir a porta, apenas abre outra janela.
try {
  $response = Invoke-WebRequest -Uri ($url + 'version.json') -UseBasicParsing -TimeoutSec 1
  $marker = $response.Content | ConvertFrom-Json
  if ($response.StatusCode -eq 200 -and $marker.app -eq 'UniPlan') { Open-UniPlan; exit 0 }
} catch {}

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, 'Local\UniPlanLocalServer8080', [ref]$createdNew)
if (-not $createdNew) { Start-Sleep -Milliseconds 600; Open-UniPlan; exit 0 }

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
try { $listener.Start() }
catch {
  [System.Windows.Forms.MessageBox]::Show("A porta 8080 está a ser utilizada por outro programa.`nFecha o servidor anterior e tenta novamente.", 'UniPlan') | Out-Null
  exit 1
}

$mime = @{
  '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.webmanifest'='application/manifest+json'; '.svg'='image/svg+xml';
  '.png'='image/png'; '.ico'='image/x-icon'; '.txt'='text/plain; charset=utf-8'; '.md'='text/plain; charset=utf-8'
}

Open-UniPlan
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }
      while ($true) { $line = $reader.ReadLine(); if ([string]::IsNullOrEmpty($line)) { break } }
      $parts = $requestLine.Split(' ')
      $method = $parts[0]
      $requestTarget = if ($parts.Length -gt 1) { $parts[1] } else { '/' }
      $relative = [Uri]::UnescapeDataString(($requestTarget.Split('?')[0]).TrimStart('/'))
      if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
      $candidate = [IO.Path]::GetFullPath((Join-Path $root $relative.Replace('/', [IO.Path]::DirectorySeparatorChar)))
      $safeRoot = [IO.Path]::GetFullPath($root) + [IO.Path]::DirectorySeparatorChar
      $status = '200 OK'; $contentType = 'application/octet-stream'
      if (-not $candidate.StartsWith($safeRoot, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $candidate -PathType Leaf)) {
        $status = '404 Not Found'; $contentType = 'text/plain; charset=utf-8'; $body = [Text.Encoding]::UTF8.GetBytes('Ficheiro não encontrado')
      } else {
        $ext = [IO.Path]::GetExtension($candidate).ToLowerInvariant()
        if ($mime.ContainsKey($ext)) { $contentType = $mime[$ext] }
        $body = [IO.File]::ReadAllBytes($candidate)
      }
      $cache = if ($candidate -match '\.(html|js|css|webmanifest|json)$') { 'no-cache' } else { 'public, max-age=86400' }
      $headerText = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: $cache`r`nConnection: close`r`nX-Content-Type-Options: nosniff`r`n`r`n"
      $header = [Text.Encoding]::ASCII.GetBytes($headerText)
      $stream.Write($header, 0, $header.Length)
      if ($method -ne 'HEAD') { $stream.Write($body, 0, $body.Length) }
      $stream.Flush()
    } catch {} finally { $client.Close() }
  }
} finally {
  $listener.Stop(); $mutex.ReleaseMutex(); $mutex.Dispose()
}
