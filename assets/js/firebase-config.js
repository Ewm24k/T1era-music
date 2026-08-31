import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Firebase App Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDpVqwUVpM2c41y2RF5IlPQwKW71iyyhc8",
  authDomain: "t1era-musicv1.firebaseapp.com",
  projectId: "t1era-musicv1",
  storageBucket: "t1era-musicv1.firebasestorage.app",
  messagingSenderId: "878684058813",
  appId: "1:878684058813:web:58f21cf930740fa68bb3d4",
  measurementId: "G-XX6MGLBDE4",
};

// Initialize Firebase App
let app, auth, db, storage, googleProvider;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  googleProvider = new GoogleAuthProvider();
} catch (e) {
  console.error("Firebase SDK initialization error:", e);
}

export { app, auth, db, storage, googleProvider };
