$ErrorActionPreference = "Stop"

$projectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$localUrl = "http://localhost:3000/"

function Test-InkflowServer {
  try {
    $response = Invoke-WebRequest -Uri $localUrl -UseBasicParsing -TimeoutSec 1
    return $response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

if (-not (Test-InkflowServer)) {
  $escapedProjectPath = $projectPath.Replace("'", "''")
  Start-Process powershell.exe -WindowStyle Normal -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-Command",
    "Set-Location -LiteralPath '$escapedProjectPath'; npm.cmd run dev"
  )

  $serverReady = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (Test-InkflowServer) {
      $serverReady = $true
      break
    }
  }

  if (-not $serverReady) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
      "Inkflow did not start within 20 seconds. Check the PowerShell server window for details.",
      "Inkflow"
    ) | Out-Null
    exit 1
  }
}

Start-Process $localUrl
