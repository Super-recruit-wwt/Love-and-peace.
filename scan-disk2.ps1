Write-Host "=== Claude-3p 内容 ==="
Get-ChildItem "C:\Users\Administrator.DESKTOP-QGAQJQO\AppData\Local\Claude-3p" -Force -ErrorAction SilentlyContinue | ForEach-Object {
  $s = (Get-ChildItem $_.FullName -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
  '{0}  =>  {1:N2} GB' -f $_.FullName, ($s/1GB)
}
Write-Host "`n=== Local\Programs 内容 ==="
Get-ChildItem "C:\Users\Administrator.DESKTOP-QGAQJQO\AppData\Local\Programs" -Force -ErrorAction SilentlyContinue | ForEach-Object {
  $s = (Get-ChildItem $_.FullName -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
  '{0}  =>  {1:N2} GB' -f $_.FullName, ($s/1GB)
}
Write-Host "`n=== Program Files 内容 ==="
Get-ChildItem "C:\Program Files" -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
  $s = (Get-ChildItem $_.FullName -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
  '{0}  =>  {1:N2} GB' -f $_.FullName, ($s/1GB)
}
Write-Host "`n=== Chocolatey 已装包 ==="
if (Test-Path 'C:\ProgramData\chocolatey\lib') {
  Get-ChildItem 'C:\ProgramData\chocolatey\lib' -Directory | Select-Object -ExpandProperty Name
}
