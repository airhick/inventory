#!/bin/bash

echo "============================================"
echo "  Code Bar CRM - Démarrage Docker"
echo "============================================"
echo ""

# Vérifier si Docker est installé
if ! command -v docker &> /dev/null; then
    echo "[ERREUR] Docker n'est pas installé"
    echo "Installez Docker depuis https://www.docker.com/get-started"
    exit 1
fi

echo "[OK] Docker est disponible"
echo ""

# Vérifier si docker-compose est installé
if ! command -v docker-compose &> /dev/null; then
    echo "[ERREUR] docker-compose n'est pas installé"
    echo "Installez docker-compose ou utilisez Docker Desktop"
    exit 1
fi

echo "[OK] docker-compose est disponible"
echo ""

echo "Construction et démarrage des conteneurs..."
docker-compose up -d --build

if [ $? -eq 0 ]; then
    echo ""
    echo "============================================"
    echo "  Application démarrée avec succès!"
    echo "============================================"
    echo ""
    echo "  Frontend (Interface):  http://localhost:3000"
    echo "  Backend (API):         http://localhost:5000"
    echo ""
    echo "Pour voir les logs:      docker-compose logs -f"
    echo "Pour arrêter:            docker-compose down"
    echo ""
    echo "============================================"
else
    echo ""
    echo "[ERREUR] Erreur lors du démarrage"
    echo "Vérifiez les logs avec: docker-compose logs"
    exit 1
fi
