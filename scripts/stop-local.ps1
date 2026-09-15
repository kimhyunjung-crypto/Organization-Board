# UTF-8 출력 설정
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceDir = (Split-Path -Parent $ScriptDir).TrimEnd('\')
$TmpDir = Join-Path $WorkspaceDir "tmp"
$PidFile = Join-Path $TmpDir "org-board.pid"
$TargetPort = 4173

Write-Host "===================================================="
Write-Host " 조직보드 (Org Board) Windows 로컬 종료 스크립트"
Write-Host " 작업 디렉터리: $WorkspaceDir"
Write-Host "===================================================="

function Get-PortProcessId {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        return [int]$connections[0].OwningProcess
    }
    return $null
}

function Test-ProcessOwnedAndValid {
    param(
        [int]$ProcessId,
        [string]$ExpectedDir,
        [string]$ExpectedStartTimeUtc
    )

    $p = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $p) {
        return $false
    }

    # 1. 프로세스 생성 시각(StartTime) 일치 여부 점검 (PID 재사용 방지)
    if ($ExpectedStartTimeUtc) {
        try {
            $expectedUtc = [DateTime]::Parse($ExpectedStartTimeUtc)
            $actualUtc = $p.StartTime.ToUniversalTime()
            if ([Math]::Abs(($actualUtc - $expectedUtc).TotalSeconds) -gt 3.0) {
                Write-Warning "[경고] 프로세스 PID $ProcessId 은(는) 시스템에서 재사용된 다른 프로세스입니다 (기존 시작 시각 불일치). 안전을 위해 종료하지 않습니다."
                return $false
            }
        } catch {
            # 시각 파싱 실패 시 커맨드라인 검사로 계속 진행
        }
    }

    # 2. 커맨드라인 및 실행 파일의 작업 디렉터리 소유권 점검
    $isOwned = $false
    try {
        $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
        if ($cim) {
            $cmd = $cim.CommandLine
            $exec = $cim.ExecutablePath
            if (($cmd -and $cmd.IndexOf($ExpectedDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) -or
                ($exec -and $exec.IndexOf($ExpectedDir, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)) {
                $isOwned = $true
            }
        }
    } catch {
        return $false
    }

    if (-not $isOwned) {
        Write-Warning "[경고] 프로세스 PID $ProcessId 은(는) 현재 작업 디렉터리($ExpectedDir)에서 시작된 프로세스로 확인되지 않습니다. 안전을 위해 강제 종료하지 않습니다."
        return $false
    }

    return $true
}

function Stop-OwnedProcessTree {
    param(
        [int]$ProcessId,
        [string]$ExpectedDir,
        [string]$ExpectedStartTimeUtc = $null
    )

    $isValid = Test-ProcessOwnedAndValid -ProcessId $ProcessId -ExpectedDir $ExpectedDir -ExpectedStartTimeUtc $ExpectedStartTimeUtc
    if (-not $isValid) {
        return $false
    }

    Write-Host "[안내] 확인된 조직보드 프로세스 트리(PID: $ProcessId)를 종료합니다..."
    try {
        & taskkill.exe /PID $ProcessId /T /F | Out-Null
        Write-Host "[성공] 프로세스 PID $ProcessId 및 모든 하위 프로세스가 안전하게 종료되었습니다."
        return $true
    } catch {
        Write-Warning "[경고] taskkill 실행 중 예외가 발생하여 Stop-Process로 대체 시도합니다: $_"
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
        return $true
    }
}

$stoppedAny = $false

# 1. 저장된 PID 파일 기반 종료
if (Test-Path $PidFile) {
    $rawContent = Get-Content $PidFile -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
    $pidsToCheck = @()
    $savedStartTimeUtc = $null

    if ($rawContent) {
        try {
            $jsonData = $rawContent | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($jsonData) {
                if ($jsonData.pid) { $pidsToCheck += [int]$jsonData.pid }
                if ($jsonData.parentPid) { $pidsToCheck += [int]$jsonData.parentPid }
                if ($jsonData.startTimeUtc) { $savedStartTimeUtc = $jsonData.startTimeUtc }
            }
        } catch {}

        # JSON이 아닌 단순 텍스트 백업 형식 처리
        if ($pidsToCheck.Count -eq 0) {
            $lines = $rawContent -split "\r?\n" | Where-Object { $_ -match '^\d+$' }
            foreach ($line in $lines) {
                $pidsToCheck += [int]$line
            }
        }
    }

    foreach ($pidToStop in ($pidsToCheck | Select-Object -Unique)) {
        if ($pidToStop -gt 0) {
            $result = Stop-OwnedProcessTree -ProcessId $pidToStop -ExpectedDir $WorkspaceDir -ExpectedStartTimeUtc $savedStartTimeUtc
            if ($result) {
                $stoppedAny = $true
            }
        }
    }

    # PID 파일 정리
    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
}

# 2. 포트 4173 청취 프로세스 잔존 여부 추가 점검
$listeningPid = Get-PortProcessId -Port $TargetPort
if ($listeningPid) {
    Write-Host "[안내] 포트 $TargetPort 에 활성 청취 중인 프로세스(PID: $listeningPid)가 감지되었습니다. 소유권을 검증합니다..."
    $result = Stop-OwnedProcessTree -ProcessId $listeningPid -ExpectedDir $WorkspaceDir
    if ($result) {
        $stoppedAny = $true
    } else {
        Write-Error "[주의] 포트 $TargetPort 을(를) 사용 중인 프로세스(PID: $listeningPid)는 현재 조직보드 작업 디렉터리의 프로세스가 아니므로 보존되었습니다."
    }
}

if ($stoppedAny) {
    Write-Host "===================================================="
    Write-Host " 조직보드가 정상적으로 안전하게 종료되었습니다."
    Write-Host "===================================================="
} else {
    Write-Host "===================================================="
    Write-Host " [안내] 현재 실행 중인 조직보드 프로세스가 없습니다."
    Write-Host "===================================================="
}

exit 0
