param([ValidateSet('light','dark')][string]$Mode)
$v = if ($Mode -eq 'light') { 1 } else { 0 }
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' -Name AppsUseLightTheme -Value $v
Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern System.IntPtr SendMessageTimeout(System.IntPtr h,uint m,System.UIntPtr w,string l,uint f,uint t,out System.UIntPtr r);'
$r = [System.UIntPtr]::Zero
[void][W.U]::SendMessageTimeout([System.IntPtr]0xffff, 0x1A, [System.UIntPtr]::Zero, 'ImmersiveColorSet', 2, 5000, [ref]$r)
"os=$Mode"
