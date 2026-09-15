# Cor Present

Llista d'assistència per a un cor dividit en cordes (sopranos, contralts, tenors i baixos), organitzada per produccions.

- `index.html` — l'app (mòbil primer)
- `config.js` — configuració del projecte de Firebase
- `firestore.rules` — regles de seguretat de Firestore
- `demo.json` — dades d'exemple

Cada enllaç porta una clau secreta (`#k=…`) que dona un rol: caps de corda (editar), consulta (només lectura) o cantaires (calendari i avisos d'absència). Cada mòbil entra de manera anònima amb Firebase Auth i les regles de `firestore.rules` comproven el rol.

## Accés

- **Equip** (caps de corda, director, administració): entren amb Google. Es gestiona a Gestió › Ajustos › Equip.
- **Cantaires**: enllaç personal (`#k=…`) lligat al seu nom; poden avisar d'absències, confirmar convocatòries i, si fan de substitut, passar llista aquell dia.
- **Calendari**: `calendari.ics` es regenera cada 3 hores amb l'acció *Calendari* (compte de només lectura de produccions).
