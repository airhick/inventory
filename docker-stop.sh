#!/bin/bash

echo "============================================"
echo "  Code Bar CRM - Arrêt Docker"
echo "============================================"
echo ""

echo "Arrêt des conteneurs..."
docker-compose down

echo ""
echo "[OK] Application arrêtée"
echo ""
