# ============================================
# RustFocus - Script Unifié SIMPLIFIÉ
# ============================================
# Usage: .\rustfocus.ps1 [build|run|debug|all]
# ============================================

param(
    [string]$Action = ""
)

$ErrorActionPreference = "Continue"

# ============================================
# FONCTIONS UTILITAIRES
# ============================================

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "   $Text" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Text)
    Write-Host "[INFO] $Text" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$Text)
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-ErrorMsg {
    param([string]$Text)
    Write-Host "[ERREUR] $Text" -ForegroundColor Red
}

# ============================================
# RAFRAICHIR LE PATH
# ============================================

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")

    # Ajouter le chemin Cargo standard si pas déjà dans PATH
    $cargoPath = "$env:USERPROFILE\.cargo\bin"
    if ((Test-Path $cargoPath) -and ($env:Path -notlike "*$cargoPath*")) {
        $env:Path = "$cargoPath;$env:Path"
    }
}

# ============================================
# VERIFICATIONS SIMPLIFIEES
# ============================================

function Test-RustWorks {
    Refresh-Path

    try {
        $null = cargo --version 2>&1
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
}

function Verify-Tools {
    Write-Header "Vérification des outils"

    Refresh-Path

    # Test Rust
    Write-Step "Test de Rust/Cargo..."
    if (Test-RustWorks) {
        $version = cargo --version
        Write-Success "Rust disponible: $version"
        return $true
    }
    else {
        Write-ErrorMsg "Cargo introuvable"
        Write-Host ""
        Write-Host "Rust doit être installé manuellement:" -ForegroundColor Yellow
        Write-Host "1. Allez sur: https://rustup.rs/" -ForegroundColor White
        Write-Host "2. Téléchargez et installez rustup" -ForegroundColor White
        Write-Host "3. Redémarrez PowerShell" -ForegroundColor White
        Write-Host "4. Relancez ce script" -ForegroundColor White
        Write-Host ""
        return $false
    }
}

# ============================================
# FONCTIONS BUILD
# ============================================

function Build-RustFocus {
    param([bool]$Release = $true)

    $mode = if ($Release) { "RELEASE" } else { "DEBUG" }
    Write-Header "Compilation RustFocus ($mode)"

    if (-not (Verify-Tools)) {
        return $false
    }

    Push-Location "$PSScriptRoot\src-tauri"

    try {
        Write-Step "Compilation en cours..."
        Write-Host "(Première compilation: 5-15 minutes, suivantes: <1 minute)" -ForegroundColor DarkGray
        Write-Host ""

        if ($Release) {
            cargo build --release
        }
        else {
            cargo build
        }

        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "========================================" -ForegroundColor Green
            Write-Host "   COMPILATION REUSSIE" -ForegroundColor Green
            Write-Host "========================================" -ForegroundColor Green

            $exePath = if ($Release) { "target\release\rustfocus.exe" } else { "target\debug\rustfocus.exe" }
            $fullPath = Join-Path $PSScriptRoot "src-tauri\$exePath"

            if (Test-Path $fullPath) {
                $exeSize = (Get-Item $fullPath).Length / 1MB
                Write-Host ""
                Write-Host "Executable: $fullPath" -ForegroundColor Cyan
                Write-Host "Taille: $([math]::Round($exeSize, 2)) Mo" -ForegroundColor Cyan
            }
            Write-Host ""

            return $true
        }
        else {
            Write-Host ""
            Write-Host "========================================" -ForegroundColor Red
            Write-Host "   ERREUR DE COMPILATION (code: $LASTEXITCODE)" -ForegroundColor Red
            Write-Host "========================================" -ForegroundColor Red
            Write-Host ""
            return $false
        }
    }
    catch {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Red
        Write-Host "   ERREUR: $_" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Red
        Write-Host ""
        return $false
    }
    finally {
        Pop-Location
    }
}

# ============================================
# FONCTIONS RUN
# ============================================

function Run-RustFocus {
    param([bool]$Release = $true)

    $mode = if ($Release) { "release" } else { "debug" }
    $exePath = "$PSScriptRoot\src-tauri\target\$mode\rustfocus.exe"

    if (-not (Test-Path $exePath)) {
        Write-ErrorMsg "Executable introuvable: $exePath"
        Write-Host ""
        Write-Host "Compilez d'abord avec:" -ForegroundColor Yellow

        if ($Release) {
            Write-Host "  .\rustfocus.ps1 build" -ForegroundColor White
        }
        else {
            Write-Host "  .\rustfocus.ps1 build-debug" -ForegroundColor White
        }

        Write-Host ""
        return
    }

    $modeText = if ($Release) { "RELEASE" } else { "DEBUG" }
    Write-Header "Lancement RustFocus ($modeText)"

    if (-not $Release) {
        Write-Host "Mode DEBUG activé:" -ForegroundColor Yellow
        Write-Host "- Les logs console.log() s'affichent ci-dessous" -ForegroundColor Green
        Write-Host "- DevTools (F12) disponible dans l'application" -ForegroundColor Green
        Write-Host ""
        Write-Host "========================================" -ForegroundColor DarkGray
        Write-Host "   LOGS DE L'APPLICATION" -ForegroundColor DarkGray
        Write-Host "========================================" -ForegroundColor DarkGray
        Write-Host ""
    }

    # Lancer l'executable
    & $exePath

    $exitCode = $LASTEXITCODE

    if (-not $Release) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor DarkGray
        Write-Host "   FIN DES LOGS" -ForegroundColor DarkGray
        Write-Host "========================================" -ForegroundColor DarkGray
    }

    if ($exitCode -ne 0 -and $null -ne $exitCode) {
        Write-Host ""
        Write-ErrorMsg "L'application s'est terminée avec le code: $exitCode"
        Write-Host ""

        if ($Release) {
            Write-Host "Astuce: Lancez en mode DEBUG pour voir les logs:" -ForegroundColor Yellow
            Write-Host "  .\rustfocus.ps1 debug" -ForegroundColor White
            Write-Host ""
        }
    }
}

# ============================================
# MENU INTERACTIF
# ============================================

function Show-Menu {
    Write-Header "RustFocus - Menu Principal"

    Write-Host "Que voulez-vous faire?" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  1. Build RELEASE (optimisé)" -ForegroundColor White
    Write-Host "  2. Build DEBUG (avec logs)" -ForegroundColor White
    Write-Host "  3. Run RELEASE" -ForegroundColor White
    Write-Host "  4. Run DEBUG" -ForegroundColor White
    Write-Host "  5. Build + Run RELEASE" -ForegroundColor White
    Write-Host "  6. Build + Run DEBUG (RECOMMANDÉ pour tester)" -ForegroundColor Green
    Write-Host "  7. Quitter" -ForegroundColor White
    Write-Host ""

    $choice = Read-Host "Votre choix (1-7)"

    switch ($choice) {
        "1" {
            Build-RustFocus -Release $true
            pause
            Show-Menu
        }
        "2" {
            Build-RustFocus -Release $false
            pause
            Show-Menu
        }
        "3" {
            Run-RustFocus -Release $true
            pause
            Show-Menu
        }
        "4" {
            Run-RustFocus -Release $false
            pause
            Show-Menu
        }
        "5" {
            $success = Build-RustFocus -Release $true
            if ($success) {
                Run-RustFocus -Release $true
            }
            pause
            Show-Menu
        }
        "6" {
            $success = Build-RustFocus -Release $false
            if ($success) {
                Run-RustFocus -Release $false
            }
            pause
            Show-Menu
        }
        "7" {
            Write-Host "Au revoir!" -ForegroundColor Cyan
            exit 0
        }
        default {
            Write-ErrorMsg "Choix invalide: $choice"
            Start-Sleep -Seconds 1
            Show-Menu
        }
    }
}

# ============================================
# POINT D'ENTREE PRINCIPAL
# ============================================

Clear-Host

if ($Action -eq "") {
    # Mode interactif
    Show-Menu
}
else {
    # Mode ligne de commande
    switch ($Action.ToLower()) {
        "build" {
            Build-RustFocus -Release $true
        }
        "build-debug" {
            Build-RustFocus -Release $false
        }
        "run" {
            Run-RustFocus -Release $true
        }
        "debug" {
            Run-RustFocus -Release $false
        }
        "all" {
            $success = Build-RustFocus -Release $true
            if ($success) {
                Run-RustFocus -Release $true
            }
        }
        default {
            Write-ErrorMsg "Action inconnue: $Action"
            Write-Host ""
            Write-Host "Actions disponibles:" -ForegroundColor Yellow
            Write-Host "  build        - Compiler en mode release" -ForegroundColor White
            Write-Host "  build-debug  - Compiler en mode debug" -ForegroundColor White
            Write-Host "  run          - Lancer en mode release" -ForegroundColor White
            Write-Host "  debug        - Lancer en mode debug" -ForegroundColor White
            Write-Host "  all          - Build + Run release" -ForegroundColor White
            Write-Host ""
            Write-Host "Sans argument: affiche le menu interactif" -ForegroundColor Yellow
            Write-Host ""
            exit 1
        }
    }
}
