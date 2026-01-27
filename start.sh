#!/bin/bash

echo "============================================================"
echo "  CODE BAR CRM - Démarrage"
echo "============================================================"
echo ""

# Vérifier si Python est installé
if ! command -v python3 &> /dev/null; then
    if ! command -v python &> /dev/null; then
        echo "[ERREUR] Python n'est pas installé"
        exit 1
    fi
    PYTHON_CMD="python"
else
    PYTHON_CMD="python3"
fi

# Vérifier si le frontend est buildé
if [ ! -f "horizon-ui-template/out/index.html" ]; then
    echo "[INFO] Le frontend n'est pas encore buildé."
    echo ""
    
    # Vérifier si node est installé
    if ! command -v node &> /dev/null; then
        echo "[ERREUR] Node.js n'est pas installé."
        exit 1
    fi
    
    echo "[BUILD] Construction du frontend..."
    cd horizon-ui-template
    
    # Installer les dépendances si nécessaire
    if [ ! -d "node_modules" ]; then
        echo "[BUILD] Installation des dépendances..."
        yarn install || npm install
    fi
    
    echo "[BUILD] Build du frontend (cela peut prendre quelques minutes)..."
    yarn build || npm run build
    cd ..
    
    if [ -f "horizon-ui-template/out/index.html" ]; then
        echo "[BUILD] Frontend buildé avec succès!"
    else
        echo "[ERREUR] Échec du build."
        exit 1
    fi
fi

echo ""
echo "[START] Démarrage du serveur..."
echo ""
$PYTHON_CMD server.py
