@echo off
REM ============================================
REM RustFocus - Mise a Jour
REM ============================================

echo.
echo ========================================
echo    RustFocus - Mise a Jour
echo ========================================
echo.

REM Vérifier si Rust est installé
where rustup >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Rust n'est pas installe!
    echo Veuillez d'abord executer install.bat
    pause
    exit /b 1
)

echo [1/3] Mise a jour de Rust...
echo.
rustup update stable
echo.

echo [2/3] Mise a jour des dependances...
echo.
cd src-tauri
cargo update
echo.

echo [3/3] Recompilation avec les dernieres versions...
echo.
cargo build --release
cd ..

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo    MISE A JOUR TERMINEE!
    echo ========================================
    echo.
) else (
    echo.
    echo ========================================
    echo    ERREUR LORS DE LA MISE A JOUR
    echo ========================================
    echo.
)

pause
