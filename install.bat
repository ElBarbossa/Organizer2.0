@echo off
REM ============================================
REM Organizer 2.0 - Installation Complete
REM ============================================

echo.
echo ========================================
echo    Organizer 2.0 - Installation
echo ========================================
echo.

REM Étape 1: Build
echo [ETAPE 1/2] Compilation de l'application...
echo.
call build.bat

if %errorlevel% neq 0 (
    echo.
    echo [ERREUR] La compilation a echoue!
    pause
    exit /b 1
)

echo.
echo ========================================
echo.

REM Étape 2: Créer un raccourci sur le bureau (optionnel)
echo [ETAPE 2/2] Creation du raccourci...
echo.

set "EXE_PATH=%~dp0src-tauri\target\release\rustfocus.exe"
set "DESKTOP=%USERPROFILE%\Desktop"

if exist "%EXE_PATH%" (
    powershell.exe -ExecutionPolicy Bypass -Command ^
    "$ws = New-Object -ComObject WScript.Shell; ^
     $shortcut = $ws.CreateShortcut('%DESKTOP%\Organizer 2.0.lnk'); ^
     $shortcut.TargetPath = '%EXE_PATH%'; ^
     $shortcut.WorkingDirectory = '%~dp0'; ^
     $shortcut.Description = 'Organizer 2.0 - Dofus Window Organizer'; ^
     $shortcut.Save()"

    if exist "%DESKTOP%\Organizer 2.0.lnk" (
        echo [OK] Raccourci cree sur le bureau!
    ) else (
        echo [INFO] Impossible de creer le raccourci (non critique)
    )
) else (
    echo [AVERTISSEMENT] Executable non trouve, raccourci non cree
)

echo.
echo ========================================
echo    INSTALLATION TERMINEE!
echo ========================================
echo.
echo Organizer 2.0 est maintenant installe.
echo.
echo Pour lancer l'application:
echo   - Double-cliquez sur le raccourci du bureau
echo   - OU executez: run.bat
echo   - OU lancez directement: src-tauri\target\release\rustfocus.exe
echo.

pause
