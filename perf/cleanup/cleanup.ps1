<#
.SYNOPSIS
  テスト後の後始末。既定ではテスト実行が作ったデータだけを消し、シード直後の状態へ戻す。
.EXAMPLE
  ./perf/cleanup/cleanup.ps1                 # 実行で作られた投稿・コメント・トークン等を削除(cleanup/run-data.sql)
  ./perf/cleanup/cleanup.ps1 -Reset          # シードを含む全データを削除(再シードが必要)
  ./perf/cleanup/cleanup.ps1 -StopApps       # 8080(backend)・5173(Vite)を掴むプロセスも停止
  ./perf/cleanup/cleanup.ps1 -PruneResults 7 # 7 日より古い perf/results の成果物を削除
  ./perf/cleanup/cleanup.ps1 -DestroyAll     # perf DB コンテナとボリュームごと完全削除
#>
param(
    [switch]$Reset,
    [switch]$StopApps,
    [int]$PruneResults = 0,
    [switch]$DestroyAll
)

$ErrorActionPreference = 'Stop'
$perf = Split-Path -Parent $PSScriptRoot
$container = 'raisetimeline-perf-db'

if ($StopApps) {
    # 開発中のサーバーを止めてしまわないよう、明示指定のときだけ。perf 用バックエンドは 8080 を使う
    foreach ($port in 8080, 5173) {
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host "ポート $port のプロセス $($_.OwningProcess) を停止します"
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}

if ($DestroyAll) {
    docker compose -f "$perf/docker-compose.perf.yml" down -v
}
else {
    $running = docker ps --filter "name=$container" --filter status=running -q
    if ($running) {
        if ($Reset) { & "$perf/db.ps1" reset } else {
            Get-Content -Raw -Encoding utf8 "$PSScriptRoot/run-data.sql" |
                docker exec -i $container psql -U raisetimeline -d raisetimeline_perf -v ON_ERROR_STOP=1
            if ($LASTEXITCODE -ne 0) { throw 'run-data.sql が失敗しました' }
        }
    }
    else {
        Write-Host 'perf DB は起動していないため、DB の後始末は不要です'
    }
}

# 成果物(k6 の JSON・Playwright の結果/トレース)
if ($PruneResults -gt 0) {
    $limit = (Get-Date).AddDays(-$PruneResults)
    Get-ChildItem "$perf/results" -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne '.gitkeep' -and $_.LastWriteTime -lt $limit } | Remove-Item -Force
}
Remove-Item -Recurse -Force "$perf/browser/test-results", "$perf/browser/playwright-report" -ErrorAction SilentlyContinue
Write-Host '後始末が完了しました'
