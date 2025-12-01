# 🎰 Casino Originals - Plateforme de Jeux en Ligne

Plateforme de casino en ligne moderne avec de multiples jeux originaux, système d'authentification Firebase, gestion de solde en temps réel et chat global.

## 🎮 Jeux Disponibles

- **🎲 Plinko** - Physique réaliste style Stake avec distribution binomiale
- **🃏 Blackjack Multijoueur** - Tables multijoueurs avec side bets (21+3, Perfect Pairs)
- **🎰 Roulette** - Roulette européenne classique
- **🎯 Dice** - Jeu de dés avec prédiction
- **💣 Mines** - Démineur avec multiplicateurs
- **🗼 Tower** - Montée progressive à risque
- **🎱 Keno** - Loterie numérique
- **📈 Crash** - Jeu de multiplicateur en temps réel
- **🎰 Slots** - Machines à sous
- **📦 Cases** - Ouverture de caisses mystère

## 📁 Structure du Projet

```
casino/
├── assets/              # Ressources statiques
│   ├── images/         # Images et SVG
│   └── cards/          # Cartes de jeu
├── css/
│   ├── common/         # Styles globaux et composants
│   │   ├── global.css
│   │   ├── index.css
│   │   ├── admin.css
│   │   └── deposit-modal.css
│   └── games/          # Styles spécifiques aux jeux
├── js/
│   ├── core/           # Modules de base
│   │   ├── firebase-config.js
│   │   ├── balance-manager.js
│   │   ├── auth.js
│   │   └── admin.js
│   ├── components/     # Composants réutilisables
│   │   ├── global-chat.js
│   │   ├── admin-nav.js
│   │   ├── deposit-modal.js
│   │   └── url-cleaner.js
│   ├── games/          # Logique des jeux
│   │   ├── plinko.js
│   │   ├── blackjack.js
│   │   └── ...
│   ├── index.js
│   ├── leaderboard.js
│   └── profile.js
├── pages/
│   ├── games/          # Pages des jeux
│   ├── admin/          # Administration
│   ├── auth/           # Authentification
│   ├── leaderboard.html
│   └── profile.html
├── index.html          # Page d'accueil
├── firebase.json
├── firestore.rules
└── .gitignore
```

## 🚀 Fonctionnalités

### Système d'Authentification
- 📧 Connexion par email/mot de passe
- 🔐 Gestion sécurisée via Firebase Auth
- 👤 Profils utilisateurs persistants

### Gestion de Solde
- 💰 Système de balance en temps réel avec Firestore
- 📊 Historique des transactions
- 🎯 Statistiques par jeu (gains, parties jouées, meilleurs scores)
- 🔒 Transactions atomiques pour éviter les exploits

### Interface Utilisateur
- 🎨 Design moderne et responsive
- 💬 Chat global en temps réel
- 🏆 Classement des joueurs (leaderboard)
- 👥 Système VIP avec avantages

### Administration
- 🛠️ Panel admin pour gestion des utilisateurs
- 📈 Statistiques globales
- 🔄 Outils de migration de données

## 🛠️ Technologies Utilisées

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend**: Firebase (Auth, Firestore, Hosting)
- **Physique**: Matter.js (pour Plinko)
- **Temps réel**: Firestore Realtime Updates

## 📦 Installation

```bash
# Cloner le repository
git clone <your-repo-url>
cd casino

# Configurer Firebase
# 1. Créer un projet Firebase
# 2. Copier la configuration dans js/core/firebase-config.js
# 3. Activer Authentication (Email/Password)
# 4. Créer une base Firestore
```

## 🔧 Configuration Firebase

1. **Firestore Rules**: Utiliser le fichier `firestore.rules`
2. **Authentication**: Activer Email/Password dans Firebase Console
3. **Collections nécessaires**:
   - `users` - Profils utilisateurs et balances
   - `blackjack-tables` - État des tables de blackjack
   - `globalChat` - Messages du chat global

## 🎯 Améliorations Récentes

### Plinko (Style Stake)
- ✨ Physique améliorée avec gravité optimisée
- 🎯 Distribution binomiale naturelle
- 🎨 Pins stylisés bleu/violet
- 🎲 Balle plus réaliste avec bordure lumineuse
- 🎬 Runner 60 FPS

### Blackjack Multijoueur
- 🐛 FIX: Mises déduites AVANT le début de la partie
- 💰 FIX: Calcul correct des profits
- 🎲 FIX: Double down gère correctement les mises
- 🏆 Meilleure détection des blackjacks (payout 3:2)
- ⏰ Joueurs inactifs retirés après 3 rounds

## 🤝 Contribution

Ce projet est en développement actif. Les contributions sont les bienvenues !

## 📄 Crédits

- Cartes: [hayeah/playing-cards-assets](https://github.com/hayeah/playing-cards-assets) (CC0)
- Matter.js: Moteur physique pour Plinko

---

Développé avec ❤️ en utilisant Claude Code
