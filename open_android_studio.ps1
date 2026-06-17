# Powershell script to open the Aether Chat Android project in Android Studio
$studioPath = "C:\Program Files\Android\Android Studio1\bin\studio64.exe"
$projectPath = Join-Path $PSScriptRoot "frontend\android"

if (Test-Path $studioPath) {
    Write-Host "Launching Android Studio from: $studioPath" -ForegroundColor Green
    Write-Host "Opening project: $projectPath" -ForegroundColor Cyan
    Start-Process -FilePath $studioPath -ArgumentList "`"$projectPath`""
} else {
    Write-Error "Android Studio was not found at $studioPath. Please open Android Studio manually and open the directory: $projectPath"
}
