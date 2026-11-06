param([Parameter(Mandatory=$true)][string]$AtlasPath)
Add-Type -AssemblyName System.Drawing
$atlas = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $AtlasPath))
$outputDirectory = Join-Path $PSScriptRoot '../public/images/gui/skins/charcoal'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
# Pixel coordinates of the generated 1254px atlas, not normalized UVs.
$parts = @{
    'panel' = @(6, 6, 792, 802)
    'button' = @(823, 6, 424, 130)
    'button-selected' = @(823, 175, 424, 130)
    'button-pressed' = @(823, 344, 424, 130)
    'checkbox' = @(823, 512, 89, 92)
    'checkbox-selected' = @(953, 512, 89, 92)
    'thumb' = @(823, 644, 89, 92)
    'track' = @(6, 848, 792, 39)
    'track-fill' = @(6, 921, 792, 36)
    'surface' = @(12, 1004, 776, 236)
    'button-surface' = @(845, 28, 380, 86)
    'selected-surface' = @(845, 197, 380, 86)
    'pressed-surface' = @(845, 366, 380, 86)
}
try {
    foreach ($name in $parts.Keys) {
        $rect = $parts[$name]
        $bitmap = $atlas.Clone([System.Drawing.Rectangle]::new($rect[0], $rect[1], $rect[2], $rect[3]), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            # Remove only atlas backing; retain antialiased metal edges and alpha.
            for ($y = 0; $y -lt $bitmap.Height; $y++) {
                for ($x = 0; $x -lt $bitmap.Width; $x++) {
                    $pixel = $bitmap.GetPixel($x, $y)
                    $slice = if ($name -eq 'panel') { 24 } elseif ($name -in @('button', 'button-selected', 'button-pressed')) { 18 } else { 0 }
                    $unusedCenter = $slice -gt 0 -and $x -ge $slice -and $x -lt ($bitmap.Width - $slice) -and $y -ge $slice -and $y -lt ($bitmap.Height - $slice)
                    if ($unusedCenter -or ([Math]::Min($pixel.R, $pixel.B) - $pixel.G -gt 25)) {
                        $bitmap.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
                    }
                }
            }
            $bitmap.Save((Join-Path $outputDirectory "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $bitmap.Dispose() }
    }
} finally { $atlas.Dispose() }
