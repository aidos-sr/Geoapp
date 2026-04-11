import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
  import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
  import { getDatabase, ref, set, get, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

  const firebaseConfig = {
    apiKey: "AIzaSyArwDELpm7FMM6WLS7VyDYnpc_1HoRhw_4",
    authDomain: "geoapp8.firebaseapp.com",
    databaseURL: "https://geoapp8-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "geoapp8",
    storageBucket: "geoapp8.firebasestorage.app",
    messagingSenderId: "953761935267",
    appId: "1:953761935267:web:400863a9ec16bfb41bb416",
    measurementId: "G-TNZKCFDT6C"
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);

  window._fbAuth = auth;
  window._fbDb = db;
  window._fbFns = { set, get, ref, update, onValue,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, onAuthStateChanged };

  // Firebase auth state
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const snap = await get(ref(db, 'users/' + user.uid));
      if (snap.exists()) {
        window._fbUser = { uid: user.uid, email: user.email, ...snap.val() };
      } else {
        window._fbUser = { uid: user.uid, email: user.email, login: user.email.split('@')[0], cls: '', isAdmin: false };
        await set(ref(db, 'users/' + user.uid), { login: window._fbUser.login, cls: '', isAdmin: false, createdAt: Date.now() });
      }
      startSession(window._fbUser);
    } else {
      window._fbUser = null;
      showAuthScreen();
    }
  });