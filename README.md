# Cor Present

Llista d'assistència per a un cor dividit en cordes (sopranos, contralts, tenors i baixos), organitzada per produccions.

- `index.html` — l'app (mòbil primer)
- `config.js` — configuració del projecte de Firebase
- `firestore.rules` — regles de seguretat de Firestore
- `demo.json` — dades d'exemple

Cada enllaç porta una clau secreta (`#k=…`) que dona un rol: caps de corda (editar), consulta (només lectura) o cantaires (calendari i avisos d'absència). Cada mòbil entra de manera anònima amb Firebase Auth i les regles de `firestore.rules` comproven el rol.
