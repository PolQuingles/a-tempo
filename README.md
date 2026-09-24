# A Tempo

Assistència, calendari i avisos per a cors, orquestres, bandes, cobles i altres agrupacions. Cada agrupació hi té les seves dades, separades de la resta. Només els Usuaris Pro en poden crear.

- `index.html` — la pàgina de l'app: la capçalera, el guió que pinta el tema abans de carregar i els `<script>` en ordre
- `css/app.css` — tots els estils
- `js/` — el codi, en fitxers per àrees (vegeu *Arquitectura*)
- `sw.js` — treballador de servei: avisos al mòbil i l'app desada per obrir-la sense cobertura
- `config.js` — configuració del projecte de Firebase
- `firestore.rules` — regles de seguretat de Firestore
- `demo.json` — dades d'exemple
- `app.webmanifest`, `app/` — identitat de la plataforma (quan encara no se sap de quina agrupació és qui entra)
- `tests/` — proves automàtiques (regles i interfície) · `tools/stamp.py` — empremtes dels fitxers
- `firebase.json`, `.firebaserc` — Firebase Hosting i l'emulador de les proves

## Agrupacions

- Cada agrupació té les dades a `cors/<agrupació>/…` i una fitxa al directori `agrupacions/<agrupació>` (nom, tipus i estat: activa, suspesa o esborrada).
- El **tipus** (cor, orquestra, banda, cobla, grup de cambra o una altra) decideix les paraules de l'app («cantaires i cordes», «músics i seccions»…) i els tipus de sessió. Les **seccions** de cadascuna es desen a `config/main.sections` i es canvien a Ajustos.
- Qui crea una agrupació en queda d'administrador. L'enllaç `?a=<agrupació>` obre directament aquella agrupació, amb el seu nom i la seva icona.
- **Usuaris Pro** (`plataforma/pro`): són els únics que poden crear agrupacions i, de les que administren, canviar-ne el nom, el tipus, les seccions i la imatge o esborrar-les. Els administradors que no són Pro gestionen les persones i les dades, però no la identitat de l'agrupació.
- **Plataforma** (`plataforma/equip`): veu el directori de totes les agrupacions (sense veure'n les dades), pot suspendre-les i decideix qui és Usuari Pro. L'equip de la plataforma és Pro sempre.

## Pestanyes

Una pestanya per feina, cinc com a màxim:

- **Inici**: la sessió d'avui (amb **Passa llista** per a qui edita), **Per fer** (tot el que espera una resposta: avisos d'absència per acceptar, llistes per acabar, canvis d'hora, avisos de classes, convocatòries i enquestes per respondre, anuncis nous), la **Gestió** per a qui edita (Avisos, Personal, Produccions, Ajustos), **Properament** i, per a la plantilla, la seva assistència i els seus avisos. L'únic número vermell de la barra és el d'Inici.
- **Assistència**: Llista (passar llista), Estadístiques (per producció, trimestre o temporada) i Risc (la norma).
- **Calendari**: les sessions i, per a qui en fa o en dona, les seves classes.
- **Tauler**: anuncis, materials, documents i enquestes.
- **Classes de cant**, si l'agrupació en fa.

El **compte** és a les inicials, a dalt a la dreta: calendari al mòbil, avisos, agrupacions, aparença, manual i tancar la sessió. **Personal** reuneix tota la gent: la plantilla per seccions, qui té accés i els rols, amb les eines d'accés (donar-ne, invitar, comprovar correus). **Ajustos** queda per a l'agrupació, en blocs plegables.

## Aspecte

- La Bodoni Moda és per als títols grans i els números destacats; els subtítols i la resta van amb la Hanken Grotesk.
- Les vores es reserven per al que es toca (llistes, caselles, botons); la resta són plans sense vora.
- A partir de 1000 px d'amplada (ordinador), el menú de pestanyes passa a una columna a l'esquerra, Inici i Assistència van en dues columnes, i Personal, Estadístiques i Produccions es mostren com a taules (`.only-wide`); al mòbil hi ha les llistes de sempre (`.only-narrow`).
- Cada pantalla entra amb una transició curta, mentre carreguen les dades es veu la silueta de la pàgina, i les pantalles buides porten un pentagrama del color de l'agrupació. Tot això s'apaga si el mòbil té les animacions reduïdes.

## Accés

Ningú no hi entra sense identificar-se: tothom entra amb el correu que l'administració ha donat d'alta a Gestió › Ajustos › Persones. No hi ha enllaços d'accés.

- **Amb Google**, per als correus de Google.
- **Amb un altre correu i una contrasenya** (Hotmail, iCloud, de la feina…). El primer cop es crea la contrasenya i es confirma el correu amb l'enllaç que envia Firebase: les regles només deixen entrar comptes amb el correu confirmat. La contrasenya es pot recuperar des de la mateixa pantalla.
- **Invitacions**: en donar d'alta algú, l'app prepara el missatge amb l'enllaç i les instruccions, i l'administració l'envia des del seu correu (una persona, o moltes en còpia oculta) o pel WhatsApp. La fitxa guarda `invitedAt` per saber qui falta.

El repositori, l'adreça de l'app (`polquingles.github.io/a-tempo/`) i el repositori de còpies es diuen `a-tempo`. El projecte de Firebase es continua dient `cor-present`: l'identificador d'un projecte no es pot canviar i migrar-lo voldria dir perdre els comptes de tothom.

Cada persona té un o més rols (`roles` a la seva fitxa):

- **Administració**: ho pot fer tot (persones, identitat, dades).
- **Director**, **gerència**, **secretaria** i **cap de corda o de secció**: passen llista, publiquen anuncis, convocatòries i enquestes, i pugen materials i documents.
- **Professor de cant** (`voice`): porta les classes i prou.
- **Membre de la plantilla** (cantaire, músic): veu tota l'app en mode lectura i té el seu espai personal.

A **Gestió › Personal** hi ha tothom, rol per rol: el menú de dalt tria el rol i a sota hi surt qui el té (la plantilla, per seccions). Les fitxes antigues amb el rol únic `palau` (l'antic equip tècnic) es llegeixen com a gerència.

Qui també és de la plantilla (per exemple, un cap de corda que canta) té, a més, «El meu espai», amb la seva assistència i els seus avisos d'absència. Cada persona té l'índex de les seves agrupacions a `staffIndex/<correu>/agrupacions/`.

## Classes de cant

S'activen a Ajustos (`config/main.classesOn`) quan l'agrupació fa classes individuals.

- La pestanya té dos nivells: el **quadre del professorat** (una casella per a cadascú, com les cordes de la llista) i, a dins, l'**espai** d'aquell professor/a: el mes amb els dies de classe marcats, el dia triat hora per hora i els dies que vénen.
- `classes/<id>` és un dia de classe: data, lloc (l'aula d'aquell dia de la setmana a l'horari fix), professorat (`teacher`, i `teacherName` per a qui no llegeix les fitxes de l'equip) i `slots` (hora, durada i qui hi va).
- `classReq/<id>` és un avís de retard o d'absència, o una petició de canvi d'hora entre dos companys, amb `status` pendent, acceptada, rebutjada o retirada. Un canvi acceptat val només per a aquell dia: no canvia el calendari, s'hi aplica a sobre.
- El professorat que encara no entra a l'app es posa a Ajustos (`config/main.teachers` = [{id, name}]): els dies i els horaris fixos es guarden amb la seva clau (el correu si té compte, si no l'id de la fitxa).
- `classPlan/<clau>` és l'horari fix d'un professor/a (l'hora setmanal de cada alumne, i `places`, l'aula de cada dia de la setmana): des d'allà es generen els dies de tot un trimestre, saltant els festius, i els dies que ja hi eren es reescriuen mantenint l'assistència marcada.
- L'assistència de cada classe es desa al mateix `slots[]` (`mark` i `markFor`, de qui era l'hora quan es va marcar). `classNotes/<classe>_<hora>` guarda què s'ha treballat: només ho llegeixen el professorat i aquell alumne.
- Un canvi d'hora pot anar a algú concret o quedar **obert** (`open: true`, el veu tothom de l'agrupació i se'l queda el primer que l'accepta). Una hora lliure es pot demanar (`kind: take`): quan el professorat l'accepta, aquella persona queda posada al calendari. Un dia sencer es pot anul·lar (`cancelled`), i qui hi tenia hora rep l'avís.
- `classIcs/<membre>` guarda la clau del calendari personal de classes. La tasca «Calendari» escriu `calendaris/classes/<clau>.ics` amb només les classes d'aquella persona.
- L'app avisa si una classe cau dins d'un assaig o un concert d'aquella persona.
- Qui té el rol `voice` (professor de cant) fa el calendari, marca l'assistència i respon els avisos; no pot editar res més de l'app. Cada persona veu i escriu només els seus avisos.

## Tasques automàtiques (GitHub Actions)

Llegeixen amb el compte de servei (secret `SERVICE_REFRESH_TOKEN`), que pot llegir totes les agrupacions però no escriure-hi.

- **Calendari** (cada 3 hores): el calendari subscrit de cada agrupació que el té activat (`calendari.ics` per a la primera i `calendaris/<agrupació>.ics` per a la resta) i la seva identitat a `marca/<agrupació>/`.
- **Còpia de seguretat** (cada nit): totes les dades de cada agrupació al repositori privat de còpies.
- **Avisos al mòbil** (cada mitja hora): anuncis, convocatòries, enquestes, material nou, respostes als avisos d'absència i avisos als caps de secció, llegint només el que cal.
- **Vigilància** (cada hora): que l'app s'obre a cada adreça (`APP_URLS`, variable del repositori; per defecte la de GitHub Pages) i que hi carrega el codi, que GitHub Pages continua activat i si algú ha tingut errors a l'app l'última hora. Si hi ha res, avisa al mòbil l'administració de la primera agrupació i la tasca acaba amb error (GitHub n'envia un correu). Un mateix problema es torna a avisar com a molt cada sis hores.
- **Proves** (a cada canvi i a cada petició de canvi): vegeu *Proves*.
- **Publica a Firebase Hosting** (quan les proves de `main` passen i després de cada «Calendari»): vegeu *Allotjament*.

## Arquitectura

L'app és estàtica: HTML, CSS i JavaScript sense cap pas de compilació, amb les dades a Firestore.

- `js/` són **scripts clàssics** que comparteixen l'àmbit global i es carreguen **en ordre** (l'ordre dels `<script>` d'`index.html` importa: el codi que s'executa en carregar un fitxer només pot fer servir el que ja han definit els anteriors). Cada fitxer comença dient què hi ha: `00-errors` (registre d'errors, el primer de tots), `01-base` (constants, estat, utilitats), `02-dades` (Firestore), `03-pantalla` (pintar), `04-llista` … `10-inici` (una per pantalla), `11-fitxes` (finestres), `12-persones`, `13-avisos-mobil`, `14-eines`, `15-copies`, `16-agrupacions`, `17-rutes`, `18-accions` (clics i formularis) i `19-arrencada` (`init()`).
- **Empremtes**: cada fitxer s'enllaça amb `?v=<empremta del contingut>`. Després de canviar qualsevol fitxer de `js/`, `css/` o `config.js`, cal executar `python3 tools/stamp.py`, que també posa la versió a `index.html` (`<meta name="app-version">`) i la llista de fitxers a `sw.js`. Les proves fallen si no s'ha fet.
- **Rutes**: cada pantalla té la seva adreça (`#/inici`, `#/assistencia/estadistiques`, `#/gestio/personal`, `#/classes/<professor>`…). El botó «enrere» del mòbil torna a la pantalla d'abans i tanca la finestra que hi hagi oberta. Els enllaços amb una ruta obren aquella pantalla (si la persona hi té accés).
- **Sense cobertura** (`sw.js`): la pàgina es demana sempre primer a la xarxa i, si no n'hi ha o tarda més de quatre segons, s'obre la darrera desada. Els fitxers amb empremta es desen i no es tornen a baixar; les dades no passen pel treballador de servei (Firestore ja en guarda una còpia al mòbil).
- **Lectures** (el pla gratuït de Firebase en dona 50.000 al dia, per a totes les agrupacions juntes): la plantilla, les produccions, les llistes i les classes porten `syncAt` (l'hora del servidor) a cada canvi. Cada mòbil guarda el que ja té i, en obrir l'app, només demana el que ha canviat des del darrer canvi que coneix. Qui esborra una fitxa o una producció canvia `config/main.syncEpoch`, i la resta de mòbils tornen a baixar aquella col·lecció sencera; un dia de classe esborrat queda com a `deleted: true`. La primera vegada, un cop per setmana i si el mòbil no té res desat, es baixa tot. Els aparells amb avisos (`push`) només es llegeixen en obrir «Qui ha entrat».
- **Un dia nou**: si l'app torna a primer pla i ja és un altre dia, es recarrega (tret que hi hagi una finestra oberta o canvis per desar), perquè «avui» sigui el dia d'avui.
- **Registre d'errors**: si l'app falla, `js/00-errors.js` desa una nota breu a la col·lecció `errors` (què, on, versió, pantalla i agrupació; cap nom ni correu), com a molt cinc per sessió. Només les llegeixen la plataforma i el compte de servei.

## Proves

Viuen a `tests/` i GitHub les passa soles a cada canvi (`.github/workflows/proves.yml`):

- **Regles de seguretat** (`tests/regles/test_regles.py`): 228 casos contra l'emulador de Firestore. En local: `npx firebase-tools emulators:exec --only firestore --project demo-cor "python3 tests/regles/test_regles.py firestore.rules"`.
- **Interfície** (`tests/interficie/run.py`): l'app sencera en un Chromium sense pantalla, amb Firebase fals (`fake-firebase.js`) i dades inventades (`seed.py`). Recorre totes les pantalles amb sis perfils i tres mides, i comprova que no hi ha errors ni res que surti de la pantalla, el botó «enrere», els enllaços directes, les taules de l'ordinador, el registre d'errors i que s'obre sense xarxa. En local: `pip install playwright && python -m playwright install chromium && python3 tests/interficie/run.py`. Per mirar la còpia de proves a mà: `python3 tests/interficie/build.py` i obrir-la amb `?u=pol` (o `leader`, `singer`, `prof`, `dir`, `ger`).
- **Estructura**: empremtes al dia i que els scripts de Python compilen.

## Allotjament

L'app es publica a **GitHub Pages** (`polquingles.github.io/a-tempo/`, la branca `main`) i, quan estigui configurat, a **Firebase Hosting** amb un domini propi. Firebase Hosting és el mateix projecte de Firebase, és gratuït amb el volum d'aquesta app, porta HTTPS i fa que l'entrada amb Google passi pel mateix domini de l'app (els navegadors que bloquegen dades entre webs diferents no la poden trencar).

Per activar-lo (un sol cop):

1. **Domini**: comprar-lo (p. ex. `a-tempo.cat`) en un registrador.
2. **Firebase** › Hosting › *Get started*, i després *Add custom domain* amb el domini: Firebase dona els registres DNS que cal posar al registrador.
3. **Clau de publicació**: a Google Cloud › IAM › *Service accounts*, un compte amb el rol *Firebase Hosting Admin* i una clau JSON; es desa al repositori com a secret `FIREBASE_SERVICE_ACCOUNT` (`gh secret set FIREBASE_SERVICE_ACCOUNT < clau.json`, i esborrar el fitxer).
4. **Entrada amb Google al domini**: afegir el domini a Firebase › Authentication › *Authorized domains*, i `https://<domini>/__/auth/handler` als *Authorized redirect URIs* del client OAuth web (Google Cloud › Credentials). Després, posar el domini a `COR_OWN_DOMAINS` de `config.js`.
5. **Vigilància**: posar les adreces a la variable del repositori `APP_URLS` (p. ex. `https://a-tempo.cat/,https://polquingles.github.io/a-tempo/`).

Canviar d'adreça vol dir que cadascú ha de tornar a entrar i a activar els avisos al mòbil (van lligats al domini), i que les subscripcions al calendari fetes amb l'adreça antiga continuen funcionant mentre GitHub Pages segueixi publicant.
