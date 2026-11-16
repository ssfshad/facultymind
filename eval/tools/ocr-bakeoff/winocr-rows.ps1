# Windows built-in OCR (Windows.Media.Ocr), offline. Usage: powershell -File winocr.ps1 <limit>
param([int]$Limit = 1000)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$photos = (Get-Content (Join-Path $root 'eval\data\private\ocr-bakeoff\photos.json') -Raw | ConvertFrom-Json) | Select-Object -First $Limit
$outDir = Join-Path $root 'eval\data\private\ocr-bakeoff\out\winocr-rows'
New-Item -ItemType Directory -Force $outDir | Out-Null

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result
}
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$timings = @{}
foreach ($p in $photos) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $path = Join-Path $root "eval\data\private\papers\$p"
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($path)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
  # rebuild reading rows from word boxes: group by vertical centre, order by x
  $words = @()
  foreach ($ln in $res.Lines) { foreach ($w in $ln.Words) {
    $r = $w.BoundingRect
    $words += [pscustomobject]@{ T = $w.Text; X = $r.X; Y = $r.Y + $r.Height / 2; H = $r.Height }
  } }
  $lines = @()
  if ($words.Count -gt 0) {
    $sorted = $words | Sort-Object Y
    $med = ($words | Sort-Object H)[[int]($words.Count / 2)].H
    $row = @(); $rowY = $null
    foreach ($w in $sorted) {
      if ($null -eq $rowY -or [math]::Abs($w.Y - $rowY) -le 0.6 * $med) {
        $row += $w; $rowY = ($row | Measure-Object -Property Y -Average).Average
      } else {
        $lines += (($row | Sort-Object X | ForEach-Object { $_.T }) -join ' ')
        $row = @($w); $rowY = $w.Y
      }
    }
    if ($row.Count) { $lines += (($row | Sort-Object X | ForEach-Object { $_.T }) -join ' ') }
  }
  [IO.File]::WriteAllText((Join-Path $outDir ($p -replace '\.jpg$', '.txt')), ($lines -join "`n"))
  $timings[$p] = $sw.ElapsedMilliseconds
  $stream.Dispose()
}
$timings | ConvertTo-Json | Set-Content (Join-Path $outDir 'timings.json')
$avg = ($timings.Values | Measure-Object -Average).Average
"winocr-rows: $($timings.Count) photos, mean $([math]::Round($avg/1000,2)) s/photo"
