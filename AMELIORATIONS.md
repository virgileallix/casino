# Améliorations du Casino

## 🎯 Résumé des améliorations

### 1. Authentification Google
- Connexion rapide avec Google OAuth
- Interface moderne avec bouton Google officiel
- Fonctionne pour la connexion et l'inscription

### 2. Balance persistante avec Firestore
- **Synchronisation en temps réel** : Votre solde se met à jour automatiquement sur tous vos appareils
- **Persistance** : Votre balance est sauvegardée dans la base de données
- **Statistiques** : Suivi des mises totales, gains totaux, et parties jouées
- **Sécurisé** : Toutes les données sont stockées de manière sécurisée dans Firebase

### 3. Plinko amélioré (style Stake/Gamdom)

#### Probabilités réalistes
- **Algorithme binomial** : Les résultats suivent une distribution binomiale naturelle, comme dans un vrai Plinko physique
- **Probabilités justes** :
  - Les cases du centre ont plus de chances d'être atteintes
  - Les cases extrêmes (gros multiplicateurs) sont rares
  - Chaque case a une probabilité calculée mathématiquement

#### Système "Provably Fair"
- **Résultat pré-déterminé** : Le résultat est décidé avant que la balle ne tombe (basé sur les probabilités réelles)
- **Guidage subtil** : La balle est guidée vers sa destination de manière réaliste
- **Transparence** : Le système simule un comportement physique crédible

#### Multiplicateurs (identiques à Stake)
**Risque Faible (8 lignes)** : 5.6x, 2.1x, 1.1x, 1x, 0.5x, 1x, 1.1x, 2.1x, 5.6x
**Risque Moyen (16 lignes)** : 110x, 41x, 10x, 5x, 3x, 1.5x, 1x, 0.5x, 0.3x, 0.5x, 1x, 1.5x, 3x, 5x, 10x, 41x, 110x
**Risque Élevé (16 lignes)** : 1000x, 130x, 26x, 9x, 4x, 2x, 0.2x, 0.2x, 0.2x, 0.2x, 0.2x, 2x, 4x, 9x, 26x, 130x, 1000x

#### Améliorations visuelles
- **Animation du gain** : La case gagnante s'illumine en doré
- **Retour visuel** : Meilleure indication des gains/pertes
- **Historique détaillé** : Affichage des 20 dernières parties

## 🚀 Configuration Firebase requise

Pour que tout fonctionne correctement, vous devez activer dans la console Firebase :

1. **Authentication** → Sign-in method :
   - ✅ Google (activé)
   - ✅ Email/Password (activé)

2. **Firestore Database** :
   - Créer une base de données en mode test (pour le développement)
   - Structure automatique :
     ```
     users/
       {userId}/
         email: string
         balance: number
         createdAt: string
         totalWagered: number
         totalWon: number
         gamesPlayed: number
     ```

3. **Règles Firestore recommandées** (mode développement) :
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

## 📁 Nouveaux fichiers créés

- **balance-manager.js** : Module de gestion de la balance avec Firestore
- **AMELIORATIONS.md** : Ce fichier de documentation

## 🎮 Fonctionnalités

### Balance en temps réel
- La balance se synchronise automatiquement entre tous les onglets/appareils
- Mise à jour instantanée après chaque partie
- Historique complet des transactions

### Dépôt de fonds
- Bouton "Dépôt" fonctionnel
- Ajout instantané au solde
- Synchronisation immédiate avec Firestore

### Statistiques utilisateur
- Parties jouées
- Total des gains
- Total des mises
- Plus gros gain

## 🔐 Sécurité

- Authentification Firebase sécurisée
- Règles Firestore pour protéger les données utilisateur
- Chaque utilisateur ne peut accéder qu'à ses propres données
- Balance initiale de 1000€ pour chaque nouveau compte

## 🎲 Comment jouer au Plinko

1. Choisissez votre mise
2. Sélectionnez le niveau de risque (Faible, Moyen, Élevé)
3. Choisissez le nombre de lignes (8, 12, ou 16)
4. Cliquez sur "Jouer"
5. La balle tombe et vous gagnez selon le multiplicateur !

## 💡 Conseils

- **Risque faible** : Gains plus fréquents mais plus petits
- **Risque moyen** : Équilibre entre fréquence et gains
- **Risque élevé** : Gains rares mais énormes (jusqu'à 1000x!)
- Plus de lignes = plus de possibilités de multiplicateurs différents
