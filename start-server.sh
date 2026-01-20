#!/bin/bash
# Script pour démarrer le serveur sur localhost:8000

echo "Démarrage du serveur sur localhost:8000..."
echo ""

# Vérifier si Python est disponible
if command -v python3 &> /dev/null; then
    echo "Python3 détecté, démarrage du serveur..."
    python3 start-server.py
elif command -v python &> /dev/null; then
    echo "Python détecté, démarrage du serveur..."
    python start-server.py
else
    echo "ERREUR: Python n'est pas installé ou n'est pas dans le PATH."
    echo ""
    echo "Veuillez installer Python depuis https://www.python.org/"
    echo "OU utilisez une autre méthode pour démarrer un serveur HTTP."
    echo ""
    exit 1
fi
