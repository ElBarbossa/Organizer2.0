@echo off
REM ============================================
REM Organizer 2.0 - Lancement en Mode Developpement
REM ============================================

echo.
echo ========================================
echo    Organizer 2.0 - Mode Developpement
echo ========================================
echo.

REM Vérifier si Cargo est installé
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Cargo n'est pas installe!
    echo.
    echo Veuillez d'abord executer build.bat pour installer Rust.
    echo.
    pause
    exit /b 1
)

echo [INFO] Lancement en mode developpement avec hot-reload...
echo [INFO] Appuyez sur Ctrl+C pour arreter
echo.

cd src-tauri
cargo run
cd ..

pause
