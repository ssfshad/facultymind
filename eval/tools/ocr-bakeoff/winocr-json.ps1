# Windows OCR over every jpg in a folder; writes <name>.json = { h, rows:[{y,x,text}] } (rows rebuilt from word boxes)
param([string]$InDir, [string]$OutDir)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutDir | Out-Null
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
foreach ($f in Get-ChildItem $InDir -Filter *.jpg) {
  $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($f.FullName)) ([Windows.Storage.StorageFile])
  $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $dec = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bmp = Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res = Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
  $words = @()
  foreach ($ln in $res.Lines) { foreach ($w in $ln.Words) {
    $r = $w.BoundingRect
    $words += [pscustomobject]@{ T = $w.Text; X = $r.X; Y = $r.Y + $r.Height / 2; H = $r.Height }
  } }
  $rows = @()
  if ($words.Count -gt 0) {
    $sorted = $words | Sort-Object Y
    $med = ($words | Sort-Object H)[[int]($words.Count / 2)].H
    $row = @(); $rowY = $null
    $emit = {
      param($r)
      [pscustomobject]@{ y = [math]::Round(($r | Measure-Object -Property Y -Average).Average, 1); x = ($r | Measure-Object -Property X -Minimum).Minimum;
                         text = (($r | Sort-Object X | ForEach-Object { $_.T }) -join ' ') }
    }
    foreach ($w in $sorted) {
      if ($null -eq $rowY -or [math]::Abs($w.Y - $rowY) -le 0.6 * $med) { $row += $w; $rowY = ($row | Measure-Object -Property Y -Average).Average }
      else { $rows += (& $emit $row); $row = @($w); $rowY = $w.Y }
    }
    if ($row.Count) { $rows += (& $emit $row) }
  }
  $obj = [pscustomobject]@{ w = $bmp.PixelWidth; h = $bmp.PixelHeight; rows = $rows }
  [IO.File]::WriteAllText((Join-Path $OutDir ($f.BaseName + '.json')), ($obj | ConvertTo-Json -Depth 5 -Compress))
  $stream.Dispose()
}
"done"
