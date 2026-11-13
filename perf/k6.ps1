<#
.SYNOPSIS
  k6 を実行する。ローカルに k6 があればそれを、無ければ Docker の grafana/k6 を使う。
  結果の JSON は perf/results/ に出力する。
.EXAMPLE
  ./perf/k6.ps1 smoke
  ./perf/k6.ps1 load -Vus 30 -Hold 5m
  ./perf/k6.ps1 stress -Users 10000 -Posts 1000000    # large シードの場合
  ./perf/k6.ps1 load -Cleanup                          # 実行後にテスト作成データを削除
#>
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('smoke', 'load', 'stress', 'spike', 'auth')]
    [string]$Script,
    [int]$Vus = 20,
    [string]$Hold = '8m',
    [int]$Users = 1000,
    [int]$Posts = 100000,
    [string]$BaseUrl,
    [switch]$Cleanup
)

$ErrorActionPreference = 'Stop'
$perf = $PSScriptRoot
New-Item -ItemType Directory -Force "$perf/results" | Out-Null
$summary = "results/$Script.json"
$envs = @{ VUS = $Vus; HOLD = $Hold; USERS = $Users; POSTS = $Posts }

try {
    if (Get-Command k6 -ErrorAction SilentlyContinue) {
        if (-not $BaseUrl) { $BaseUrl = 'http://localhost:8080' }
        $envArgs = @('-e', "BASE_URL=$BaseUrl") + ($envs.GetEnumerator() | ForEach-Object { '-e'; "$($_.Key)=$($_.Value)" })
        Push-Location $perf
        try { & k6 run @envArgs --summary-export $summary "k6/$Script.js" } finally { Pop-Location }
    }
    else {
        # コンテナからホストのバックエンドへは host.docker.internal で届く
        if (-not $BaseUrl) { $BaseUrl = 'http://host.docker.internal:8080' }
        $envArgs = @('-e', "BASE_URL=$BaseUrl") + ($envs.GetEnumerator() | ForEach-Object { '-e'; "$($_.Key)=$($_.Value)" })
        docker run --rm -i -v "${perf}:/perf" -w /perf @envArgs grafana/k6:1.3.0 run --summary-export $summary "k6/$Script.js"
    }
    $code = $LASTEXITCODE
}
finally {
    if ($Cleanup) { & "$perf/cleanup/cleanup.ps1" }
}
exit $code
