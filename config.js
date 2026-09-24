// Configuració del projecte de Firebase «cor-present».
// Aquestes claus són públiques per disseny: la protecció la donen les regles de Firestore (firestore.rules).
window.COR_OWN_DOMAINS = [];

window.COR_FIREBASE = {
  apiKey: "AIzaSyDxFa61IEt6K2s2xCMXQhUpkdFipVwzDRY",
  // Quan l'app es publiqui al domini propi (Firebase Hosting), l'entrada amb Google passa per aquell mateix
  // domini: els navegadors que bloquegen dades entre webs diferents no la poden trencar. Afegeix-lo a
  // COR_OWN_DOMAINS només quan ja funcioni a Firebase Hosting i estigui autoritzat (vegeu README › Allotjament).
  authDomain: (window.COR_OWN_DOMAINS || []).includes(location.hostname) ? location.hostname : "cor-present.firebaseapp.com",
  projectId: "cor-present",
  storageBucket: "cor-present.firebasestorage.app",
  messagingSenderId: "94424306722",
  appId: "1:94424306722:web:351d55007da77065ed267b"
};

// Clau pública dels avisos al mòbil (Web Push · VAPID). La privada només és al servidor que els envia.
window.COR_PUSH_KEY = "BC9892nrFWccZAEQImIOs068_2ER8OisyrGdmgfP6LlZHWhXkKZ-pO2g9fLT_5y17KbOa5psTE3LdxB7mxR6VkU";
