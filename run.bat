@echo off
REM ============================================
REM Organizer 2.0 - Script de Lancement
REM ============================================

echo.
echo ========================================
echo    Organizer 2.0 - Dofus Window Organizer
echo ========================================
echo.

REM Vérifier si l'executable existe
if exist "src-tauri\target\release\rustfocus.exe" (
    echo [INFO] Lancement de Organizer 2.0...
    echo.
    start "" "src-tauri\target\release\rustfocus.exe"
    echo [OK] Organizer 2.0 demarre!
    echo.
    timeout /t 2 /nobreak >nul
    exit /b 0
)

REM Si pas d'exe, essayer en mode debug
if exist "src-tauri\target\debug\rustfocus.exe" (
    echo [INFO] Executable release non trouve, lancement en mode debug...
    echo.
    start "" "src-tauri\target\debug\rustfocus.exe"
    echo [OK] Organizer 2.0 demarre (mode debug)!
    echo.
    timeout /t 2 /nobreak >nul
    exit /b 0
)

REM Aucun exe trouvé
echo [ERREUR] Executable non trouve!
echo.
echo L'application n'a pas encore ete compilee.
echo.
echo Choisissez une option:
echo   1. Compiler maintenant (mode release)
echo   2. Compiler en mode dev (plus rapide)
echo   3. Annuler
echo.

choice /c 123 /n /m "Votre choix (1, 2 ou 3): "

if errorlevel 3 exit /b 1
if errorlevel 2 goto devbuild
if errorlevel 1 goto releasebuild

:releasebuild
echo.
echo [INFO] Lancement du build en mode release...
call build.bat
if %errorlevel% equ 0 (
    echo.
    echo [INFO] Build termine, lancement de l'application...
    start "" "src-tauri\target\release\rustfocus.exe"
)
exit /b %errorlevel%

:devbuild
echo.
echo [INFO] Compilation en mode dev (debug)...
cd src-tauri
cargo build
cd ..
if %errorlevel% equ 0 (
    echo.
    echo [INFO] Build termine, lancement de l'application...
    start "" "src-tauri\target\debug\rustfocus.exe"
)
exit /b %errorlevel%
