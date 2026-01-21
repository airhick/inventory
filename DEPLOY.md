# Guide de déploiement GitHub Pages

## Déploiement sur GitHub Pages

GitHub Pages est gratuit et simple à utiliser. Il suffit de pousser vos fichiers dans un dépôt GitHub et d'activer GitHub Pages.

### Prérequis

- Un compte GitHub
- Git installé sur votre machine

### Étapes de déploiement

#### 1. Créer un dépôt GitHub

1. Allez sur [github.com](https://github.com)
2. Cliquez sur le bouton **"New"** (ou le signe `+` en haut à droite)
3. Donnez un nom à votre dépôt (ex: `barcode-scanner-crm`)
4. Choisissez **Public** ou **Private**
5. **Ne cochez pas** "Initialize this repository with a README"
6. Cliquez sur **"Create repository"**

#### 2. Initialiser Git et pousser les fichiers

Dans le terminal, depuis le dossier de votre projet :

```bash
# Initialiser Git (si pas déjà fait)
git init

# Ajouter tous les fichiers
git add .

# Créer le premier commit
git commit -m "Initial commit: Barcode Scanner CRM"

# Ajouter le dépôt distant (remplacez USERNAME et REPO_NAME)
git remote add origin https://github.com/USERNAME/REPO_NAME.git

# Pousser vers GitHub
git branch -M main
git push -u origin main
```

#### 3. Activer GitHub Pages

1. Allez sur votre dépôt GitHub
2. Cliquez sur **"Settings"** (en haut du dépôt)
3. Dans le menu de gauche, cliquez sur **"Pages"**
4. Sous **"Source"**, sélectionnez :
   - **Branch**: `main`
   - **Folder**: `/ (root)`
5. Cliquez sur **"Save"**

#### 4. Votre site est en ligne ! 🎉

- GitHub génère automatiquement une URL : `https://USERNAME.github.io/REPO_NAME/`
- Le déploiement peut prendre quelques minutes
- Vous verrez l'URL dans la section "Pages" des Settings

### Configuration HTTPS

✅ **HTTPS automatique** : GitHub Pages fournit automatiquement HTTPS pour tous les sites, ce qui est **essentiel** pour l'accès à la caméra dans les navigateurs modernes.

### Mises à jour

Pour mettre à jour votre site :

```bash
# Faire vos modifications dans les fichiers

# Ajouter les changements
git add .

# Committer
git commit -m "Description des modifications"

# Pousser vers GitHub
git push

# GitHub Pages déploiera automatiquement les changements (quelques minutes)
```

### Structure des fichiers

Assurez-vous que votre dépôt contient :

```
.
├── index.html          # Page principale
├── styles.css          # Styles CSS
├── app.js              # Logique JavaScript
├── README.md           # Documentation
└── .gitignore          # Fichiers à ignorer
```

**Important** : `index.html` doit être à la racine du dépôt pour GitHub Pages.

### Domaine personnalisé (optionnel)

Si vous souhaitez utiliser votre propre domaine :

1. Dans les Settings → Pages de votre dépôt
2. Entrez votre domaine dans "Custom domain"
3. Suivez les instructions pour configurer les DNS

### Dépannage

**Le site ne s'affiche pas** :
- Vérifiez que `index.html` est à la racine du dépôt
- Attendez quelques minutes (le déploiement peut prendre du temps)
- Vérifiez l'onglet "Actions" de votre dépôt pour voir les erreurs éventuelles

**La caméra ne fonctionne pas** :
- Assurez-vous d'utiliser HTTPS (GitHub Pages le fournit automatiquement)
- Vérifiez les permissions de la caméra dans les paramètres du navigateur

**Erreurs JavaScript** :
- Ouvrez la console du navigateur (F12) pour voir les erreurs
- Vérifiez que tous les fichiers sont bien poussés sur GitHub

### Support

- Documentation GitHub Pages : https://docs.github.com/en/pages
- Support GitHub : https://support.github.com
