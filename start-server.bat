@echo off
echo Demarrage du serveur sur localhost:8000...
echo.

REM Vérifier si Python est disponible
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo Python detecte, demarrage du serveur...
    python start-server.py
) else (
    echo Python non trouve. Tentative avec python3...
    python3 --version >nul 2>&1
    if %errorlevel% == 0 (
        python3 start-server.py
    ) else (
        echo.
        echo ERREUR: Python n'est pas installe ou n'est pas dans le PATH.
        echo.
        echo Veuillez installer Python depuis https://www.python.org/
        echo OU utilisez une autre methode pour demarrer un serveur HTTP.
        echo.
        pause
    )
)
