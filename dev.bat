@echo off
echo ========================================
echo  MODE DEVELOPPEMENT - Code Bar CRM
echo ========================================
echo.

REM Demarrer le backend Flask dans une nouvelle fenetre
echo [1/2] Demarrage du backend Flask (port 5000)...
start "Backend Flask" cmd /c "python server.py"

REM Attendre que Flask demarre
timeout /t 3 /nobreak >nul

REM Demarrer le frontend Next.js dans une nouvelle fenetre
echo [2/2] Demarrage du frontend Next.js (port 3000)...
cd horizon-ui-template
start "Frontend Next.js" cmd /c "npx yarn dev"

echo.
echo ========================================
echo  Serveurs demarres!
echo.
echo  Frontend: http://localhost:3000
echo  Backend:  http://localhost:5000
echo.
echo  Les changements frontend sont
echo  automatiquement recharges (hot reload)
echo ========================================
echo.
echo Appuyez sur une touche pour fermer cette fenetre...
pause >nul
