param(
    [string]$ExePath = (Join-Path $PSScriptRoot '../src-tauri/target/release/darkenlight.exe'),
    [string]$ReportPath = (Join-Path ([System.IO.Path]::GetTempPath()) ('darkenlight-runtime-' + [guid]::NewGuid().ToString('N') + '.json'))
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ExePath -PathType Leaf)) { throw 'Build the Tauri application first.' }
$runtimeProcess = Start-Process -FilePath $ExePath -ArgumentList @('--runtime-smoke-test', '--runtime-test-report', ('"' + $ReportPath + '"')) -PassThru -WindowStyle Hidden
if (-not $runtimeProcess.WaitForExit(180000)) {
    $runtimeProcess.Kill()
    throw 'The desktop runtime test timed out.'
}
$runtimeResult = Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json
$runtimeResult | ConvertTo-Json -Depth 5
if (-not $runtimeResult.success) { throw 'The desktop runtime test failed.' }
