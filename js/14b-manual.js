// A Tempo · 14b-manual.js — «Com funciona»: el manual de l'app, en una sola pàgina.
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- One-page manual ---------- */
function sheetHelp() {
  const staff = canEdit();
  const w = V;
  const body = staff ? `<div class="manual">
    <h3>Entrar</h3>
    <p>Tothom entra pel mateix enllaç amb <b>el seu correu</b>: amb Google o, si el correu no és de Google, creant una contrasenya («Entra amb un altre correu»). L’administració afegeix cada persona <b>un sol cop</b> a <b>Gestió › Personal › + Persona</b>: el nom, el correu i què fa (${w.member}, ${w.leader}, ${esc(V.Teacher.toLowerCase())}, director, gerència, secretaria o administració; pot tenir més d’un rol). Si canta, se li fa la fitxa de la plantilla amb la ${w.section} o, si ja hi era, s’hi vincula. A qui ja és a la plantilla, n’hi ha prou de posar-li el correu a la seva fitxa. Després s’envia la <b>invitació</b> per correu o WhatsApp.</p>
    <p>L’administració ho pot fer tot. ${w.Members} ho veuen tot en <b>mode lectura</b>, menys el que és seu (les absències i les respostes). A <b>Inici</b> hi ha tot el que tens <b>per fer</b> i la sessió d’avui. El teu compte és a les teves inicials, a dalt a la dreta: les notificacions, el calendari, l’aparença, les agrupacions, el botó per sortir i, si no caben a la barra de baix, la <b>Gestió</b> o les <b>Classes</b> (els camins «Gestió › …» d’aquesta ajuda comencen a la pestanya o al menú).</p>
    <h3>Cada rol, les seves pestanyes</h3>
    <p>No cal triar cap rol: qui en té més d’un (per exemple, ${w.member} i ${w.leader}) veu l’app amb tots alhora, i té les pestanyes i el que pot fer de cadascun. Al mòbil hi ha com a molt cinc pestanyes; la resta són al menú del compte.</p>
    <ul><li><b>${capz(w.member)}</b>: Inici, Assistència (la seva: avisar d’una absència o d’un retard i les seves estadístiques; la de la resta no la veu), Calendari, Tauler i, si en fa, Classes.</li>
    <li><b>${capz(w.leader)}</b>: Assistència de la seva ${w.section} (en passa llista, en mira les estadístiques i en respon les absències). Qui també canta tria a dalt d’Assistència si mira <b>la seva</b> o la de la ${w.section}. A Inici, a la targeta de la sessió, hi veu qui ha avisat que no hi va.</li>
    <li><b>Arxiu</b>: el Tauler, amb l’arxiu a dalt de <b>Repertori</b> (les carpetes, les etiquetes i els codis) i, a cada obra, les partitures per repartir, repartides i per retornar.</li>
    <li><b>${esc(V.Teaching)}</b>: Classes (l’assistència de cada dia i la fitxa de cant dels seus alumnes; cada professor només veu els seus) i Calendari (els dies i l’hora de cada alumne).</li>
    <li><b>Direcció</b> i <b>Gerència</b>: Assistència de tot ${w.el} (estadístiques i risc; la direcció també en respon les absències; a Inici, la previsió de cada ${w.section}), Calendari, Tauler i tota la Gestió (personal, produccions i ajustos). <b>Secretaria</b>: Tauler i Gestió (personal, altes i baixes, documents i quotes). Les <b>al·lèrgies</b> només les veuen la secretaria i la gerència. <b>Administració</b>: tot, i a <b>Gestió › Personal › Més… › Mira l’app com…</b> veu l’app tal com la veu qualsevol persona, sense desar res.</li></ul>
    <h3>Passar llista</h3>
    <ul><li>A <b>Assistència</b> (o amb el botó <b>Passa llista</b> d’Inici) surt la sessió d’avui. Toca el quadre de la teva ${w.section}.</li>
    <li>Toca l’estat de cadascú: <b>Present</b>, <b>Retard</b>, <b>No justificada</b>, <b>Justificada</b> o <b>No fa</b>. Toca’l un altre cop per desmarcar.</li>
    <li>En un retard durant l’assaig, els minuts es calculen sols («Arriba ara»).</li>
    <li><b>Resta com a presents</b> marca de cop tothom qui falta per marcar.</li>
    <li>Sense cobertura pots continuar: es desa quan torni la connexió.</li>
    <li>Un punt vermell al quadre vol dir que hi ha llistes d’altres dies pendents.</li></ul>
    <h3>Si no hi ets: substitut</h3>
    <p>Dins la ${w.section}, <b>Substitut per avui</b>: tria qui passarà llista. Rebrà permís per fer-ho des del seu compte fins l’endemà.</p>
    <h3>${capz(w.leader)} en funcions</h3>
    <p>Si el ${w.leader} no fa una producció, a <b>Assistència › ${capz(w.leaders)} en funcions</b> tria una persona de la seva ${w.section} que sí la fa: en serà <b>${w.leader} en funcions</b> i passarà llista a tots els assajos i ${w.sh.els.replace(/^(els|les) /, '')} d’aquella producció. Mentre no hi hagi ningú triat, li surt a «Per fer».</p>
    <h3>Absències</h3>
    <p>Els ${w.members} avisen des de la seva pestanya d’<b>Assistència</b>. Els responen a <b>Assistència › Absències</b> el ${w.leader} de la seva ${w.section}, la direcció i l’administració, i surten a la llista del dia. En acceptar-los, els dies queden com a falta justificada.</p>
    <h3>Convocatòries</h3>
    <p>A la fitxa d’una sessió (${w.sh.show}, viatge…) activa <b>Demana confirmació</b>. Els ${w.members} responen Sí/No i a la Llista veus el recompte.</p>
    <h3>Tauler</h3>
    <p><b>Anuncis</b> per a tothom o per ${w.sections}, <b>materials</b> de cada producció (partitures, àudios, vídeos), <b>documents</b> de tota la temporada i <b>enquestes</b> de disponibilitat. A les convocatòries i enquestes, <b>Recorda-ho</b> prepara missatges de WhatsApp per als que no han respost.</p>
    <p>Els fitxers (PDF, àudio, imatges, fins a 20 MB) es poden pujar directament des de l’ordinador o el mòbil, o bé posar-hi un enllaç.</p>
    <h3>Cerca, text gran i desfer</h3>
    <p>La <b>lupa</b> de dalt (o «/» i Cmd+K a l’ordinador) busca persones, sessions (també per data, com ara «12/10»), obres, materials, documents, anuncis, sortides i produccions. A <b>Aparença</b> hi ha la <b>mida del text</b> (normal, gran o molt gran). Esborrar un anunci, una enquesta, un material, una obra, una sortida, un missatge o una absència ja no demana confirmació: surt <b>Desfés</b> uns segons. Els cartells de cada producció es pugen a la seva fitxa (Gestió › Produccions) i surten a Inici, al calendari i a la fitxa ${w.sh.del}.</p>
    <h3>Què és cada cosa</h3>
    <ul><li><b>Missatges</b> (a Inici): a tothom o a unes ${w.sections}, per al dia a dia.</li>
      <li><b>Converses</b> (a les teves inicials): privades, entre una persona i l’equip.</li>
      <li><b>Anuncis</b> (al Tauler): queden fixats fins a una data.</li>
      <li><b>Enquestes</b> (al Tauler): una pregunta amb opcions.</li>
      <li><b>Absències</b>: quan algú avisa que no vindrà o que arribarà tard.</li>
      <li><b>Notificacions</b>: el que arriba al mòbil de tot l’anterior, a qui les té activades.</li></ul>
    <h3>Missatges</h3>
    <p>A Inici, <b>Escriu</b> (administració, direcció, gerència i secretaria) envia un missatge a tothom, a les ${w.sections} que triïs o <b>a qui fa una producció</b> (també des del Calendari, «Escriu a qui la fa»), un anunci al tauler o una enquesta. Cada ${w.leader} hi té <b>Missatge a la ${w.section}</b>, que només arriba a la seva. Arriben a l’app i, a qui té les notificacions activades, al mòbil: sense correus ni WhatsApp.</p>
    <h3>Notes de seguiment</h3>
    <p>A les estadístiques de cada ${w.member} (toca-li el nom) la direcció i el seu ${w.leader} hi poden deixar notes de seguiment: afinació, actitud, progressos. No les veu ningú més, ni la persona.</p>
    ${wardOn() ? `<h3>Vestidor</h3>
    <p>Al menú del compte, <b>Vestidor</b>: cadascú hi demana el seu vestuari amb la talla. La secretaria, la gerència i l’administració hi veuen tot el que cal <b>encarregar</b> (per peça i talla, per copiar la comanda), i passen cada peça per <b>Encarregat</b>, <b>Pendent d’emprovar</b>, <b>A arreglar</b>, <b>Entregat</b> i <b>Retornat</b>. Hi ha la llista de qui encara no ha demanat res i s’exporta a Excel. Les peces i les talles es trien a Ajustos.</p>` : ''}
    <h3>Secretaria</h3>
    <p>A <b>Gestió › Personal</b>, toca una persona de la plantilla i se’n desplega tot: les dades, l’antiguitat, les altes i baixes${docsOn() ? `, els documents (${esc(docItems().map(([, l]) => l.toLowerCase()).join(', '))})` : ''}${feesOn() ? ' i la quota' : ''}. A dalt hi ha el resum de la temporada i els filtres <b>Altes i baixes</b>${docsOn() ? ', <b>Documents pendents</b>' : ''}${feesOn() ? ' i <b>Quota pendent</b>' : ''}. A Ajustos es tria quins documents es demanen i si hi ha quota. La plantilla sencera s’exporta a Excel.</p>
    <h3>Repertori i pla d’assaig</h3>
    <p>A <b>Tauler › Repertori</b> cada obra té una fitxa (compositor, durada, formació, partitures i àudios per ${w.section} i ${w.part}) i s’enllaça a les produccions on es fa, de manera que serveix d’una temporada a l’altra. A la fitxa hi poses <b>qui canta cada solo i cada petit grup</b>, i cadascú veu els seus.</p>
    <p>A la fitxa de cada sessió hi ha el <b>pla d’assaig</b>: quines obres i compassos, per a qui i una nota. El veuen tots els convocats a Inici i al Calendari, i després de l’assaig hi pots escriure què s’ha fet: qui no hi era ho veu a Inici.</p>
    <h3>Concerts</h3>
    <p>A la fitxa de cada ${w.sh.show}: l’<b>${w.balance.toLowerCase()}</b> segons qui ha confirmat (amb el mínim de cada ${w.section} d’Ajustos › Norma, i un avís a «Per fer» si en falta), la <b>col·locació</b> a l’escenari (per ${w.sections}, i després toques dos llocs per canviar-los) i la <b>llista de participants</b> en PDF o Excel, amb el telèfon, la talla i el contacte d’emergència, per al teatre o l’assegurança.</p>
    <h3>Sortides, certificats i memòria</h3>
    <p>A <b>Tauler › Sortides</b> hi ha les sortides i gires: cadascú s’hi apunta, i l’equip reparteix el transport i les habitacions i en treu les llistes. El <b>certificat d’assistència</b> és a les estadístiques de cada ${w.member} (en PDF), i la <b>memòria de la temporada</b>, a Gestió › Produccions.</p>
    <h3>Estadístiques i norma</h3>
    <p>Per producció o per temporada, en minuts: un retard compta pels minuts que s’hi ha estat. La <b>norma del ${minAttendance()}%</b> avisa de qui no pot fer ${w.sh.el} o està en risc. A <b>Assistència › Risc</b> tens totes les produccions en curs i, des d’allà, la <b>${w.sh.list.toLowerCase()}</b>: qui hi pot ${w.play}, la ${w.balance.toLowerCase()} i els canvis fets a mà, amb el motiu.</p>
    <h3>Arxiu de partitures</h3>
    <p>Cada partitura en paper porta el nom de qui la canta. A <b>Tauler › Repertori</b>, triant una producció, cada obra diu si està <b>A repartir</b>, <b>Repartida</b> o <b>Retornada</b>. L’<b>arxiver</b> de cada ${w.section} (un rol de Gestió › Personal) marca a qui l’ha donada i, en acabar la producció, qui l’ha tornada; a «Per fer» li surt quan en té per repartir o per recollir. Qui no fa la producció (de baixa, o marcat «No fa») no surt a les llistes, tret que ja tingui la partitura: llavors hi surt amb un recordatori perquè la torni. Sota les obres, <b>Estadístiques de l’arxiu</b> mostra qui té què, qui no l’ha rebuda i qui encara no l’ha tornada. Els arxivers també porten el repertori: afegeixen, editen i esborren obres, solos, partitures, àudios i materials.</p>
    <p>Cada ${w.member} té un <b>codi d’arxiu</b> (S1, C4, T6…) que surt al costat del nom a les llistes de partitures, ordenades per codi. Els <b>reforços</b> d’una producció (gent de fora que només canta en aquella: s’afegeixen a la fitxa de la producció, a «Reforços») hi tenen el codi R1, R2…, que només val en aquella producció; també es pot donar a qualsevol altre ${w.member} un codi que només valgui en una producció. A dalt de <b>Tauler › Repertori</b>, <b>Carpeta i etiqueta</b> porta qui té la carpeta i l’etiqueta ${w.del}: quan algú les perd, se li trenquen o és nou, es marca «No» i surt a la llista per fer-ne de noves (i a «Per fer» de l’arxiver de la seva ${w.section}).</p>
    <h3>Llistes privades i tria de produccions</h3>
    <p>Cada agrupació ho tria a <b>Ajustos › Llistes i produccions</b>. Amb les <b>llistes privades</b>, cada ${w.member} només veu la seva assistència; les llistes, les estadístiques i el risc de tothom només els veu l’equip. Si <b>cadascú tria les produccions</b>, cada ${w.member} diu a «La meva fitxa» quines farà (com a mínim el ${choiceMin()}%); on diu que no, no hi està convocat i no li compta l’assistència. L’equip ho veu tot a Gestió › Produccions › «Qui fa cada producció».</p>
    <h3>Fitxa ${w.sh.del} i calendari</h3>
    <p>A la fitxa d’una sessió pots posar l’<b>hora de convocatòria</b>, el <b>vestuari</b>, el <b>punt de trobada</b> i què cal portar. La veuen tots els convocats i es pot copiar per al grup. Al <b>Calendari</b>, el botó <b>Mes</b> mostra la graella mensual.</p>
    <h3>${w.Members} i persones</h3>
    <p>A <b>Gestió › Personal</b> hi ha tothom, rol per rol: administració, direcció, gerència, secretaria, ${w.leaders}, ${esc(V.kind === 'cor' ? 'professors de cant' : 'professors')} i ${w.members}. De cada ${w.member}: ${w.section}, ${w.part}, baixes temporals amb dates i telèfon. L’accés a l’app es dona amb el correu, a dalt de tot de <b>Personal</b> (<b>+ Persona</b> o <b>Enganxa una llista</b>); la llista <b>Amb accés</b> diu qui pot entrar i qui encara no ho ha fet. Amb <b>Més… › Mira l’app com…</b> comproves què veu una persona concreta, amb tots els seus rols; <b>Qui ha entrat</b> i <b>Revisa els accessos</b> t’ajuden a fer que tothom hi entri.</p>
    <h3>Tipus d’agrupació i ${w.sections}</h3>
    <p>A <b>Ajustos › Agrupació</b> tries si és un cor, una orquestra, una banda, una cobla, un grup de cambra o una altra agrupació: canvien les paraules de l’app i els tipus de sessió. A <b>Ajustos › ${w.Sections}</b> en canvies els noms i les abreviatures, n’afegeixes o en treus. El nom, el tipus, les ${w.sections} i la imatge només els pot canviar un <b>Usuari Pro</b> que administri l’agrupació.</p>
    <h3>${esc(V.classes)}</h3>
    <p>Si l’agrupació fa classes individuals, s’activen a <b>Ajustos › ${esc(V.classes)}</b>. Qui tingui el rol de <b>${esc(V.Teacher.toLowerCase())}</b> fa el calendari: crea un dia, genera les hores seguides i hi posa qui ve a cadascuna. Cada ${w.member} hi veu la seva hora i pot <b>avisar que arribarà tard</b>, que <b>no hi anirà</b> o <b>demanar el canvi d’hora d’un dia</b> a un company, que l’ha d’acceptar. El ${esc(V.Teacher.toLowerCase())} rep totes aquestes notificacions al mòbil.</p>
    <p>Un canvi d’hora es pot demanar a algú concret o deixar-lo <b>obert</b>: llavors el veuen tots els qui tenen classe aquell dia i se’l queda el primer que digui que sí. Si una hora ha quedat <b>lliure</b>, qualsevol la pot demanar per recuperar una classe, i el ${esc(V.Teacher.toLowerCase())} l’hi dona amb un toc. Un dia sencer es pot <b>anul·lar</b>, i s’avisa tothom qui hi tenia hora. Cadascú pot <b>subscriure’s a les seves classes</b> des del calendari del mòbil, i si una classe cau dins d’un assaig l’app ho avisa.</p>
    <p>A cada hora, el ${esc(V.Teacher.toLowerCase())} hi <b>marca l’assistència</b> (present, retard, justificada o no justificada) i hi pot deixar una <b>nota</b> del que s’ha treballat i del que cal preparar: la nota només la veuen ell i aquell ${w.member}. A <b>Horari fix</b> hi ha l’hora setmanal de cadascú, i des d’allà es generen tots els dies d’un període de cop, saltant els festius.</p>
    <h3>Més d’una agrupació</h3>
    <p>Amb el mateix compte pots ser a diverses agrupacions: toca el nom a dalt de tot, o <b>Ajustos › Agrupacions</b>, per canviar-ne. Els <b>Usuaris Pro</b> també hi poden <b>crear una agrupació nova</b>, de la qual en són l’administrador/a. Cada agrupació té les seves dades, i ningú d’una altra no les pot veure.</p>
    <h3>Notificacions</h3>
    <p>Cadascú se’ls activa al seu aparell. L’app avisa dels anuncis nous, del material nou, de les convocatòries sense resposta, de les enquestes que es tanquen i, si es vol, de l’assaig de l’endemà. Als ${w.leaders}, també de les llistes a mitges i de qui baixa de la norma. Mai de nit. Al iPhone cal afegir abans l’app a la pantalla d’inici.</p>
    <h3>Còpies de seguretat</h3>
    <p>Cada nit es guarda automàticament una còpia de totes les dades en un lloc privat. També pots descarregar-ne una a Ajustos › Dades.</p>
    <h3>Pantalla d’inici</h3>
    <p>Al navegador del mòbil, tria <b>Afegeix a la pantalla d’inici</b> per tenir-la com una app, amb la icona de l’agrupació.</p>
  </div>` : `<div class="manual">
    <h3>Entrar</h3>
    <p>Entres amb <b>el teu correu</b>, sempre pel mateix enllaç: amb Google o, si el teu correu no és de Google, amb «Entra amb un altre correu» i la teva contrasenya. Si l’oblides, la pots recuperar des d’allà mateix. Afegeix l’enllaç a la pantalla d’inici del mòbil i el tindràs com una app.</p>
    <h3>Què hi pots fer</h3>
    <p>Pots consultar <b>tota l’app</b>: l’assistència de totes les ${w.sections} (llistes i estadístiques), el calendari i el tauler. No pots canviar-hi res. Al <b>teu espai</b> sí que pots avisar d’absències, confirmar convocatòries i respondre enquestes.</p>
    <h3>Avisar d’una absència</h3>
    <p><b>Avisa d’una absència</b>, tria els dies i explica el motiu. El teu ${w.leader} l’acceptarà o no; ho veuràs a Inici, a «Les meves absències».</p>
    <h3>Convocatòries</h3>
    <p>Quan hi hagi ${w.sh.show === 'concert' ? 'un concert' : 'una actuació'} o un viatge, respon <b>Hi seré</b> o <b>No hi podré anar</b> abans de la data límit.</p>
    <h3>La meva assistència</h3>
    <p>A Inici veus el teu percentatge d’assistència i quantes faltes et pots permetre abans ${w.sh.del}, per complir la norma del ${minAttendance()}%.</p>
    <h3>Tauler</h3>
    <p>Anuncis, el <b>repertori</b> (cada obra amb les partitures i els àudios de la teva ${w.part}, i els solos i petits grups on surts), documents de la temporada, enquestes i <b>sortides</b>, on t’hi pots apuntar.</p>
    <p>Els àudios d’estudi es poden escoltar <b>més lents</b> i <b>repetir un fragment</b>. I amb «Desa’ls al mòbil» tens les partitures i els àudios sense cobertura.</p>
    <h3>Cerca i text gran</h3>
    <p>La <b>lupa</b> de dalt busca persones, sessions (també per data, com ara «12/10»), obres i materials. A les teves inicials › <b>Aparença</b> pots fer el text més gran.</p>
    <h3>Què és cada cosa</h3>
    <ul><li><b>Missatges</b> (a Inici): a tothom o a unes ${w.sections}, per al dia a dia.</li>
      <li><b>Converses</b> (a les teves inicials): privades, entre una persona i l’equip.</li>
      <li><b>Anuncis</b> (al Tauler): queden fixats fins a una data.</li>
      <li><b>Enquestes</b> (al Tauler): una pregunta amb opcions.</li>
      <li><b>Absències</b>: quan algú avisa que no vindrà o que arribarà tard.</li>
      <li><b>Notificacions</b>: el que arriba al mòbil de tot l’anterior, a qui les té activades.</li></ul>
    <h3>Missatges</h3>
    <p>Els missatges del teu ${w.leader} i de l’equip surten a Inici i t’arriben al mòbil si tens les notificacions activades.</p>
    ${wardOn() ? `<h3>Vestidor</h3>
    <p>A les teves inicials, <b>Vestidor</b>: demana el teu vestuari (${esc(wardItems().map(x => x.name.toLowerCase()).join(' o '))}) amb la teva talla i segueix com va: demanat, encarregat, pendent d’emprovar, entregat. Quan l’hagis d’anar a emprovar, et sortirà a «Per fer».</p>` : ''}
    <h3>Pla d’assaig i la meva fitxa</h3>
    <p>A cada assaig veus què s’hi farà (obres i compassos) per preparar-ho, i si hi has faltat, què s’hi va fer. A les teves inicials, <b>La meva fitxa</b>: el telèfon, la talla de vestuari, un contacte d’emergència i els consentiments (drets d’imatge i protecció de dades), que només veu l’equip. Hi veus també si tens la quota pagada.</p>
    <h3>Fitxa ${w.sh.del}</h3>
    <p>Toca <b>Fitxa ${w.sh.del}</b> per veure l’hora de convocatòria, el vestuari i el punt de trobada. També la tens al Calendari, que pots veure per llista o per <b>mes</b>.</p>
    <h3>Notificacions</h3>
    <p>Activa’ls des del teu compte (les teves inicials, a dalt a la dreta) i t’assabentaràs dels anuncis i de les convocatòries sense haver d’obrir l’app. Tries de què vols que t’avisi i mai no t’escriu de nit. Si tens iPhone, abans has d’afegir l’app a la pantalla d’inici.</p>
    <h3>Calendari</h3>
    <p>A <b>Calendari</b> tens totes les sessions.${icsOn() ? ' Amb <b>Subscriu-t’hi</b> les tindràs a l’app de calendari del mòbil.' : ''}</p>
    <h3>Si fas de substitut</h3>
    <p>A Inici et sortirà «Avui passes llista de…». Toca <b>Passa llista</b> i marca els teus companys de ${w.section}.</p>
    ${S.groups.length > 1 ? '<h3>Diverses agrupacions</h3><p>Toca el nom a dalt de tot per canviar d’agrupació.</p>' : ''}
  </div>`;
  openSheet({ title: 'Com funciona', body: body + `<div class="panel" style="margin-top:18px">${themeRow()}</div>`, foot: pushSupported() ? '<span class="spacer"></span><button class="btn" data-act="push-setup">Activa les notificacions</button>' : '' });
}
