# ============================================
# Organizer 2.0 - Script Unifie SIMPLIFIE
# ============================================
# Usage: .\rustfocus.ps1 [build|run|debug|all]
# ============================================

param(
    [string]$Action = ""
)

# Fix UTF-8 encoding for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

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

    # Ajouter le chemin Cargo standard si pas deja dans PATH
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
    Write-Header "Verification des outils"

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
        Write-Host "Rust doit etre installe manuellement:" -ForegroundColor Yellow
        Write-Host "1. Allez sur: https://rustup.rs/" -ForegroundColor White
        Write-Host "2. Telechargez et installez rustup" -ForegroundColor White
        Write-Host "3. Redemarrez PowerShell" -ForegroundColor White
        Write-Host "4. Relancez ce script" -ForegroundColor White
        Write-Host ""
        return $false
    }
}

# ============================================
# FONCTIONS BUILD
# ============================================

function Read-JsonFile {
    param([string]$Path)
    return Get-Content -Path $Path -Raw | ConvertFrom-Json
}

function Write-JsonFile {
    param(
        [string]$Path,
        [object]$Content
    )
    $json = $Content | ConvertTo-Json -Depth 10
    # Use WriteAllText with UTF8 without BOM to avoid JSON parsing issues
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Build-Release {
    Write-Header "Build Release avec Auto-Update"

    if (-not (Verify-Tools)) {
        return $false
    }

    Write-Step "Verification de cargo-tauri..."
    if (-not (Get-Command cargo-tauri -ErrorAction SilentlyContinue)) {
        Write-Step "Installation de cargo-tauri v1 (Tauri CLI)..."
        Write-Host "   Cela peut prendre quelques minutes..." -ForegroundColor DarkGray
        try {
            cargo install tauri-cli --version "^1.0"
            if ($LASTEXITCODE -ne 0) {
                Write-ErrorMsg "Echec de l'installation de cargo-tauri"
                return $false
            }
            Write-Success "cargo-tauri v1 installe avec succes"
        }
        catch {
            Write-ErrorMsg "Erreur lors de l'installation: $_"
            return $false
        }
    } else {
        Write-Success "cargo-tauri est deja installe"
    }
    Write-Host ""

    Write-Step "Lecture de la version..."
    $tauriConfigPath = Join-Path $PSScriptRoot "src-tauri\tauri.conf.json"
    if (-not (Test-Path $tauriConfigPath)) {
        Write-ErrorMsg "Fichier tauri.conf.json introuvable!"
        return $false
    }

    $tauriConfig = Read-JsonFile -Path $tauriConfigPath
    $currentVersion = $tauriConfig.package.version
    $productName = $tauriConfig.package.productName
    $exeBaseName = "organizer-2-0"  # Nom du binaire genere par Cargo
    Write-Success "Version actuelle: $currentVersion | Produit: $productName"
    Write-Host ""

    # Proposer d'incrementer la version
    Write-Step "Incrementer la version ?"
    $parts = $currentVersion -split '\.'
    $majorNext = "$([int]$parts[0] + 1).0.0"
    $minorNext = "$($parts[0]).$([int]$parts[1] + 1).0"
    $patchNext = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"

    Write-Host "   [1] Major : $currentVersion -> $majorNext" -ForegroundColor Yellow
    Write-Host "   [2] Minor : $currentVersion -> $minorNext" -ForegroundColor Yellow
    Write-Host "   [3] Patch : $currentVersion -> $patchNext" -ForegroundColor Green
    Write-Host "   [N] Non - Conserver $currentVersion (par defaut)" -ForegroundColor White
    $versionChoice = Read-Host "   Votre choix [1/2/3/N]"

    $version = $currentVersion
    if ($versionChoice -eq "1") {
        $version = $majorNext
        Write-Success "Nouvelle version: $version (Major)"
    }
    elseif ($versionChoice -eq "2") {
        $version = $minorNext
        Write-Success "Nouvelle version: $version (Minor)"
    }
    elseif ($versionChoice -eq "3") {
        $version = $patchNext
        Write-Success "Nouvelle version: $version (Patch)"
    }
    else {
        Write-Host "   Version conservee: $version" -ForegroundColor DarkGray
    }

    # Mettre a jour tauri.conf.json et Cargo.toml si la version a change
    if ($version -ne $currentVersion) {
        Write-Step "Mise a jour de tauri.conf.json..."
        $tauriConfig.package.version = $version
        Write-JsonFile -Path $tauriConfigPath -Content $tauriConfig
        Write-Success "Version mise a jour dans tauri.conf.json"

        # Mettre a jour Cargo.toml aussi
        Write-Step "Mise a jour de Cargo.toml..."
        $cargoTomlPath = Join-Path $PSScriptRoot "src-tauri\Cargo.toml"
        if (Test-Path $cargoTomlPath) {
            $cargoContent = Get-Content -Path $cargoTomlPath -Raw
            # Remplacer uniquement la version dans la section [package]
            $cargoContent = $cargoContent -replace '(\[package\][^\[]*?version\s*=\s*")[^"]*"', "`${1}$version`""
            $utf8NoBom = New-Object System.Text.UTF8Encoding $false
            [System.IO.File]::WriteAllText($cargoTomlPath, $cargoContent, $utf8NoBom)
            Write-Success "Version mise a jour dans Cargo.toml"
        } else {
            Write-Host "   [ATTENTION] Cargo.toml introuvable" -ForegroundColor Yellow
        }

        # Committer les changements de version dans Git
        Write-Step "Commit des changements de version dans Git..."
        & git add $tauriConfigPath $cargoTomlPath
        if ($LASTEXITCODE -eq 0) {
            & git commit -m "Bump version to $version"
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Changements de version commites"

                # Demander si on veut push
                Write-Host "   Voulez-vous push les changements maintenant ? [O/N]" -ForegroundColor Yellow
                Write-Host "   (par defaut: Oui)" -ForegroundColor DarkGray
                $pushChoice = Read-Host "   Votre choix"
                if ([string]::IsNullOrWhiteSpace($pushChoice) -or $pushChoice -eq "O" -or $pushChoice -eq "o") {
                    & git push
                    if ($LASTEXITCODE -eq 0) {
                        Write-Success "Changements pousses sur le depot distant"
                    } else {
                        Write-Host "   [ATTENTION] Echec du push - Vous devrez push manuellement" -ForegroundColor Yellow
                    }
                } else {
                    Write-Host "   Changements commites localement - N'oubliez pas de push !" -ForegroundColor Yellow
                }
            } else {
                Write-Host "   [ATTENTION] Echec du commit - Les fichiers sont stages" -ForegroundColor Yellow
            }
        } else {
            Write-Host "   [ATTENTION] Echec du staging des fichiers" -ForegroundColor Yellow
        }
    }
    Write-Host ""

    Write-Step "Changelog de la version..."
    Write-Host "   Entrez la description des changements (ligne vide = changelog par defaut):" -ForegroundColor Gray
    $firstLine = Read-Host "   > "

    if ([string]::IsNullOrWhiteSpace($firstLine)) {
        $changelog = @"
Mise a jour vers la version $version

* Nouveautes et ameliorations
* Corrections de bugs
* Optimisations de performance

Consultez les commits sur GitHub pour plus de details.
"@
        Write-Host "   [Changelog par defaut utilise]" -ForegroundColor DarkGray
    } else {
        $changelogLines = @($firstLine)
        while ($true) {
            $line = Read-Host "   > "
            if ([string]::IsNullOrWhiteSpace($line)) { break }
            $changelogLines += $line
        }
        $changelog = $changelogLines -join "`n"
    }
    Write-Host ""

    Write-Step "Compilation de l'executable portable..."
    Write-Host "   Cette etape peut prendre plusieurs minutes..." -ForegroundColor DarkGray
    Push-Location (Join-Path $PSScriptRoot "src-tauri")
    try {
        & cargo build --release
        if ($LASTEXITCODE -ne 0) {
            Write-ErrorMsg "La compilation a echoue (code: $LASTEXITCODE)"
            return $false
        }
    }
    catch {
        Write-ErrorMsg "Erreur de compilation: $_"
        return $false
    }
    finally {
        Pop-Location
    }
    Write-Success "Compilation reussie"
    Write-Host ""

    Write-Step "Preparation des fichiers pour GitHub Release..."
    $productNameForFile = $productName -replace '\s+', '.'

    $releaseFolderPath = Join-Path $PSScriptRoot "release-v$version"
    if (Test-Path $releaseFolderPath) {
        Remove-Item -Path $releaseFolderPath -Recurse -Force
    }
    New-Item -ItemType Directory -Path $releaseFolderPath | Out-Null

    # Copier l'exe portable
    $exePath = Join-Path $PSScriptRoot "src-tauri\target\release\$exeBaseName.exe"
    if (-not (Test-Path $exePath)) {
        Write-ErrorMsg "Fichier .exe introuvable: $exePath"
        return $false
    }

    $finalExeName = "$($productNameForFile)_${version}_portable.exe"
    $finalExePath = Join-Path $releaseFolderPath $finalExeName
    Copy-Item -Path $exePath -Destination $finalExePath -Force
    Write-Success "Executable portable copie: $finalExeName"

    Write-Success "Fichiers prepares dans: $releaseFolderPath"
    Write-Host ""

    Write-Step "Upload GitHub Release"
    Write-Host "   Voulez-vous creer et publier la release automatiquement sur GitHub ?" -ForegroundColor Yellow
    Write-Host "   (Necessite GitHub CLI 'gh' installe et authentifie)" -ForegroundColor DarkGray
    Write-Host "   [O] Oui (par defaut)" -ForegroundColor Green
    Write-Host "   [N] Non" -ForegroundColor White
    $uploadChoice = Read-Host "   Votre choix [O/N]"

    if ([string]::IsNullOrWhiteSpace($uploadChoice) -or $uploadChoice -eq "O" -or $uploadChoice -eq "o") {
        Write-Step "Verification de GitHub CLI (gh)..."
        if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
            Write-ErrorMsg "GitHub CLI (gh) n'est pas disponible"
            Write-Host "   Installation: https://cli.github.com/" -ForegroundColor Yellow
            Write-Host "   Vous devrez creer la release manuellement." -ForegroundColor Yellow
        } else {
            Write-Success "GitHub CLI disponible"

            # Verifier si la release existe deja
            Write-Step "Verification de la release existante..."
            & gh release view "v$version" --repo "ElBarbossa/Organizer2.0" 2>$null
            $releaseExists = $LASTEXITCODE -eq 0

            if ($releaseExists) {
                Write-Host "   La release v$version existe deja." -ForegroundColor Yellow
                Write-Host "   [S] Supprimer et recreer" -ForegroundColor Green
                Write-Host "   [A] Annuler" -ForegroundColor White
                $choice = Read-Host "   Votre choix [S/A]"

                if ($choice -eq "S" -or $choice -eq "s") {
                    Write-Step "Suppression de l'ancienne release..."
                    & gh release delete "v$version" --repo "ElBarbossa/Organizer2.0" --yes
                    if ($LASTEXITCODE -ne 0) {
                        Write-ErrorMsg "Echec de la suppression de la release"
                        return $false
                    }
                    Write-Success "Ancienne release supprimee"
                } else {
                    Write-Host "   Operation annulee." -ForegroundColor Yellow
                    return $true
                }
            }

            Write-Step "Creation de la release sur GitHub..."
            Push-Location $releaseFolderPath
            $notesFile = [System.IO.Path]::GetTempFileName()
            try {
                Set-Content -Path $notesFile -Value $changelog -Encoding UTF8

                # Uploader tous les fichiers du dossier release
                $filesToUpload = Get-ChildItem -Path $releaseFolderPath -File | ForEach-Object { $_.Name }
                Write-Host "   Fichiers a uploader: $($filesToUpload -join ', ')" -ForegroundColor Gray

                & gh release create "v$version" $filesToUpload --title "Version $version" --notes-file $notesFile --repo "ElBarbossa/Organizer2.0"
                if ($LASTEXITCODE -eq 0) {
                    Write-Success "Release publiee avec succes sur GitHub !"
                    Write-Host "   Lien: https://github.com/ElBarbossa/Organizer2.0/releases/tag/v$version" -ForegroundColor Cyan
                } else {
                    Write-ErrorMsg "Echec de la creation de la release (code: $LASTEXITCODE)"
                }
            } catch {
                Write-ErrorMsg "Erreur lors de la creation de la release: $_"
            } finally {
                if (Test-Path $notesFile) { Remove-Item $notesFile -Force }
                Pop-Location
            }
        }
    }
    Write-Host ""

    Write-Host "========================================" -ForegroundColor Green
    Write-Host "   BUILD RELEASE REUSSI" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Fichiers prets pour GitHub:" -ForegroundColor Cyan
    Write-Host "   $releaseFolderPath" -ForegroundColor White
    Write-Host "   +-- $finalExeName (PORTABLE)" -ForegroundColor White
    Write-Host "   +-- latest.json" -ForegroundColor White
    Write-Host ""
    Write-Host "Prochaines etapes:" -ForegroundColor Cyan
    Write-Host "   1. Allez sur https://github.com/ElBarbossa/Organizer2.0/releases" -ForegroundColor White
    Write-Host "   2. Cliquez sur 'Draft a new release'" -ForegroundColor White
    Write-Host "   3. Tag: v$version" -ForegroundColor White
    Write-Host "   4. Uploadez les 2 fichiers du dossier '$releaseFolderPath'" -ForegroundColor White
    Write-Host "   5. Publiez la release" -ForegroundColor White
    Write-Host ""

    return $true
}

function Build-Organizer {
    param([bool]$Release = $true)
    $mode = if ($Release) { "RELEASE" } else { "DEBUG" }
    Write-Header "Compilation Organizer 2.0 ($mode)"
    if (-not (Verify-Tools)) { return $false }
    
    $tauriConfigPath = Join-Path $PSScriptRoot "src-tauri\tauri.conf.json"
    $tauriConfig = Read-JsonFile -Path $tauriConfigPath
    $exeBaseName = "organizer-2-0"  # Nom du binaire genere par Cargo

    Push-Location "$PSScriptRoot\src-tauri"
    try {
        Write-Step "Compilation en cours..."
        if ($Release) { cargo build --release } else { cargo build }

        if ($LASTEXITCODE -eq 0) {
            Write-Success "COMPILATION REUSSIE"
            $exePath = if ($Release) { "target\release\$exeBaseName.exe" } else { "target\debug\$exeBaseName.exe" }
            $fullPath = Join-Path $PSScriptRoot "src-tauri\$exePath"
            if (Test-Path $fullPath) {
                $exeSize = (Get-Item $fullPath).Length / 1MB
                Write-Host "   Executable: $fullPath" -ForegroundColor Cyan
                Write-Host "   Taille: $([math]::Round($exeSize, 2)) Mo" -ForegroundColor Cyan
            }
            return $true
        } else {
            Write-ErrorMsg "ERREUR DE COMPILATION (code: $LASTEXITCODE)"
            return $false
        }
    } catch {
        Write-ErrorMsg "ERREUR: $_"
        return $false
    } finally {
        Pop-Location
    }
}

function Run-Organizer {
    param([bool]$Release = $true)
    $tauriConfigPath = Join-Path $PSScriptRoot "src-tauri\tauri.conf.json"
    $tauriConfig = Read-JsonFile -Path $tauriConfigPath
    $exeBaseName = "organizer-2-0"  # Nom du binaire genere par Cargo
    $mode = if ($Release) { "release" } else { "debug" }
    $exePath = "$PSScriptRoot\src-tauri\target\$mode\$exeBaseName.exe"

    if (-not (Test-Path $exePath)) {
        Write-ErrorMsg "Executable introuvable: $exePath. Compilez d'abord."
        return
    }

    $modeText = if ($Release) { "RELEASE" } else { "DEBUG" }
    Write-Header "Lancement Organizer 2.0 ($modeText)"
    if (-not $Release) {
        Write-Host "Mode DEBUG active. Les logs de l'application vont s'afficher." -ForegroundColor Yellow
    }
    & $exePath
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
        Write-ErrorMsg "L'application s'est terminee avec le code: $LASTEXITCODE"
    }
}

function Show-Menu {
    Clear-Host
    Write-Header "Organizer 2.0 - Menu Principal"
    Write-Host "  1. Build RELEASE (optimise)"
    Write-Host "  2. Build DEBUG (avec logs)"
    Write-Host "  3. Run RELEASE"
    Write-Host "  4. Run DEBUG"
    Write-Host "  5. Build et Run RELEASE"
    Write-Host "  6. Build et Run DEBUG (RECOMMANDE pour tester)" -ForegroundColor Green
    Write-Host "  7. Build GITHUB RELEASE (avec latest.json)" -ForegroundColor Yellow
    Write-Host "  8. Quitter"
    $choice = Read-Host "Votre choix (1-8)"
    switch ($choice) {
        "1" { Build-Organizer -Release $true }
        "2" { Build-Organizer -Release $false }
        "3" { Run-Organizer -Release $true }
        "4" { Run-Organizer -Release $false }
        "5" { if (Build-Organizer -Release $true) { Run-Organizer -Release $true } }
        "6" { if (Build-Organizer -Release $false) { Run-Organizer -Release $false } }
        "7" { Build-Release }
        "8" { Write-Host "Au revoir!"; return }
        default { Write-ErrorMsg "Choix invalide: $choice"; Start-Sleep -Seconds 1 }
    }
    Write-Host "`nAppuyez sur Entree pour continuer..."
    Read-Host | Out-Null
    Show-Menu
}

# ============================================
# POINT D'ENTREE PRINCIPAL
# ============================================

if ([string]::IsNullOrWhiteSpace($Action)) {
    Show-Menu
} else {
    switch ($Action.ToLower()) {
        "build"       { Build-Organizer -Release $true }
        "build-debug" { Build-Organizer -Release $false }
        "run"         { Run-Organizer -Release $true }
        "debug"       { Run-Organizer -Release $false }
        "all"         { if (Build-Organizer -Release $true) { Run-Organizer -Release $true } }
        "release"     { Build-Release }
        default {
            Write-ErrorMsg "Action inconnue: '$Action'"
            Write-Host "Actions disponibles: build, build-debug, run, debug, all, release" -ForegroundColor Yellow
            exit 1
        }
    }
}