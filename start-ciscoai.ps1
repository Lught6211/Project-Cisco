$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (Get-Command wt.exe -ErrorAction SilentlyContinue) {
	wt.exe -w 0 new-tab --title "CiscoAI Backend" powershell.exe -NoExit -Command "Set-Location -LiteralPath '$projectRoot\backend'; py -m uvicorn app.main:app --host 0.0.0.0 --port 8000" `; new-tab --title "CiscoAI Frontend" powershell.exe -NoExit -Command "Set-Location -LiteralPath '$projectRoot\frontend'; npm run dev"
} else {
	Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\backend'; py -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
	Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$projectRoot\frontend'; npm run dev"
}

Write-Host "CiscoAI is starting. Open http://localhost:3000 or http://192.168.0.7:3000"