@echo off
REM ============================================
REM RustFocus - Nettoyage des fichiers de build
REM ============================================

echo.
echo ========================================
echo    RustFocus - Nettoyage
echo ========================================
echo.

echo [INFO] Suppression des fichiers temporaires et de build...
echo.

cd src-tauri

if exist "target" (
    echo [INFO] Suppression du dossier target...
    rmdir /s /q target
    echo [OK] Dossier target supprime
)

if exist "Cargo.lock" (
    echo [INFO] Suppression de Cargo.lock...
    del /q Cargo.lock
    echo [OK] Cargo.lock supprime
)

cd ..

echo.
echo [OK] Nettoyage termine!
echo.
echo Pour recompiler, executez: build.bat
echo.

pause
