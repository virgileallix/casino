# Casino Web App

Projet full front-end alimenté par Firebase (Auth + Firestore) proposant plusieurs jeux originaux inspirés des plateformes crypto-casino modernes.

## Jeux disponibles

- **Blackjack** – règles officielles (Blackjack 3:2, croupier stand sur soft 17, double sur deux premières cartes). Jeu complet avec visuels haute définition issus du dépôt open source [`hayeah/playing-cards-assets`](https://github.com/hayeah/playing-cards-assets).
- **Dice** – reproduction du jeu « Roll Over / Under » façon Stake, calcul de house edge, historique détaillé.
- **Plinko** – moteur physique Matter.js avec tables de multiplicateurs basées sur les probabilités binomiales.

Chaque jeu :
- se connecte au profil Firebase de l’utilisateur,
- déduit les mises et crédite les gains via une transaction Firestore atomique,
- enregistre des statistiques (volume misé, victoires, meilleurs gains, etc.) visibles sur l’accueil.

## Démarrage rapide

1. **Installer les dépendances Live Server / bundler** (selon votre stack) ou utiliser un simple serveur statique (`npx serve`, `python -m http.server`, etc.).
2. **Configurer Firebase :**
   - Activer Authentication (email/password + Google si souhaité).
   - Activer Firestore en mode production et publier les règles fournies dans `firestore.rules`.
   - Mettre à jour les clés dans `firebase-config.js` si nécessaire.
3. **Lancer le serveur statique** depuis la racine du projet et ouvrir `index.html`.

## Arborescence principale

```
assets/cards/        # jeu complet de cartes PNG (52 cartes + dos) issu du repo open source
blackjack.html/.css/.js
dice.html/.css/.js
plinko.html/.css/.js
balance-manager.js   # gestion Firestore (solde + stats)
firebase-config.js
index.html / styles.css
```

## Règles Blackjack implémentées

- Pioche à un seul paquet, reshuffle automatique lorsqu’il reste < 15 cartes.
- Blackjack naturel paie 3:2, identité du croupier vérifiée pour push.
- Double autorisé uniquement sur les deux premières cartes (vérification du solde).
- Pas d’assurance ni split (pour garder l’expérience fluide).
- Historique des mains et statistiques dédiées (mains jouées, victoires, nombre de blackjacks, profit cumulé).

## Sécurité Firestore

Les règles livrées (`firestore.rules`) assurent :

- Un utilisateur ne peut lire/écrire que son propre document `users/{uid}`.
- Schéma strict : champs autorisés + valeurs numériques >= 0 (balance, profits, compteurs de parties).
- Documents créés avec les champs par défaut si manquants.

Publiez les règles via la console Firebase ou `firebase deploy --only firestore:rules`.

## Crédits

- Cartes : [hayeah/playing-cards-assets](https://github.com/hayeah/playing-cards-assets) (domaine public / CC0).
- Matter.js : moteur physique open source utilisé pour Plinko.

Bon jeu ! 🎰
