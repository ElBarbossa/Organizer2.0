@echo off
REM ============================================
REM Organizer 2.0 - Script de Build Automatique
REM ============================================

echo.
echo ========================================
echo    Organizer 2.0 - Build Automatique
echo ========================================
echo.

REM Vérifier si PowerShell est disponible
where powershell >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] PowerShell n'est pas installe!
    echo PowerShell est requis pour l'installation automatique.
    pause
    exit /b 1
)

REM Lancer le script PowerShell de build
echo [INFO] Lancement du script PowerShell de build...
powershell.exe -ExecutionPolicy Bypass -File "%~dp0build.ps1"

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo    BUILD TERMINE AVEC SUCCES!
    echo ========================================
    echo.
    echo L'executable se trouve dans:
    echo   src-tauri\target\release\rustfocus.exe
    echo.
    echo L'installeur MSI se trouve dans:
    echo   src-tauri\target\release\bundle\msi\
    echo.
) else (
    echo.
    echo ========================================
    echo    ERREUR LORS DU BUILD
    echo ========================================
    echo.
    echo Verifiez les messages d'erreur ci-dessus.
    echo.
)

pause
