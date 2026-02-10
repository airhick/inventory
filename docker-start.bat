@echo off
echo ============================================
echo   Code Bar CRM - Demarrage Docker
echo ============================================
echo.

echo Verification de Docker Desktop...
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Docker Desktop n'est pas installe ou demarre
    echo Installez Docker Desktop depuis https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

echo [OK] Docker est disponible
echo.

echo Construction et demarrage des conteneurs...
docker-compose up -d --build

if errorlevel 1 (
    echo.
    echo [ERREUR] Erreur lors du demarrage
    echo Verifiez les logs avec: docker-compose logs
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Application demarree avec succes!
echo ============================================
echo.
echo   Frontend (Interface):  http://localhost:3000
echo   Backend (API):         http://localhost:5000
echo.
echo Pour voir les logs:      docker-compose logs -f
echo Pour arreter:            docker-compose down
echo.
echo ============================================
pause
