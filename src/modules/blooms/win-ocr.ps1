# Windows built-in OCR (Windows.Media.Ocr): offline, ships with Windows 10/11.
# Run by win-ocr.js. Input/output paths come from the environment:
#   FM_OCR_LIST = JSON file with an array of image paths
#   FM_OCR_OUT  = JSON file to write: { engine, items: [ { path, w, h, rows: [ { y, x, text } ], error } ] }
# Rows are rebuilt from word boxes (the engine itself returns text column by column, which separates
# "1)" from its question).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('en-US'))
if ($null -eq $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
$items = @()
if ($null -eq $engine) {
  $out = [pscustomobject]@{ engine = 'none'; items = @() }
} else {
  # not piped: in Windows PowerShell 5.1 a piped JSON array arrives as ONE object
  $paths = ConvertFrom-Json -InputObject (Get-Content -Raw -Encoding UTF8 $env:FM_OCR_LIST)
  foreach ($p in $paths) {
    try {
      $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($p)) ([Windows.Storage.StorageFile])
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
        foreach ($w in $sorted) {
          if ($null -eq $rowY -or [math]::Abs($w.Y - $rowY) -le 0.6 * $med) { $row += $w; $rowY = ($row | Measure-Object -Property Y -Average).Average }
          else {
            $rows += [pscustomobject]@{ y = [math]::Round($rowY, 1); x = ($row | Measure-Object -Property X -Minimum).Minimum; text = (($row | Sort-Object X | ForEach-Object { $_.T }) -join ' ') }
            $row = @($w); $rowY = $w.Y
          }
        }
        if ($row.Count) {
          $rows += [pscustomobject]@{ y = [math]::Round($rowY, 1); x = ($row | Measure-Object -Property X -Minimum).Minimum; text = (($row | Sort-Object X | ForEach-Object { $_.T }) -join ' ') }
        }
      }
      $items += [pscustomobject]@{ path = $p; w = $bmp.PixelWidth; h = $bmp.PixelHeight; rows = $rows; error = $null }
      $stream.Dispose()
    } catch {
      $items += [pscustomobject]@{ path = $p; w = 0; h = 0; rows = @(); error = $_.Exception.Message }
    }
  }
  $out = [pscustomobject]@{ engine = 'windows'; items = $items }
}
[IO.File]::WriteAllText($env:FM_OCR_OUT, ($out | ConvertTo-Json -Depth 6 -Compress), (New-Object System.Text.UTF8Encoding($false)))
