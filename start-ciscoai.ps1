$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (Get-Command wt.exe -ErrorAction SilentlyContinue) {
	$backendCommand = "Set-Location -LiteralPath '$projectRoot\backend'; py.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
	$frontendCommand = "Set-Location -LiteralPath '$projectRoot\frontend'; npm.cmd run dev"
	Start-Process wt.exe -ArgumentList @("-w", "0", "new-tab", "--title", "CiscoAI Backend", "powershell.exe", "-NoExit", "-Command", $backendCommand)
	Start-Process wt.exe -ArgumentList @("-w", "0", "new-tab", "--title", "CiscoAI Frontend", "powershell.exe", "-NoExit", "-Command", $frontendCommand)
} else {
	Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\backend'; py.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
	Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\frontend'; npm.cmd run dev"
}

Write-Host "CiscoAI is starting. Open http://localhost:3000 or http://192.168.0.7:3000"