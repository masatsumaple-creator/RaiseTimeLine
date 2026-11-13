<#
.SYNOPSIS
  perf 用 PostgreSQL の起動・シード・リセット・EXPLAIN。ホストに psql は不要(コンテナ内の psql を使う)。
.EXAMPLE
  ./perf/db.ps1 up                 # perf DB を起動(5433)
  ./perf/db.ps1 seed               # small(users 1k / posts 100k)を投入
  ./perf/db.ps1 seed -Scale large  # users 10k / posts 1M
  ./perf/db.ps1 reset              # 全データ削除(スキーマは残す)
  ./perf/db.ps1 explain            # 主要クエリの EXPLAIN (ANALYZE, BUFFERS)
  ./perf/db.ps1 psql               # 対話 psql
#>
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('up', 'seed', 'reset', 'explain', 'psql')]
    [string]$Action,
    [ValidateSet('small', 'large')]
    [string]$Scale = 'small'
)

$ErrorActionPreference = 'Stop'
$perf = $PSScriptRoot
$container = 'raisetimeline-perf-db'
$db = 'raisetimeline_perf'

function Invoke-Psql([string]$sqlFile, [string[]]$vars = @()) {
    $args2 = @('exec', '-i', $container, 'psql', '-U', 'raisetimeline', '-d', $db, '-v', 'ON_ERROR_STOP=1') + $vars
    Get-Content -Raw -Encoding utf8 $sqlFile | & docker @args2
    if ($LASTEXITCODE -ne 0) { throw "psql が失敗しました: $sqlFile" }
}

switch ($Action) {
    'up' {
        docker compose -f "$perf/docker-compose.perf.yml" up -d --wait
        if ($LASTEXITCODE -ne 0) { throw 'perf DB の起動に失敗しました' }
        Write-Host "perf DB: localhost:5433 / $db (バックエンドは DB_URL=jdbc:postgresql://localhost:5433/$db で起動)"
    }
    'seed' {
        $vars = if ($Scale -eq 'large') { @('-v', 'users=10000', '-v', 'posts=1000000') } else { @('-v', 'users=1000', '-v', 'posts=100000') }
        Invoke-Psql "$perf/seed/seed.sql" $vars
    }
    'reset' { Invoke-Psql "$perf/seed/reset.sql" }
    'explain' { Invoke-Psql "$perf/db/explain.sql" }
    'psql' { docker exec -it $container psql -U raisetimeline -d $db }
}
