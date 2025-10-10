// Firebase configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyDvulIikOqbDfAYsREeTqnZrSqdDEMzeOs",
  authDomain: "casino-eaa24.firebaseapp.com",
  projectId: "casino-eaa24",
  storageBucket: "casino-eaa24.firebasestorage.app",
  messagingSenderId: "100720282923",
  appId: "1:100720282923:web:e618224a7e2a3f1fe4496e",
  measurementId: "G-9D8Q1TPGT6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);

export { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged };
