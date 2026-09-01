# build-apk.ps1 — build a release APK locally.
#
# WHY THIS SCRIPT EXISTS
# The project path contains a space and an '&' ("White & sync"). The React
# Native Gradle plugin shells out through cmd.exe with unquoted paths, so the
# build dies with "'C:\Office' is not recognized as an internal or external
# command". gradlew.bat itself breaks the same way. A directory junction does
# not help — Java resolves it back to the real path.
#
# So: copy the project to a path with no spaces, build there, copy the APK back.
#
# Usage:   powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1
# Options: -Clean       purge native caches first (needed after changing ABIs,
#                       New Architecture, or when switching build locations)
#          -WorkDir     override the staging directory (default C:\ws-build)

param(
    [switch]$Clean,
    [string]$WorkDir = 'C:\ws-build'
)

$ErrorActionPreference = 'Stop'

$Src = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $Src 'build-output'

Write-Host "Source : $Src"
Write-Host "Staging: $WorkDir`n"

# --- 1. Toolchain -----------------------------------------------------------
if (-not $env:JAVA_HOME) {
    $java = (Get-Command java -ErrorAction SilentlyContinue).Source
    if (-not $java) { throw 'Java not found on PATH. Install JDK 17.' }
    $env:JAVA_HOME = (Get-Item $java).Directory.Parent.FullName
}
if (-not $env:ANDROID_HOME) {
    $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}
Write-Host "JAVA_HOME   = $env:JAVA_HOME"
Write-Host "ANDROID_HOME= $env:ANDROID_HOME`n"

# --- 2. Stage the project ---------------------------------------------------
# Only .git is excluded. Do NOT exclude every folder named "build" here: many
# npm packages ship real source under <pkg>/build.
Write-Host 'Copying project to staging path...'
robocopy $Src $WorkDir /MIR /XD '.git' 'build-output' /NFL /NDL /NJH /NP /MT:16 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

# --- 3. Purge caches that hardcode absolute paths ---------------------------
# android/build/generated/autolinking records the absolute path of every native
# module, and the CMake .cxx caches bake in the directory they were configured
# in. Copied from the source tree, they point Gradle back at the original path
# and the native link step fails looking for libworklets.so.
Write-Host 'Purging stale native caches...'
foreach ($d in @('android\build', 'android\.gradle', 'android\app\build')) {
    $p = Join-Path $WorkDir $d
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue }
}

if ($Clean) {
    Get-ChildItem -LiteralPath "$WorkDir\node_modules" -Recurse -Directory -Filter '.cxx' -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
    Get-ChildItem -LiteralPath "$WorkDir\node_modules" -Recurse -Directory -Filter 'build' -ErrorAction SilentlyContinue |
        Where-Object { $_.Parent.Name -eq 'android' } |
        ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
}

# --- 4. Build ---------------------------------------------------------------
Write-Host "`nBuilding release APK (this takes a while on a cold cache)...`n"
& (Join-Path $WorkDir 'android\gradlew.bat') -p (Join-Path $WorkDir 'android') assembleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }

# --- 5. Collect -------------------------------------------------------------
$apk = Join-Path $WorkDir 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path -LiteralPath $apk)) { throw "Build reported success but no APK at $apk" }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$version = (Get-Content (Join-Path $Src 'app.json') -Raw | ConvertFrom-Json).expo.version
$dest = Join-Path $OutDir "White_Sync-v$version-release.apk"
Copy-Item $apk $dest -Force

$mb = [math]::Round((Get-Item -LiteralPath $dest).Length / 1MB, 2)
Write-Host "`nDone: $dest  ($mb MB)"
