# Cor Present

Assistència, calendari i avisos per a cors, orquestres, bandes, cobles i altres agrupacions. Cada agrupació hi té les seves dades, separades de la resta, i qualsevol persona amb un compte de Google en pot crear una.

- `index.html` — l'app (mòbil primer)
- `config.js` — configuració del projecte de Firebase
- `firestore.rules` — regles de seguretat de Firestore
- `demo.json` — dades d'exemple
- `app.webmanifest`, `app/` — identitat de la plataforma (quan encara no se sap de quina agrupació és qui entra)

## Agrupacions

- Cada agrupació té les dades a `cors/<agrupació>/…` i una fitxa al directori `agrupacions/<agrupació>` (nom, tipus i estat: activa, suspesa o esborrada).
- El **tipus** (cor, orquestra, banda, cobla, grup de cambra o una altra) decideix les paraules de l'app («cantaires i cordes», «músics i seccions»…) i els tipus de sessió. Les **seccions** de cadascuna es desen a `config/main.sections` i es canvien a Ajustos.
- Qui crea una agrupació en queda d'administrador. L'enllaç `?a=<agrupació>` obre directament aquella agrupació, amb el seu nom i la seva icona.
- **Plataforma**: `plataforma/equip` diu qui veu el directori de totes les agrupacions (sense veure'n les dades) i pot suspendre-les; `plataforma/config` diu si qualsevol pot crear-ne.

## Accés

Tothom entra amb Google, amb el correu que l'administració ha donat d'alta a Gestió › Ajustos › Persones. Els rols són administració, director, cap de corda o de secció (poden editar) i membre de la plantilla o equip tècnic (només lectura). Cada persona té l'índex de les seves agrupacions a `staffIndex/<correu>/agrupacions/`.

## Tasques automàtiques (GitHub Actions)

Llegeixen amb el compte de servei (secret `SERVICE_REFRESH_TOKEN`), que pot llegir totes les agrupacions però no escriure-hi.

- **Calendari** (cada 3 hores): el calendari subscrit de cada agrupació que el té activat (`calendari.ics` per a la primera i `calendaris/<agrupació>.ics` per a la resta) i la seva identitat a `marca/<agrupació>/`.
- **Còpia de seguretat** (cada nit): totes les dades de cada agrupació al repositori privat de còpies.
- **Avisos al mòbil** (cada mitja hora): anuncis, convocatòries, enquestes, material nou, respostes als avisos d'absència i avisos als caps de secció, llegint només el que cal.
