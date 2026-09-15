# UTF-8 출력 설정
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceDir = (Split-Path -Parent $ScriptDir).TrimEnd('\')
$TmpDir = Join-Path $WorkspaceDir "tmp"
$PidFile = Join-Path $TmpDir "org-board.pid"
$TargetHost = "127.0.0.1"
$TargetPort = 4173
$AppUrl = "http://${TargetHost}:${TargetPort}"

Write-Host "===================================================="
Write-Host " 조직보드 (Org Board) Windows 로컬 실행 스크립트"
Write-Host " 작업 디렉터리: $WorkspaceDir"
Write-Host "===================================================="

# 1. Node.js 및 npm 런타임 사전 필수 조건 확인
$nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
$npmCmd = Get-Command "npm" -ErrorAction SilentlyContinue

if (-not $nodeCmd -or -not $npmCmd) {
    Write-Error "[오류] 필수 런타임인 Node.js 또는 npm을 찾을 수 없습니다.`nNode.js 24(또는 호환 버전)와 npm을 설치하고 시스템 환경 변수(PATH)에 등록한 후 다시 실행해 주세요."
    exit 1
}

$nodeVersion = & node -v
Write-Host "[확인] Node.js 런타임: $nodeVersion"

# tmp 디렉터리 확인 및 생성
if (-not (Test-Path $TmpDir)) {
    New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null
}

# 헬퍼 함수
function Get-PortProcessId {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        return [int]$connections[0].OwningProcess
    }
    return $null
}

function Get-ProcessOwnershipInfo {
    param([int]$ProcessId, [string]$ExpectedDir)
    $info = [PSCustomObject]@{
        Exists = $false
        StartTimeUtc = $null
        CommandLine = $null
        IsOwned = $false
    }

    try {
        $p = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($p) {
            $info.Exists = $true
            try { $info.StartTimeUtc = $p.StartTime.ToUniversalTime() } catch {}
        }
        $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
        if ($cim) {
            $info.CommandLine = $cim.CommandLine
            $cmd = $cim.CommandLine
            $exec = $cim.ExecutablePath
            if (($cmd -and $cmd.IndexOf($ExpectedDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) -or
                ($exec -and $exec.IndexOf($ExpectedDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)) {
                $info.IsOwned = $true
            }
        }
    } catch {
        # 예외 무시
    }
    return $info
}

# 2. 포트 4173 상태 및 기존 소유 프로세스 점검
$listeningPid = Get-PortProcessId -Port $TargetPort

if ($listeningPid) {
    $listenInfo = Get-ProcessOwnershipInfo -ProcessId $listeningPid -ExpectedDir $WorkspaceDir
    $isOwnedProcess = $listenInfo.IsOwned

    # 저장된 PID 파일 검증
    if (Test-Path $PidFile) {
        try {
            $savedData = Get-Content $PidFile -Raw -Encoding UTF8 | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($savedData -and $savedData.pid -eq $listeningPid) {
                if ($savedData.startTimeUtc -and $listenInfo.StartTimeUtc) {
                    $savedUtc = [DateTime]::Parse($savedData.startTimeUtc)
                    if ([Math]::Abs(($listenInfo.StartTimeUtc - $savedUtc).TotalSeconds) -lt 3.0) {
                        $isOwnedProcess = $true
                    } else {
                        $isOwnedProcess = $false # PID가 재사용됨
                    }
                }
            }
        } catch {}
    }

    if ($isOwnedProcess) {
        Write-Host "[안내] 조직보드가 이미 실행 중입니다 (PID: $listeningPid)."
        Write-Host "[안내] 기본 웹 브라우저에서 $AppUrl 을(를) 엽니다..."
        Start-Process $AppUrl
        exit 0
    } else {
        Write-Error "[오류] 포트 $TargetPort 이(가) 다른 프로세스(PID: $listeningPid)에 의해 이미 사용 중입니다.`n해당 프로세스는 현재 작업 디렉터리의 조직보드 프로세스가 아니므로 안전을 위해 강제 종료하지 않습니다.`n충돌하는 프로그램을 종료하거나 포트를 확보한 후 다시 실행해 주세요."
        exit 1
    }
}

# 3. 의존성 패키지(node_modules) 확인 및 npm ci 자동 실행
$nodeModulesDir = Join-Path $WorkspaceDir "node_modules"
if (-not (Test-Path $nodeModulesDir)) {
    Write-Host "[안내] 의존성 패키지(node_modules)가 누락되어 있습니다. 'npm ci'를 실행합니다..."
    $npmProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm ci" -WorkingDirectory $WorkspaceDir -NoNewWindow -PassThru -Wait
    if ($npmProc.ExitCode -ne 0) {
        Write-Error "[오류] 의존성 설치('npm ci') 중 문제가 발생했습니다 (ExitCode: $($npmProc.ExitCode))."
        exit 1
    }
    Write-Host "[성공] 의존성 설치 완료."
}

# 4. 프로덕션 빌드 (npm run build)
Write-Host "[안내] 최신 애플리케이션 빌드를 생성합니다 ('npm run build')..."
$buildProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run build" -WorkingDirectory $WorkspaceDir -NoNewWindow -PassThru -Wait
if ($buildProc.ExitCode -ne 0) {
    Write-Error "[오류] 빌드('npm run build') 생성에 실패했습니다 (ExitCode: $($buildProc.ExitCode))."
    exit 1
}
Write-Host "[성공] 빌드 완료."

# 5. 백그라운드 프리뷰 서버 실행 (127.0.0.1:4173, 숨김 창)
# 중요: npm 래퍼 대신 node.exe와 Vite 실행 바이너리의 절대 경로를 직접 사용하여
# 생성된 프로세스 commandline에 항상 절대 작업 디렉터리가 포함되도록 보장함.
$viteBin = Join-Path $WorkspaceDir "node_modules\vite\bin\vite.js"
if (-not (Test-Path $viteBin)) {
    Write-Error "[오류] Vite 실행 파일($viteBin)을 찾을 수 없습니다."
    exit 1
}

Write-Host "[안내] 백그라운드에서 로컬 서버를 기동합니다..."
$previewStartInfo = New-Object System.Diagnostics.ProcessStartInfo
$previewStartInfo.FileName = "node.exe"
# 인수에 Vite 바이너리 절대 경로를 지정하여 프로세스 커맨드라인에 작업 경로가 절대적으로 남도록 함
$previewStartInfo.Arguments = "`"$viteBin`" preview --host $TargetHost --port $TargetPort"
$previewStartInfo.WorkingDirectory = $WorkspaceDir
$previewStartInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$previewStartInfo.CreateNoWindow = $true
$previewStartInfo.UseShellExecute = $false

$serverProc = [System.Diagnostics.Process]::Start($previewStartInfo)
if (-not $serverProc) {
    Write-Error "[오류] 백그라운드 서버 프로세스 생성에 실패했습니다."
    exit 1
}

# PID 및 생성 시각(StartTimeUtc) 저장 (PID 재사용 방지)
$procStartTimeUtc = $null
try { $procStartTimeUtc = $serverProc.StartTime.ToUniversalTime().ToString("o") } catch {}

$pidData = [PSCustomObject]@{
    pid = $serverProc.Id
    startTimeUtc = $procStartTimeUtc
    workspace = $WorkspaceDir
    targetPort = $TargetPort
    createdAt = (Get-Date).ToUniversalTime().ToString("o")
}
$pidData | ConvertTo-Json | Set-Content -Path $PidFile -Encoding UTF8 -Force
Write-Host "[정보] 서버 프로세스 시작됨 (PID: $($serverProc.Id), 작업경로: $WorkspaceDir)."

# 6. 포트 활성화 대기 (최대 15초)
$maxRetries = 15
$ready = $false
Write-Host "[안내] 서버 준비를 대기합니다..."

for ($i = 1; $i -le $maxRetries; $i++) {
    Start-Sleep -Seconds 1
    $currentPid = Get-PortProcessId -Port $TargetPort
    if ($currentPid) {
        $ready = $true
        # 실제 청취 중인 PID 정보와 시각으로 갱신
        $listenInfo = Get-ProcessOwnershipInfo -ProcessId $currentPid -ExpectedDir $WorkspaceDir
        $pidData = [PSCustomObject]@{
            pid = $currentPid
            parentPid = $serverProc.Id
            startTimeUtc = if ($listenInfo.StartTimeUtc) { $listenInfo.StartTimeUtc.ToString("o") } else { $procStartTimeUtc }
            workspace = $WorkspaceDir
            targetPort = $TargetPort
            createdAt = (Get-Date).ToUniversalTime().ToString("o")
        }
        $pidData | ConvertTo-Json | Set-Content -Path $PidFile -Encoding UTF8 -Force
        break
    }
}

if (-not $ready) {
    Write-Warning "[경고] 포트 $TargetPort 이(가) 15초 내에 열리지 않았습니다. 서버 백그라운드 상태를 확인하세요."
} else {
    Write-Host "[성공] 로컬 조직보드 서버가 정상적으로 활성화되었습니다 ($AppUrl)."
}

# 7. 웹 브라우저 자동 오픈
Write-Host "[안내] 기본 브라우저에서 $AppUrl 을(를) 엽니다..."
Start-Process $AppUrl

Write-Host "===================================================="
Write-Host " 조직보드가 정상 실행 중입니다."
Write-Host " - 접속 주소: $AppUrl"
Write-Host " - 영구 사용자 데이터 보관 없음 (브라우저 세션 메모리 동작)"
Write-Host " - 종료 시: stop-org-board.cmd 실행"
Write-Host "===================================================="
exit 0
