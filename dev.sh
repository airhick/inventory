#!/bin/bash
echo "========================================"
echo " MODE DEVELOPPEMENT - Code Bar CRM"
echo "========================================"
echo ""

# Fonction pour nettoyer à la sortie
cleanup() {
    echo ""
    echo "Arrêt des serveurs..."
    kill $FLASK_PID 2>/dev/null
    kill $NEXT_PID 2>/dev/null
    exit 0
}
trap cleanup SIGINT SIGTERM

# Démarrer le backend Flask en arrière-plan
echo "[1/2] Démarrage du backend Flask (port 5000)..."
python server.py &
FLASK_PID=$!

# Attendre que Flask démarre
sleep 3

# Démarrer le frontend Next.js en arrière-plan
echo "[2/2] Démarrage du frontend Next.js (port 3000)..."
cd horizon-ui-template
npx yarn dev &
NEXT_PID=$!

echo ""
echo "========================================"
echo " Serveurs démarrés!"
echo ""
echo " Frontend: http://localhost:3000"
echo " Backend:  http://localhost:5000"
echo ""
echo " Les changements frontend sont"
echo " automatiquement rechargés (hot reload)"
echo "========================================"
echo ""
echo "Appuyez Ctrl+C pour arrêter les serveurs"

# Attendre
wait
