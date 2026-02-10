@echo off
cd /d "%~dp0"
echo ========================================
echo  MODE DEVELOPPEMENT - Code Bar CRM
echo  Une commande, un seul port (3000)
echo ========================================
echo.
echo  Demarrage : Frontend (Next) + Backend (Flask)...
echo  Modif frontend ou backend = rechargement en direct.
echo.
npm run dev
pause
