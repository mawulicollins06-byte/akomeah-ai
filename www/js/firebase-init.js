const firebaseConfig = {
  apiKey: "AIzaSyBrgW435sr-7SXZ--JlH4yVkG0hgkn_4DE",
  authDomain: "akomeah-ai.firebaseapp.com",
  projectId: "akomeah-ai",
  storageBucket: "akomeah-ai.firebasestorage.app",
  messagingSenderId: "306051082203",
  appId: "1:306051082203:web:bbf1351e9203a9195fa9fe",
  measurementId: "G-KPVJSVKET8"
};

firebase.initializeApp(firebaseConfig);
window.firebaseAuth = firebase.auth();

window.firebaseDb = firebase.firestore();
