param([int]$X,[int]$Y)
Add-Type -AssemblyName System.Drawing
$b = New-Object System.Drawing.Bitmap 1,1
$g = [System.Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen($X,$Y,0,0,(New-Object System.Drawing.Size 1,1))
$c = $b.GetPixel(0,0)
'#{0:x2}{1:x2}{2:x2}' -f $c.R,$c.G,$c.B
