# CRM Code-Barres - Next.js + Flask

Application web pour scanner des codes-barres/QR codes et gérer un inventaire.

## 🚀 Architecture

- **Backend**: Python Flask (API + SSE)
- **Frontend**: Next.js 15 + Chakra UI
- **Base de données**: SQLite locale

## 📦 Installation

### Prérequis

- Node.js 18+ 
- Python 3.8+
- Yarn ou npm

### Installation des dépendances

```bash
# 1. Installer les dépendances Python
pip install -r requirements.txt

# 2. Installer les dépendances Frontend
cd horizon-ui-template
yarn install
cd ..
```

## 🔥 Mode Développement (RECOMMANDÉ)

**Changements automatiquement rechargés sans rebuild !**

### Windows

```bash
# Double-cliquez sur dev.bat
# ou en ligne de commande:
dev.bat
```

### Linux/Mac

```bash
chmod +x dev.sh
./dev.sh
```

### Manuellement (2 terminaux)

**Terminal 1 - Backend Flask:**
```bash
python server.py
```

**Terminal 2 - Frontend Next.js:**
```bash
cd horizon-ui-template
yarn dev
```

Ouvrir `http://localhost:3000` dans le navigateur.

Les changements dans le code frontend sont automatiquement rechargés (hot reload).

## 📦 Mode Production (Export statique)

Pour un déploiement sans Node.js, construire le frontend:

```bash
cd horizon-ui-template
yarn build
cd ..
python server.py
```

Ouvrir `http://localhost:5000` dans le navigateur.

## 📖 Fonctionnalités

- 📷 Scanner de codes-barres et QR codes avec caméra
- 🔍 Recherche automatique d'informations produit
- 📸 Capture/Upload d'images pour les produits
- 📊 Dashboard d'inventaire avec gestion complète
- 📁 Import/Export CSV
- 🏷️ Gestion de catégories personnalisées
- 📱 Interface responsive et moderne

## 📝 Structure du projet

```
/
├── server.py               # Serveur API Flask
├── dev.bat                 # Script mode développement (Windows)
├── dev.sh                  # Script mode développement (Linux/Mac)
├── start.bat               # Script mode production (Windows)
├── start.sh                # Script mode production (Linux/Mac)
├── requirements.txt        # Dépendances Python
├── data/                   # Base de données SQLite
│   └── inventory.db
└── horizon-ui-template/    # Code source Frontend
    ├── src/                # Sources React/Next.js
    ├── out/                # Build statique (mode production)
    └── package.json
```

## 🔧 Configuration

### Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `APP_MODE` | `development` | Mode: `development` ou `production` |
| `SERVER_PORT` | `5000` | Port du serveur API |
| `CORS_ORIGINS` | `localhost:*` | Origines CORS autorisées |
| `DB_PATH` | `data/inventory.db` | Chemin de la base SQLite |
| `TESSERACT_PATH` | (auto) | Chemin vers Tesseract OCR |

## 🐛 Dépannage

### Port déjà utilisé

```bash
# Windows:
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Linux/Mac:
lsof -ti:5000 | xargs kill -9
```

### Erreur CORS

En mode développement, assurez-vous que le frontend utilise bien `http://localhost:5000/api` dans `.env.local`.

## 📄 Licence

Libre d'utilisation.
