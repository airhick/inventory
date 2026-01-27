@echo off
echo ============================================================
echo   CODE BAR CRM - Demarrage
echo ============================================================
echo.

REM Verifier si Python est installe
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Python n'est pas installe ou pas dans le PATH
    pause
    exit /b 1
)

REM Verifier si le frontend est builde
if not exist "horizon-ui-template\out\index.html" (
    echo [INFO] Le frontend n'est pas encore builde.
    echo.
    
    REM Verifier si node est installe
    node --version >nul 2>&1
    if errorlevel 1 (
        echo [ERREUR] Node.js n'est pas installe. Installez-le depuis https://nodejs.org
        pause
        exit /b 1
    )
    
    echo [BUILD] Construction du frontend...
    cd horizon-ui-template
    
    REM Installer les dependances si necessaire
    if not exist "node_modules" (
        echo [BUILD] Installation des dependances...
        call yarn install
    )
    
    echo [BUILD] Build du frontend (cela peut prendre quelques minutes)...
    call yarn build
    cd ..
    
    if exist "horizon-ui-template\out\index.html" (
        echo [BUILD] Frontend builde avec succes!
    ) else (
        echo [ERREUR] Echec du build. Verifiez les erreurs ci-dessus.
        pause
        exit /b 1
    )
)

echo.
echo [START] Demarrage du serveur...
echo.
python server.py

pause
