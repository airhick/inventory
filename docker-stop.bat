@echo off
echo ============================================
echo   Code Bar CRM - Arret Docker
echo ============================================
echo.

echo Arret des conteneurs...
docker-compose down

echo.
echo [OK] Application arretee
echo.
pause
