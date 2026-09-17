# Cor Present

Assistència, calendari i avisos per a cors, orquestres, bandes, cobles i altres agrupacions. Cada agrupació hi té les seves dades, separades de la resta. Només els Usuaris Pro en poden crear.

- `index.html` — l'app (mòbil primer)
- `config.js` — configuració del projecte de Firebase
- `firestore.rules` — regles de seguretat de Firestore
- `demo.json` — dades d'exemple
- `app.webmanifest`, `app/` — identitat de la plataforma (quan encara no se sap de quina agrupació és qui entra)

## Agrupacions

- Cada agrupació té les dades a `cors/<agrupació>/…` i una fitxa al directori `agrupacions/<agrupació>` (nom, tipus i estat: activa, suspesa o esborrada).
- El **tipus** (cor, orquestra, banda, cobla, grup de cambra o una altra) decideix les paraules de l'app («cantaires i cordes», «músics i seccions»…) i els tipus de sessió. Les **seccions** de cadascuna es desen a `config/main.sections` i es canvien a Ajustos.
- Qui crea una agrupació en queda d'administrador. L'enllaç `?a=<agrupació>` obre directament aquella agrupació, amb el seu nom i la seva icona.
- **Usuaris Pro** (`plataforma/pro`): són els únics que poden crear agrupacions i, de les que administren, canviar-ne el nom, el tipus, les seccions i la imatge o esborrar-les. Els administradors que no són Pro gestionen les persones i les dades, però no la identitat de l'agrupació.
- **Plataforma** (`plataforma/equip`): veu el directori de totes les agrupacions (sense veure'n les dades), pot suspendre-les i decideix qui és Usuari Pro. L'equip de la plataforma és Pro sempre.

## Accés

Ningú no hi entra sense identificar-se: tothom entra amb Google, amb el correu que l'administració ha donat d'alta a Gestió › Ajustos › Persones. No hi ha enllaços d'accés.

Cada persona té un o més rols (`roles` a la seva fitxa):

- **Administració**: ho pot fer tot (persones, identitat, dades).
- **Director**, **cap de corda o de secció** i **equip tècnic** (al Cor Jove, «Treballador del Palau»): passen llista, publiquen anuncis, convocatòries i enquestes, i pugen materials i documents.
- **Membre de la plantilla** (cantaire, músic): veu tota l'app en mode lectura i té el seu espai personal.

Qui també és de la plantilla (per exemple, un cap de corda que canta) té, a més, «El meu espai», amb la seva assistència i els seus avisos d'absència. Cada persona té l'índex de les seves agrupacions a `staffIndex/<correu>/agrupacions/`.

## Tasques automàtiques (GitHub Actions)

Llegeixen amb el compte de servei (secret `SERVICE_REFRESH_TOKEN`), que pot llegir totes les agrupacions però no escriure-hi.

- **Calendari** (cada 3 hores): el calendari subscrit de cada agrupació que el té activat (`calendari.ics` per a la primera i `calendaris/<agrupació>.ics` per a la resta) i la seva identitat a `marca/<agrupació>/`.
- **Còpia de seguretat** (cada nit): totes les dades de cada agrupació al repositori privat de còpies.
- **Avisos al mòbil** (cada mitja hora): anuncis, convocatòries, enquestes, material nou, respostes als avisos d'absència i avisos als caps de secció, llegint només el que cal.
