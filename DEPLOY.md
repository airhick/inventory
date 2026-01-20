# Guide de déploiement Netlify

## Déploiement rapide (Drag & Drop)

1. **Préparez les fichiers** :
   - Assurez-vous que tous les fichiers sont dans le dossier du projet
   - Les fichiers essentiels : `index.html`, `styles.css`, `app.js`, `netlify.toml`, `_redirects`

2. **Déployez** :
   - Allez sur [app.netlify.com/drop](https://app.netlify.com/drop)
   - Glissez-déposez le dossier du projet
   - Attendez quelques secondes
   - ✅ Votre site est en ligne !

## Déploiement via Git (Recommandé pour les mises à jour)

### Prérequis
- Compte GitHub/GitLab/Bitbucket
- Compte Netlify (gratuit)

### Étapes

1. **Créez un dépôt Git** :
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Poussez vers GitHub/GitLab/Bitbucket** :
   ```bash
   git remote add origin <votre-repo-url>
   git push -u origin main
   ```

3. **Connectez à Netlify** :
   - Allez sur [netlify.com](https://www.netlify.com)
   - Cliquez sur "Add new site" → "Import an existing project"
   - Connectez votre compte Git
   - Sélectionnez votre dépôt

4. **Configuration** :
   - **Build command** : (laissez vide)
   - **Publish directory** : `.` (point = racine)
   - Cliquez sur "Deploy site"

5. **C'est fait !** 🎉
   - Netlify génère une URL automatique (ex: `random-name-123.netlify.app`)
   - Vous pouvez changer le nom dans "Site settings" → "Change site name"
   - Ajoutez un domaine personnalisé si vous le souhaitez

## Déploiement via CLI

```bash
# Installer Netlify CLI
npm install -g netlify-cli

# Se connecter
netlify login

# Déployer (première fois)
netlify init

# Déployer en production
netlify deploy --prod
```

## Vérifications post-déploiement

✅ **HTTPS activé** : Netlify fournit automatiquement HTTPS (nécessaire pour la caméra)

✅ **Fichiers configurés** :
- `netlify.toml` : Configuration du site
- `_redirects` : Redirections pour le SPA

✅ **Testez** :
- Ouvrez votre site Netlify
- Testez le scanner de codes-barres
- Vérifiez que le webhook fonctionne

## Mises à jour

Si vous utilisez Git :
- Faites vos modifications
- Committez et poussez vers votre dépôt
- Netlify déploiera automatiquement les changements !

Si vous utilisez Drag & Drop :
- Modifiez vos fichiers
- Glissez-déposez à nouveau le dossier sur Netlify

## Support

- Documentation Netlify : https://docs.netlify.com
- Support Netlify : https://www.netlify.com/support
