Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$res = Join-Path $root "android\app\src\main\res"

function New-NovaBitmap {
  param(
    [int]$Size,
    [string]$Path,
    [bool]$Splash = $false
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Rectangle 0, 0, $Size, $Size),
    [System.Drawing.Color]::FromArgb(14, 96, 79),
    [System.Drawing.Color]::FromArgb(232, 183, 82),
    35
  )
  $graphics.FillRectangle($background, 0, 0, $Size, $Size)

  $innerSize = [int]($Size * 0.62)
  $innerX = [int](($Size - $innerSize) / 2)
  $innerY = [int](($Size - $innerSize) / 2)
  if ($Splash) {
    $innerSize = [int]($Size * 0.34)
    $innerX = [int](($Size - $innerSize) / 2)
    $innerY = [int](($Size - $innerSize) / 2)
  }

  $circle = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(248, 250, 247))
  $graphics.FillEllipse($circle, $innerX, $innerY, $innerSize, $innerSize)

  $textSize = if ($Splash) { [int]($Size * 0.13) } else { [int]($Size * 0.24) }
  $font = New-Object System.Drawing.Font "Arial", $textSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
  $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(14, 96, 79))
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $graphics.DrawString("N", $font, $textBrush, (New-Object System.Drawing.RectangleF $innerX, $innerY, $innerSize, $innerSize), $format)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

$iconSizes = @{
  "mipmap-mdpi" = 48
  "mipmap-hdpi" = 72
  "mipmap-xhdpi" = 96
  "mipmap-xxhdpi" = 144
  "mipmap-xxxhdpi" = 192
}

foreach ($entry in $iconSizes.GetEnumerator()) {
  $dir = Join-Path $res $entry.Key
  New-NovaBitmap -Size $entry.Value -Path (Join-Path $dir "ic_launcher.png")
  New-NovaBitmap -Size $entry.Value -Path (Join-Path $dir "ic_launcher_round.png")
  New-NovaBitmap -Size $entry.Value -Path (Join-Path $dir "ic_launcher_foreground.png")
}

$splashFiles = Get-ChildItem $res -Recurse -Filter "splash.png"
foreach ($file in $splashFiles) {
  New-NovaBitmap -Size 1024 -Path $file.FullName -Splash $true
}

Write-Host "Generated Nova Android icon and splash assets."
