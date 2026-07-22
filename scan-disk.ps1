$results = foreach ($base in @('Local','Roaming')) {
  Get-ChildItem "C:\Users\Administrator.DESKTOP-QGAQJQO\AppData\$base" -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $s = (Get-ChildItem $_.FullName -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
    [PSCustomObject]@{ Path = $_.FullName; SizeGB = [math]::Round($s/1GB,2) }
  }
}
$results | Sort-Object SizeGB -Descending | Select-Object -First 20 | Format-Table -AutoSize
