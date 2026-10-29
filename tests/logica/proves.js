// Proves de la lògica de l'app, sense navegador: percentatges, norma d'assistència, importador d'horaris, dates de les
// classes, arxiu de l'assistència, text amb format i pla d'assaig. Es carrega després de tots els fitxers de js/ (vegeu run.js).
'use strict';
const PROVES = [];
const prova = (name, fn) => PROVES.push({ name, fn });
function igual(a, b, what) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${what || 'valor'}: ${x} en lloc de ${y}`);
}
function cert(v, what) { if (!v) throw new Error(what || 'no es compleix'); }
const prop = (a, b, what) => { if (Math.abs(a - b) > 1e-9) throw new Error(`${what || 'valor'}: ${a} en lloc de ${b}`); };
const D = n => addDays(TODAY, n);

/** Una agrupació de proves: 4 cordes i qui calgui, amb les produccions i les llistes que es passin. */
function escenari({ members = [], productions = [], attendance = {}, config = {} }) {
  S.config = { name: 'Proves', alertFNJ: 3, minAttendance: 80, demo: false, ...config };
  applyGroupConfig();
  S.role = 'edit';
  S.members = new Map(members.map(m => [m.id, { active: true, ...m }]));
  S.productions = new Map(productions.map(p => [p.id, { excluded: [], ...p }]));
  S.attendance = new Map(Object.entries(attendance));
  ARCH.docs = new Map(); ARCH.by = new Map();
}
const marks = (sid, sec, m) => ({ [`${sid}_${sec}`]: { sessionId: sid, section: sec, marks: Object.fromEntries(Object.entries(m).map(([k, s]) => [k, { s }])) } });

/* ---------- Percentatges ---------- */
prova('rate i punctuality: minuts fets sobre els minuts convocats (el «no fa» no compta)', () => {
  const c = emptyCounts(), s = { time: '19:00', end: '21:00' };
  for (const mk of [{ s: 'P' }, { s: 'P' }, { s: 'P' }, { s: 'R' }, { s: 'FJ' }, { s: 'FNJ' }, { s: 'NP' }, { s: 'NP' }]) countMark(c, s, mk);
  prop(rate(c), 4 / 6, 'un retard sense minuts compta sencer');
  prop(punctuality(c), 3 / 4, 'puntualitat');
  igual(rate(emptyCounts()), null, 'sense dades');
  igual(pct(2 / 3), '67%'); igual(pct(null), '—'); igual(pct(1), '100%');
});
prova('assistència en minuts: un retard compta pels minuts que s’hi ha estat, i cada sessió pel que dura', () => {
  igual(sessionMins({ time: '18:30', end: '21:30' }), 180, 'de l’inici al final');
  igual(sessionMins({ time: '18:30' }), 120, 'sense final, dues hores');
  igual(sessionMins({}), 120, 'sense hora');
  igual(sessionMins({ time: '21:00', end: '20:00' }), 120, 'un final abans de l’inici no val');
  const c = emptyCounts();
  countMark(c, { time: '19:00', end: '22:00' }, { s: 'R', min: 30 });   // 2 h 30′ de 3 h
  countMark(c, { time: '19:00', end: '21:00' }, { s: 'P' });            // 2 h de 2 h
  countMark(c, { time: '19:00', end: '20:00' }, { s: 'FNJ' });          // 0 d’1 h
  prop(rate(c), (150 + 120) / (180 + 120 + 60), 'minuts');
  igual(c.min, 30, 'minuts de retard');
  const d = emptyCounts();
  countMark(d, { time: '19:00', end: '20:00' }, { s: 'R', min: 400 });
  igual(rate(d), 0, 'un retard més llarg que la sessió no resta més del que dura');
  escenari({
    members: [{ id: 'a', name: 'Puig, Anna', section: 'S' }],
    productions: [{ id: 'p', name: 'Tardor', start: D(-30), end: D(30), sessions: [
      { id: 's1', date: D(-10), type: 'Assaig', time: '19:00', end: '22:00' }, { id: 's2', date: D(-5), type: 'Assaig', time: '19:00', end: '22:00' },
      { id: 's3', date: D(3), type: 'Assaig', time: '19:00', end: '22:00' }] }],
    attendance: { ...marks('s1', 'S', { a: 'P' }), s2_S: { sessionId: 's2', section: 'S', marks: { a: { s: 'R', min: 90 } } } },
  });
  const r = ruleStatus('p', S.members.get('a'));
  prop(r.cur, 270 / 360, 'la norma també va en minuts');
  prop(r.best, 450 / 540, 'si ve al que queda');
  igual([r.att, r.abs, r.remaining], [2, 0, 1], 'i els assajos, en nombre');
});
prova('«Ha marxat abans»: es resten els minuts del final, com un retard', () => {
  const c = emptyCounts();
  countMark(c, { time: '19:00', end: '22:00' }, { s: 'P', early: 45 });           // 2 h 15′ de 3 h
  countMark(c, { time: '19:00', end: '22:00' }, { s: 'R', min: 30, early: 30 });  // 2 h de 3 h
  countMark(c, { time: '19:00', end: '20:00' }, { s: 'R', min: 40, early: 40 });  // no pot restar més del que dura
  prop(rate(c), (135 + 120 + 0) / (180 + 180 + 60), 'minuts');
  igual([c.left, c.leftMin, c.min], [3, 115, 70], 'quants cops i quants minuts ha marxat abans, a part dels retards');
  const d = emptyCounts();
  countMark(d, { time: '19:00', end: '20:00' }, { s: 'FNJ', early: 30 });
  igual([d.left, d.mDone], [0, 0], 'una falta no té «marxa abans»');
});
prova('tria de produccions: qui diu que no, no la fa; el mínim només es pot incomplir dient que no', () => {
  const ps = [['a', -40], ['b', 10], ['c', 40], ['d', 80], ['e', 120]].map(([id, off]) => ({ id, name: id.toUpperCase(), start: D(off), end: D(off + 7),
    sessions: [{ id: id + '1', date: D(off), type: 'Assaig' }, { id: id + '2', date: D(off + 7), type: 'Concert' }] }));
  escenari({ members: [{ id: 'm', name: 'Puig, Anna', section: 'S' }, { id: 'n', name: 'Vila, Pere', section: 'T' }], productions: ps });
  S.config.season = { name: 'T', from: D(-60), to: D(200) };
  S.prodChoice = new Map([['m', { memberId: 'm', prods: { c: 'no', d: 'no' } }]]);
  igual(isExcluded('c', 'm'), false, 'amb l’opció desactivada, les tries no compten');
  S.config.prodChoice = true;
  igual(isExcluded('c', 'm'), true, 'ha dit que no');
  igual(isExcluded('b', 'm'), false, 'no ha dit res: la fa');
  igual(isOut(allSessions('c')[0], S.members.get('m')), true, 'no hi està convocada');
  const s = choiceSummary('m');
  igual([s.total, s.yes, s.no, s.none], [5, 1, 2, 2], 'la que ja ha començat (A) compta que la fa');
  igual(s.ok, true, '3 de 5 = 60%');
  igual(choiceSummary('m', { c: 'no', d: 'no', e: 'no' }).ok, false, 'dient que no a una més, no hi arriba');
  igual(choiceSummary('m', { c: 'no', d: 'no', e: 'no' }).need, 3, 'en necessita 3');
  S.config.prodChoiceMin = 40;
  igual(choiceSummary('m', { c: 'no', d: 'no', e: 'no' }).ok, true, 'amb un mínim del 40%, sí');
  igual(choicesPending('m'), true, 'B i E encara per dir');
  igual(choicesPending('n'), true);
  S.prodChoice.set('n', { memberId: 'n', prods: { b: 'yes', c: 'yes', d: 'yes', e: 'no' } });
  igual(choicesPending('n'), false, 'ho ha dit tot (A ja ha començat)');
  S.productions.get('d').excluded = ['m'];
  igual(choiceSummary('m').total, 4, 'la que li ha tret l’equip no compta');
  delete S.config.prodChoice; delete S.config.prodChoiceMin; S.prodChoice = new Map();
});
prova('llistes privades: les còpies de cadascú només es tornen a escriure per a qui ha canviat', () => {
  const prev = { sessionId: 's', marks: { a: { s: 'P' }, b: { s: 'R', min: 10 }, c: { s: 'FJ', note: 'metge' } } };
  const next = { sessionId: 's', marks: { a: { s: 'P' }, b: { s: 'R', min: 15 }, d: { s: 'FNJ' } } };
  igual(mirrorDiff(prev, next).map(([m, mk]) => [m, mk && mk.s]), [['b', 'R'], ['c', null], ['d', 'FNJ']]);
  igual(mirrorDiff(null, { marks: { a: { s: 'P' } } }).length, 1, 'llista nova');
  igual(mirrorMark({ s: 'R', min: 5, note: '', auto: true }), { s: 'R', min: 5 }, 'només la marca, els minuts i la nota');
  S.config.attPrivate = true; S.role = 'read';
  igual(attHidden(), true, 'un cantaire no veu les llistes');
  S.role = 'edit';
  igual(attHidden(), false, 'qui passa llista, sí');
  delete S.config.attPrivate;
});
prova('arxiu de partitures: A repartir, Repartida i Retornada, per corda i per a tot el cor', () => {
  escenari({ members: [{ id: 'a', name: 'Puig, Anna', section: 'S' }, { id: 'b', name: 'Vila, Clara', section: 'S' }, { id: 'c', name: 'Bosch, Marc', section: 'T' }, { id: 'd', name: 'Font, Pere', section: 'B' }],
    productions: [{ id: 'p', name: 'Tardor', sessions: [{ id: 's', date: D(5), type: 'Assaig' }], excluded: ['d'] }] });
  S.scores = new Map();
  const m = id => S.members.get(id);
  igual(scoreSummary('p', 'w', '').state, 'todo', 'al principi, a repartir');
  igual(scoreSummary('p', 'w', '').n, 3, 'qui no fa la producció no en té');
  setScore('p', 'w', m('a'), 'given'); setScore('p', 'w', m('b'), 'given');
  igual(scoreSummary('p', 'w', 'S').state, 'given', 'les sopranos ja la tenen');
  igual(scoreSummary('p', 'w', '').state, 'todo', 'el cor encara no: falta el tenor');
  igual(S.scores.get('p_w_S').section, 'S', 'un document per corda');
  setScore('p', 'w', m('c'), 'given');
  igual(scoreSummary('p', 'w', '').state, 'given');
  setScore('p', 'w', m('a'), 'returned');
  const x = scoreSummary('p', 'w', '');
  igual([x.state, x.given, x.returned], ['given', 3, 1], 'una de tornada: encara repartida');
  setScore('p', 'w', m('b'), 'returned'); setScore('p', 'w', m('c'), 'returned');
  igual(scoreSummary('p', 'w', '').state, 'returned', 'totes tornades');
  setScore('p', 'w', m('c'), '');
  igual(scoreOf('p', 'w', m('c')), '', 'es pot desfer');
  S.scores = new Map();
});
prova('arxiu de partitures: qui no fa la producció no hi surt, tret que tingui la partitura (llavors, amb el recordatori)', () => {
  escenari({ members: [{ id: 'a', name: 'Puig, Anna', section: 'S' },
    { id: 'b', name: 'Vila, Clara', section: 'S', leaves: [{ from: D(-10), to: D(30) }] },        // de baixa tota la producció
    { id: 'c', name: 'Bosch, Marc', section: 'T' },                                               // «No fa» a mig camí
    { id: 'd', name: 'Font, Pere', section: 'B' },                                                // «No fa» des del principi
    { id: 'e', name: 'Mas, Laia', section: 'S', active: false },                                  // ja no és al cor
    { id: 'f', name: 'Roca, Neus', section: 'C', leaves: [{ from: D(-10), to: D(2) }] },          // de baixa uns dies i torna
    { id: 'g', name: 'Soler, Pau', section: 'T', leaves: [{ from: D(3) }] }],                     // de baixa fins al final
    productions: [{ id: 'p', name: 'Tardor', sessions: [{ id: 's1', date: D(-5), type: 'Assaig' }, { id: 's2', date: D(5), type: 'Assaig' }, { id: 's3', date: D(10), type: 'Assaig' }], excluded: ['c', 'd'] }] });
  S.scores = new Map();
  const m = id => S.members.get(id), why = prodOut('p');
  igual(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => why(m(id))), ['', 'baixa', 'prod', 'prod', 'cor', '', 'baixa'], 'per què no la fa cadascú');
  igual(scorePeople('p', '').map(x => x.id).sort(), ['a', 'f'], 'només qui la fa n’ha de tenir');
  igual(scoreSummary('p', 'w', '').n, 2, 'qui no l’ha rebuda i no la fa no compta');
  setScore('p', 'w', m('c'), 'given'); setScore('p', 'w', m('e'), 'given'); setScore('p', 'w', m('g'), 'given');
  const rows = scoreRows('p', '', ['w']);
  igual(rows.map(r => `${r.m.id}:${r.out}`).sort(), ['a:', 'c:prod', 'e:cor', 'f:', 'g:baixa'], 'qui la té, encara que ja no la faci, hi surt');
  igual(scoreRows('p', 'S', ['w']).map(r => r.m.id).sort(), ['a', 'e'], 'per corda: les sopranos (la que ja no és al cor hi és perquè la té)');
  const x = scoreSummary('p', 'w', '');
  igual([x.n, x.given, x.state], [5, 3, 'todo'], 'compten per recollir-les');
  cert(/però té la partitura: l’ha de retornar/.test(outNote('prod', 'given')), 'el recordatori diu que l’ha de retornar');
  cert(/^Ja no és/.test(outNote('cor', 'given')), 'qui ha deixat el cor');
  igual(outNote('', 'given'), '', 'qui la fa no té recordatori');
  setScore('p', 'w', m('c'), 'returned');
  cert(/ja l’ha retornada/.test(outNote('prod', 'returned')), 'un cop tornada, ho diu');
  igual(scoreRows('p', '', ['w']).some(r => r.m.id === 'c'), true, 'i encara hi surt (per si cal desfer-ho)');
  setScore('p', 'w', m('c'), '');
  igual(scoreRows('p', '', ['w']).some(r => r.m.id === 'c'), false, 'si mai l’ha tinguda, ja no hi surt');
  S.scores = new Map();
});
prova('reforços: només fan la seva producció; a les altres no surten enlloc', () => {
  escenari({ members: [{ id: 'a', name: 'Puig, Anna', section: 'B' }, { id: 'r', name: 'Gómez, Mateu', section: 'B' }],
    productions: [{ id: 'p', name: 'Oratori', sessions: [{ id: 's1', date: D(-2), type: 'Assaig' }, { id: 's2', date: D(3), type: 'Assaig' }], guests: ['r'] },
      { id: 'q', name: 'Sant Esteve', sessions: [{ id: 's3', date: D(4), type: 'Assaig' }, { id: 'sx', date: D(6), type: 'Assaig', alsoIn: ['p'] }] }] });
  const m = id => S.members.get(id);
  igual([isExcluded('p', 'r'), isExcluded('q', 'r'), isExcluded('q', 'a')], [false, true, false], 'fa l’Oratori i no Sant Esteve');
  igual(isOut(sessionById('s3'), m('r')), true, 'a una sessió de l’altra producció és fora');
  igual(strayGuest(sessionById('s3'), m('r')), true, 'i ni tan sols surt a la llista');
  igual(strayGuest(sessionById('sx'), m('r')), false, 'a una sessió compartida amb la seva, sí');
  igual(strayGuest(sessionById('s1'), m('a')), false, 'qui és del cor sempre hi surt');
  igual(effMark(sessionById('s3'), m('r'))?.why, 'prod', 'compta com «No fa»');
  igual(guestProds('r').map(p => p.id), ['p']);
  saveProduction({ ...clone(S.productions.get('q')), guests: ['r'] });
  igual(isExcluded('q', 'r'), false, 'en desar una producció, es torna a mirar qui és reforç de què');
});
prova('codis d’arxiu: per ordre de codi, els R dels reforços al final, i el de la producció mana sobre el de sempre', () => {
  escenari({ members: [{ id: 'a', name: 'Puig, Anna', section: 'B' }, { id: 'b', name: 'Vila, Joan', section: 'B' }, { id: 'c', name: 'Abad, Marc', section: 'B' }, { id: 'r', name: 'Gómez, Mateu', section: 'B' }, { id: 'z', name: 'Ros, Pau', section: 'B' }],
    productions: [{ id: 'p', name: 'Oratori', sessions: [{ id: 's1', date: D(3), type: 'Assaig' }], guests: ['r'] }] });
  S.kit = new Map();
  const m = id => S.members.get(id);
  setCode(m('a'), 'b10'); setCode(m('b'), 'B2'); setCode(m('c'), 'B1');
  igual(nextGuestCode('p'), 'R1', 'el primer reforç');
  setCode(m('r'), nextGuestCode('p'), 'p');
  igual([codeOf(m('a')), codeOf(m('r'), 'p'), codeOf(m('r')), codeOf(m('z'))], ['B10', 'R1', '', ''], 'en majúscules; el R només val a la producció');
  igual(nextGuestCode('p'), 'R2', 'el següent');
  igual(membersOf('B').sort(codeCmp('p')).map(x => x.id), ['c', 'b', 'a', 'r', 'z'], 'B1, B2, B10, R1 i qui no en té');
  setCode(m('b'), 'B7', 'p');
  igual([codeOf(m('b'), 'p'), codeOf(m('b'))], ['B7', 'B2'], 'un codi només per a una producció');
  setCode(m('b'), '', 'p');
  igual(codeOf(m('b'), 'p'), 'B2', 'en treure’l, torna el de sempre');
  igual(Object.keys(S.kit.get('B').prod.p), ['r'], 'i a la producció només hi queda el reforç');
  igual(S.kit.get('B').section, 'B', 'un document per corda');
  S.kit = new Map();
});
prova('carpeta i etiqueta: qui en té, qui no i qui falta mirar', () => {
  escenari({ members: [{ id: 'a', name: 'Puig, Anna', section: 'S' }, { id: 'b', name: 'Vila, Clara', section: 'S' }, { id: 'c', name: 'Mas, Laia', section: 'S', active: false }, { id: 'r', name: 'Gómez, Mia', section: 'S' }],
    productions: [{ id: 'old', name: 'Passada', sessions: [{ id: 's0', date: D(-30), type: 'Assaig' }], guests: ['r'] }] });
  S.kit = new Map();
  const m = id => S.members.get(id);
  igual(kitPeople('S').map(x => x.id).sort(), ['a', 'b'], 'qui ja no és al cor, i el reforç d’una producció acabada, no');
  igual(kitStarted('S'), false, 'encara no es porta');
  setKit(m('a'), 'folder', 'yes'); setKit(m('a'), 'label', 'no'); setKit(m('b'), 'folder', 'yes');
  const x = kitSummary('S');
  igual([x.n, x.folder.yes, x.folder.no, x.label.yes, x.label.no, x.unk], [2, 2, 0, 0, 1, 1], 'el recompte');
  igual(kitStarted('S'), true, 'ja es porta');
  setKit(m('a'), 'folder', '');
  igual(kitOf(m('a'), 'folder'), '', 'es pot desfer');
  S.kit = new Map();
});
prova('arxiver: el rol porta la seva corda, també si la fitxa en canvia', () => {
  escenari({ members: [{ id: 'a', name: 'Puig, Anna', section: 'S' }] });
  const acc = { email: 'a@x.cat', roles: ['archive', 'singer'], role: 'archive', section: 'S', memberId: 'a' };
  igual(accountForMember(acc, { ...S.members.get('a'), section: 'C' }, S.members.get('a')).section, 'C', 'canvia de corda');
  igual(accountForMember({ ...acc, roles: ['leader', 'archive', 'singer'] }, { ...S.members.get('a'), leader: false }, { ...S.members.get('a'), leader: true }).section, 'S', 'si deixa de ser cap de corda, continua sent arxiver de la seva');
  igual(rolesOf(acc), ['archive', 'singer']);
  igual(roleLevel(acc), 'read', 'no passa llista');
});
prova('rols sumats: cadascú té les pestanyes i els permisos de tots els seus rols, sense triar-ne cap', () => {
  escenari({ members: [{ id: 'a', name: 'Puig, Anna', section: 'S' }, { id: 't', name: 'Bosch, Marc', section: 'T', leader: true }] });
  S.classes = new Map();
  const as = (roles, extra = {}) => {
    S.me = { email: 'x@x.cat', roles, section: extra.section || '', memberId: extra.memberId || '' };
    S.memberId = extra.memberId || null; S.role = roleLevel(S.me);
    return { tabs: tabsForRole().join(','), more: moreTabs().join(','), gestio: gestioOn() ? gestioTabs().join(',') : '', areas: attAreas().join(',') };
  };
  igual(as(['singer'], { memberId: 'a' }), { tabs: 'avisos,llista,calendari,tauler', more: '', gestio: '', areas: 'me' }, 'cantaire');
  igual(as(['leader', 'singer'], { section: 'T', memberId: 't' }), { tabs: 'avisos,llista,calendari,tauler', more: '', gestio: '', areas: 'me,sec' }, 'cap de corda que canta');
  igual(as(['leader'], { section: 'T' }), { tabs: 'avisos,llista', more: '', gestio: '', areas: 'sec' }, 'cap de corda que no canta');
  igual(as(['archive', 'singer'], { section: 'S', memberId: 'a' }).tabs, 'avisos,llista,calendari,tauler', 'arxiver que canta: l’arxiu és al Tauler');
  igual(as(['director']), { tabs: 'avisos,llista,calendari,tauler,gestio', more: '', gestio: 'personal,produccions,config', areas: 'all' }, 'direcció, amb tota la Gestió');
  igual(as(['gerencia']).gestio, 'personal,produccions,config', 'gerència, amb tota la Gestió');
  igual(as(['secretaria']), { tabs: 'avisos,tauler,gestio', more: '', gestio: 'personal', areas: '' }, 'secretaria');
  S.config.classesOn = true;
  S.classes = new Map([['c1', { id: 'c1', date: D(2), teacher: 'p@x.cat', slots: [{ id: 's1', time: '17:00', memberId: 't' }] }]]);
  igual(as(['admin', 'leader', 'singer'], { section: 'T', memberId: 't' }), { tabs: 'avisos,llista,calendari,tauler,classes', more: 'gestio', gestio: 'personal,produccions,config', areas: 'me,sec,all' },
    'administració que porta una corda i fa classes: cinc pestanyes, i Gestió al menú del compte');
  igual(as(['admin', 'gerencia']), { tabs: 'avisos,llista,calendari,tauler,gestio', more: 'classes', gestio: 'personal,produccions,config', areas: 'all' },
    'administració sense classes pròpies: les classes al menú del compte');
  igual(as(['voice']).tabs, 'avisos,calendari,classes', 'professor de cant');
  igual(clTabKeys(), ['llista', 'alumnes'], 'el professor, a Classes: l’assistència i els alumnes');
  // Qui edita què: el tauler i les sessions no són del cap de corda.
  as(['leader', 'singer'], { section: 'T', memberId: 't' });
  igual([canEdit(), canBoard(), canProd(), canRepertoire(), absencesOn()], [true, false, false, false, true], 'el cap de corda passa llista i respon absències');
  as(['director']);
  igual([canBoard(), canProd(), absencesOn()], [true, true, true], 'la direcció porta el tauler, les sessions i les absències');
  as(['secretaria']);
  igual([canBoard(), canProd(), absencesOn()], [true, false, false], 'la secretaria porta el tauler');
  S.me = null; S.memberId = null; S.role = 'edit'; S.config.classesOn = false; S.classes = new Map();
});
prova('canvis d’hora de classe entre els dos dies de la setmana, i a unes quantes persones', () => {
  escenari({ members: [{ id: 'a', name: 'Puig, Anna', section: 'S' }, { id: 'b', name: 'Vila, Clara', section: 'S' }, { id: 'c', name: 'Bosch, Marc', section: 'T' }] });
  const mon = (() => { let d = addDays(TODAY, 7); while (new Date(d + 'T12:00:00').getDay() !== 1) d = addDays(d, 1); return d; })();
  S.classes = new Map([
    ['dl', { id: 'dl', date: mon, teacher: 'p', slots: [{ id: 'x1', time: '17:00', memberId: 'a' }, { id: 'x2', time: '17:40', memberId: 'b' }] }],
    ['dc', { id: 'dc', date: addDays(mon, 2), teacher: 'p', slots: [{ id: 'y1', time: '18:00', memberId: 'c' }] }],
    ['al', { id: 'al', date: addDays(mon, 2), teacher: 'q', slots: [{ id: 'z1', time: '18:00', memberId: 'b' }] }],
    ['nx', { id: 'nx', date: addDays(mon, 7), teacher: 'p', slots: [{ id: 'w1', time: '18:00', memberId: 'b' }] }],
  ]);
  igual(weekClasses(S.classes.get('dl')).map(c => c.id), ['dl', 'dc'], 'el dilluns i el dimecres del mateix professor, no els d’un altre ni de la setmana següent');
  S.classReq = new Map([['r', { id: 'r', kind: 'swap', status: 'accepted', classId: 'dl', slotId: 'x1', memberId: 'a', withClassId: 'dc', withSlotId: 'y1', withMemberId: 'c' }]]);
  igual(classSlots(S.classes.get('dl')).find(x => x.id === 'x1').memberId, 'c', 'en Marc passa al dilluns');
  igual(classSlots(S.classes.get('dc')).find(x => x.id === 'y1').memberId, 'a', 'l’Anna passa al dimecres');
  igual(classSlots(S.classes.get('dl')).find(x => x.id === 'x2').memberId, 'b', 'la resta no es mou');
  S.classReq = new Map([['s', { id: 's', kind: 'swap', status: 'accepted', classId: 'dl', slotId: 'x1', memberId: 'a', withSlotId: 'x2', withMemberId: 'b' }]]);
  igual(classSlots(S.classes.get('dl')).map(x => x.memberId), ['b', 'a'], 'el mateix dia, com sempre');
  S.memberId = 'c'; S.classReq = new Map();
  const open = { id: 'o', kind: 'swap', status: 'pending', open: true, classId: 'dl', slotId: 'x1', memberId: 'a', to: ['c'], offers: { c: 'dc|y1' } };
  igual(mySwapSlot(open)?.x.id, 'y1', 'qui és a la llista hi posa la seva hora del dimecres');
  S.classReq = new Map([['o', open]]);
  igual(openSwaps().length, 1, 'li surt');
  S.memberId = 'b';
  igual(openSwaps().length, 0, 'a qui no és a la llista, no');
  S.memberId = null; S.classes = new Map(); S.classReq = new Map();
});
prova('temps d’assaig: un cap de setmana compta per les hores que s’hi assaja', () => {
  igual(sessionMins({ time: '09:15', end: '20:30', mins: 335 }), 335, 'mana sobre l’hora d’inici i de final');
  igual(sessionMins({ mins: 175 }), 175, 'també sense hores');
  igual(sessionMins({ time: '20:30', end: '22:30', mins: 0 }), 120, 'zero: com sempre');
  igual([parseMins('5:35'), parseMins('2h55'), parseMins('5,5'), parseMins('3'), parseMins('90 min'), parseMins('hola'), parseMins('0:00')], [335, 175, 330, 180, 90, 0, 0]);
  igual([fmtMins(335), fmtMinsLong(335), fmtMinsLong(120), fmtMinsLong(40)], ['5:35', '5 h 35 min', '2 h', '40 min']);
  const c = emptyCounts();
  countMark(c, { mins: 335 }, { s: 'P' }); countMark(c, { time: '20:30', end: '22:30' }, { s: 'FNJ' });
  prop(rate(c), 335 / 455, 'el dissabte pesa gairebé tres assajos');
});
prova('computeStats: compta per persona, per corda i per sessió, i salta les sessions sense llista', () => {
  escenari({
    members: [{ id: 'a', name: 'Puig, Anna', section: 'S' }, { id: 'b', name: 'Bosch, Marc', section: 'T' }, { id: 'c', name: 'Camps, Oriol', section: 'T' }],
    productions: [{ id: 'p', name: 'Tardor', start: D(-30), end: D(30), sessions: [
      { id: 's1', date: D(-10), type: 'Assaig' }, { id: 's2', date: D(-5), type: 'Assaig' }, { id: 's3', date: D(-2), type: 'Assaig', sections: ['T'] },
      { id: 's4', date: D(-1), type: 'Assaig' }, { id: 's5', date: D(3), type: 'Assaig' }] }],
    attendance: { ...marks('s1', 'S', { a: 'P' }), ...marks('s1', 'T', { b: 'P', c: 'FNJ' }), ...marks('s2', 'S', { a: 'R' }), ...marks('s2', 'T', { b: 'FJ', c: 'P' }), ...marks('s3', 'T', { b: 'P', c: 'P' }) },
  });
  const st = computeStats({ kind: 'prod', id: 'p', name: 'Tardor' });
  igual(st.sessions.length, 4, 'sessions passades');
  igual(st.counted.length, 3, 'sessions amb llista');
  igual({ P: st.tot.P, R: st.tot.R, FJ: st.tot.FJ, FNJ: st.tot.FNJ }, { P: 5, R: 1, FJ: 1, FNJ: 1 }, 'total');
  const row = id => st.rows.find(r => r.m.id === id);
  prop(rate(row('a')), 1, 'Anna'); prop(rate(row('b')), 2 / 3, 'Marc'); prop(rate(row('c')), 2 / 3, 'Oriol');
  igual(row('a').hist.length, 3, 'Anna no és convocada a s3');
  prop(rate(st.bySec.T), 4 / 6, 'tenors');
});
prova('computeStats per corda: només aquella corda', () => {
  const st = computeStats({ kind: 'prod', id: 'p', name: 'Tardor' }, 'S');
  igual(st.rows.map(r => r.m.id), ['a']);
  igual(st.tot.P + st.tot.R, 2);
});

/* ---------- Norma d'assistència ---------- */
function normaBase(extra = {}) {
  escenari({
    members: [{ id: 'a', name: 'A', section: 'T' }, { id: 'b', name: 'B', section: 'T' }, { id: 'c', name: 'C', section: 'T', leaves: [{ from: D(-9), to: D(-8) }] },
      { id: 'd', name: 'D', section: 'T' }, { id: 'e', name: 'E', section: 'S' }],
    productions: [{ id: 'p', name: 'Tardor', start: D(-30), end: D(30), excluded: ['d'], sessions: [
      { id: 's1', date: D(-9), type: 'Assaig' }, { id: 's2', date: D(-6), type: 'Assaig' }, { id: 's3', date: D(-3), type: 'Assaig' },
      { id: 's4', date: D(2), type: 'Assaig' }, { id: 's5', date: D(5), type: 'Assaig' }, { id: 'c1', date: D(9), type: 'Concert' }] }],
    attendance: { ...marks('s1', 'T', { a: 'P', b: 'FNJ' }), ...marks('s2', 'T', { a: 'FNJ', b: 'FNJ', c: 'P' }), ...marks('s3', 'T', { a: 'P', b: 'P', c: 'P' }) },
    ...extra,
  });
}
prova('norma: a sota però encara hi pot arribar → risc', () => {
  normaBase();
  const r = ruleStatus('p', S.members.get('a'));
  igual({ att: r.att, abs: r.abs, remaining: r.remaining, status: r.status }, { att: 2, abs: 1, remaining: 2, status: 'risk' });
  prop(r.cur, 2 / 3); prop(r.best, 4 / 5);
});
prova('norma: ja no hi pot arribar → fora', () => {
  normaBase();
  const r = ruleStatus('p', S.members.get('b'));
  igual(r.status, 'out'); prop(r.best, 3 / 5);
});
prova('norma: una baixa temporal no compta com a falta', () => {
  normaBase();
  const r = ruleStatus('p', S.members.get('c'));
  igual({ att: r.att, abs: r.abs, status: r.status }, { att: 2, abs: 0, status: 'ok' });
});
prova('norma: qui no fa la producció, o no hi té cap llista, no en té', () => {
  normaBase();
  igual(ruleStatus('p', S.members.get('d')), null, 'no la fa');
  igual(ruleStatus('p', S.members.get('e')), null, 'sense llistes');
  igual(ruleStatus(null, S.members.get('a')), null, 'sense producció');
});
prova('norma: el concert no compta, i amb el mínim al 60% en risc ja està bé', () => {
  normaBase({ config: { minAttendance: 60 } });
  igual(ruleStatus('p', S.members.get('a')).status, 'ok');
  igual(ruleStatus('p', S.members.get('a')).remaining, 2, 'el concert no és un assaig que quedi');
});
prova('norma: una sessió compartida compta per a totes dues produccions', () => {
  escenari({
    members: [{ id: 'a', name: 'A', section: 'B' }],
    productions: [
      { id: 'p', name: 'P', sessions: [{ id: 's1', date: D(-4), type: 'Assaig', alsoIn: ['q'] }] },
      { id: 'q', name: 'Q', sessions: [{ id: 's2', date: D(-2), type: 'Assaig' }] }],
    attendance: { ...marks('s1', 'B', { a: 'FNJ' }), ...marks('s2', 'B', { a: 'P' }) },
  });
  igual(ruleStatus('q', S.members.get('a')).att + ruleStatus('q', S.members.get('a')).abs, 2, 'Q compta la compartida');
  igual(ruleStatus('p', S.members.get('a')).status, 'out', 'P només en té una');
});

/* ---------- Importador d'horaris ---------- */
prova('parseTime: les maneres d’escriure una hora', () => {
  igual(['15:00', "15'00h", '15.00', '1500', '15h', '9', '9:05', ' 16 : 20 '].map(parseTime), [900, 900, 900, 900, 900, 540, 545, 980]);
  igual(['24:00', '12:60', 'hola', '', '7.5'].map(parseTime), [null, null, null, null, null]);
  igual(hhmm(980), '16:20');
});
const PLANTILLA = [{ id: 'a', name: 'Puig, Anna', section: 'S' }, { id: 'b', name: 'Bosch, Marc', section: 'T' }, { id: 'c', name: 'Ferrer, Laia', section: 'S' },
  { id: 'j', name: 'Cuesta, Joana', section: 'C' }, { id: 'q', name: 'Quingles, Pol', section: 'T' }, { id: 'r', name: 'Ramírez, Pol', section: 'T' }];
prova('parseSchedule: la graella del full de càlcul (un dia per columna)', () => {
  escenari({ members: PLANTILLA });
  const g = parseSchedule(['\tDilluns\t\t\tDimecres\t\t', 'Alumne\tInici\tFinal\tAlumne\tInici\tFinal', 'Anna Puig\t15:00\t15:40\tMarc Bosch\t16\'20h\t17\'00h', 'Laia Ferrer\t15.40\t16.20\t\t\t'].join('\n').replace(/^\t/, ''));
  igual(g.rows.map(r => [r.name, r.day, r.from, r.to, r.mins, r.sure, r.hits.map(m => m.id)]),
    [['Anna Puig', 1, 900, 940, 40, true, ['a']], ['Marc Bosch', 3, 980, 1020, 40, true, ['b']], ['Laia Ferrer', 1, 940, 980, 40, true, ['c']]]);
  igual(g.days, [1, 3]);
});
prova('parseSchedule: l’horari passat per WhatsApp, amb l’aula de cada dia', () => {
  escenari({ members: PLANTILLA });
  const g = parseSchedule(['Dilluns — Tarda Aula 2 Petit Palau', '15:00 – 15:40 Anna Puig', '15:40 – 16:20 Pol', '', 'Dimecres - Aula 11 · Espai Palau', '16:20 - 17:00 Joana Cuestas'].join('\n'));
  igual(g.rows.map(r => [r.name, r.day, r.from]), [['Anna Puig', 1, 900], ['Pol', 1, 940], ['Joana Cuestas', 3, 980]]);
  igual(g.places, { 1: 'Aula 2 Petit Palau', 3: 'Aula 11 · Espai Palau' });
  const pol = g.rows[1];
  igual([pol.sure, pol.hits.length], [false, 2], '«Pol» és ambigu');
  igual([g.rows[2].sure, g.rows[2].hits[0].id], [true, 'j'], '«Cuestas» és «Cuesta»');
});
prova('matchMember: sense coincidències no s’inventa ningú', () => {
  escenari({ members: PLANTILLA });
  igual(matchMember('Montse Meneses').hits, []);
  igual(matchMember('').hits, []);
});

/* ---------- Dates de les classes ---------- */
prova('classDates: dilluns i dimecres d’un trimestre, sense el 12 d’octubre', () => {
  const d = classDates('2026-09-21', '2026-12-16', [1, 3], '12/10');
  igual(d.length, 25);
  igual([d[0], d[1], d[d.length - 1]], ['2026-09-21', '2026-09-23', '2026-12-16']);
  cert(!d.includes('2026-10-12'), 'el 12/10 és festa');
});
prova('classDates: els dies de festa de l’any següent (sense any) també se salten', () => {
  const d = classDates('2026-12-01', '2027-01-31', [3], '23/12, 6/1');
  igual(d, ['2026-12-02', '2026-12-09', '2026-12-16', '2026-12-30', '2027-01-13', '2027-01-20', '2027-01-27']);
});
prova('classDates: altres formats de data i períodes buits', () => {
  igual(classDates('2026-10-01', '2026-10-31', [1], '12-10-2026 19.10.26'), ['2026-10-05', '2026-10-26']);
  igual(classDates('2026-10-31', '2026-10-01', [1], ''), []);
  igual(classDates('2026-10-01', '2026-10-31', [], ''), []);
});

/* ---------- Arxiu de l'assistència ---------- */
prova('archSegment: trossos fixos i seguits de l’any', () => {
  igual(archSegment('2026-10-05'), { id: '2026-08-01_2026-12-31', from: '2026-08-01', to: '2026-12-31' });
  igual(archSegment('2027-02-10').id, '2027-01-01_2027-03-31');
  igual(archSegment('2027-07-31').id, '2027-04-01_2027-07-31');
  igual(nextSegment(archSegment('2026-12-31')).id, '2027-01-01_2027-03-31');
});
prova('archivable: només quan fa dues setmanes que el tros s’ha acabat, i per ordre', () => {
  const dates = ['2026-09-09', '2026-11-20', '2027-02-02'];
  igual(archivable(dates, '', '2027-01-10').map(g => g.id), [], 'encara no');
  igual(archivable(dates, '', '2027-01-20').map(g => g.id), ['2026-08-01_2026-12-31']);
  igual(archivable(dates, '2026-12-31', '2027-04-20').map(g => g.id), ['2027-01-01_2027-03-31']);
  igual(archivable(dates, '', '2027-04-20').map(g => g.id), ['2026-08-01_2026-12-31', '2027-01-01_2027-03-31']);
  igual(archivable([], '', '2027-04-20'), []);
});
prova('archiveDocs i attDoc: l’arxiu guarda les llistes del tros, i la llista viva té preferència', () => {
  escenari({ members: [{ id: 'a', name: 'A', section: 'S' }], productions: [{ id: 'p', name: 'P', sessions: [{ id: 's1', date: '2026-10-01' }, { id: 's2', date: '2027-01-15' }] }] });
  const docs = new Map([['s1_S', { sessionId: 's1', section: 'S', marks: { a: { s: 'P' } } }], ['s2_S', { sessionId: 's2', section: 'S', marks: { a: { s: 'FJ' } } }]]);
  const out = archiveDocs(archSegment('2026-10-01'), docs, d => sessionById(d.sessionId)?.date);
  igual(Object.keys(out), ['s1_S']);
  igual(out.s1_S.date, '2026-10-01', 'porta la data');
  ARCH.docs = new Map([['s1_S', out.s1_S]]);
  igual(attDoc('s1', 'S').marks.a.s, 'P', 'des de l’arxiu');
  S.attendance.set('s1_S', { sessionId: 's1', section: 'S', marks: { a: { s: 'R' } } });
  igual(attDoc('s1', 'S').marks.a.s, 'R', 'la viva guanya');
  igual([...allAttendance().keys()].sort(), ['s1_S']);
});

/* ---------- Text amb format i pla d'assaig ---------- */
prova('richText: paràgrafs, llistes, títols, negreta i enllaços, sempre escapat', () => {
  const h = richText('RESUM ASSAJOS\nDilluns vam fer:\n* Nº 2 Banish sorrow\n- Nº 4 **When monarchs unite**\n\nMés a https://exemple.cat/x <script>');
  igual(h, '<h4>RESUM ASSAJOS</h4><p>Dilluns vam fer:</p><ul><li>Nº 2 Banish sorrow</li><li>Nº 4 <b>When monarchs unite</b></li></ul><p>Més a <a href="https://exemple.cat/x" target="_blank" rel="noopener">https://exemple.cat/x</a> &lt;script&gt;</p>');
  igual(richText(''), '');
  igual(cutText('una frase bastant llarga per tallar', 20), 'una frase bastant…');
});
prova('planForMe: cadascú veu el seu parcial, la pausa i el tutti', () => {
  escenari({});
  const items = [{ kind: 'head', title: 'Parcial', who: 'S,C' }, { kind: '', title: 'Nº 16', who: '' }, { kind: 'head', title: 'Parcial', who: 'T,B' }, { kind: '', title: 'Nº 20' },
    { kind: 'break', time: '21:30' }, { kind: 'head', title: 'Tutti', who: '' }, { kind: '', title: 'Nº 14' }, { kind: '', title: 'Solo', who: 'Solistes' }, { kind: '', title: 'Només S', who: 'S' }];
  igual(planForMe(items, 'T').map(it => it.title || it.kind), ['Parcial', 'Nº 20', 'break', 'Tutti', 'Nº 14', 'Solo']);
  igual(planForMe(items, 'S').map(it => it.title || it.kind), ['Parcial', 'Nº 16', 'break', 'Tutti', 'Nº 14', 'Solo', 'Només S']);
  igual(planForMe(items, '').length, items.length, 'l’equip ho veu tot');
});

prova('fitxers: els àudios del WhatsApp («.m4a.mp4») són àudio, amb un títol net', () => {
  const f = (name, type) => ({ name, type });
  igual(fileKind(f('CHORUS ACT 1 Nº2 Banish sorrow .m4a.mp4', 'video/mp4')), 'Àudio');
  igual(fileKind(f('assaig.mp4', 'video/mp4')), 'Vídeo');
  igual(fileKind(f('Calendari CJ 26-27 cantaires.pdf', 'application/pdf')), 'PDF');
  igual(fileKind(f('nota.opus', '')), 'Àudio');
  igual(titleFromFile('CHORUS ACT 1 Nº2 Banish sorrow .m4a.mp4'), 'CHORUS ACT 1 Nº2 Banish sorrow');
  igual(titleFromFile('Pla de treball L\'Auditori - 2a Mahler OBC i OC.pdf'), 'Pla de treball L\'Auditori - 2a Mahler OBC i OC');
  igual(titleFromFile('Partitura_v2.0.pdf'), 'Partitura v2.0');
  igual(matKindOf(f('x.m4a.mp4', 'video/mp4')), 'audio');
  igual(matKindOf(f('x.docx', '')), 'altres');
});

/* ---------- Persones: cada persona un sol cop ---------- */
prova('rosterMatch: el mateix nom en qualsevol ordre, i només si és una sola persona', () => {
  escenari({ members: [{ id: 'a', name: 'Puig Ferrer, Anna', section: 'S' }, { id: 'b', name: 'García, Núria', section: 'S' },
    { id: 'c', name: 'Puig, Pau', section: 'T' }, { id: 'd', name: 'Roca i Vidal, Pau', section: 'B' }] });
  S.staff = new Map();
  igual(rosterMatch('Anna Puig')?.id, 'a');
  igual(rosterMatch('nuria garcia')?.id, 'b', 'sense accents ni majúscules');
  igual(rosterMatch('Pau Roca')?.id, 'd', 'sense el «i» ni el segon cognom');
  igual(rosterMatch('Pau Puig')?.id, 'c');
  igual(rosterMatch('Puig'), null, 'un sol mot no n’hi ha prou');
  igual(rosterMatch('Marta Soler'), null, 'no s’inventa ningú');
  S.staff = new Map([['nuria@x.cat', { email: 'nuria@x.cat', roles: ['singer'], memberId: 'b' }]]);
  igual(rosterMatch('Núria García'), null, 'qui ja té compte no es torna a vincular');
  igual(rosterMatch('Núria García', { email: 'nuria@x.cat' })?.id, 'b', 'llevat que sigui el seu mateix compte');
  igual(rosterMatch('Núria García', { free: false })?.id, 'b');
  S.staff = new Map();
});
prova('peopleLine: el nom i el correu en qualsevol format, també les columnes d’un full de càlcul', () => {
  escenari({ members: [] });
  igual(peopleLine('Puig, Anna — anna@exemple.com'), { name: 'Puig, Anna', mail: 'anna@exemple.com', sec: '' });
  igual(peopleLine('Mata, Martina <Martina@Exemple.com>'), { name: 'Mata, Martina', mail: 'martina@exemple.com', sec: '' });
  igual(peopleLine('anna@exemple.com.'), { name: '', mail: 'anna@exemple.com', sec: '' }, 'sense el punt final');
  igual(peopleLine('Soler, Marta'), { name: 'Soler, Marta', mail: '', sec: '' });
  igual(peopleLine('Puig Ferrer\tAnna\tSoprano\t600 123 123\tanna@exemple.com'), { name: 'Puig Ferrer, Anna', mail: 'anna@exemple.com', sec: 'S' }, 'columnes');
  igual(peopleLine('   '), null);
});
prova('peoplePlan: qui ja és a la plantilla s’hi vincula, qui no hi és té fitxa nova i qui ja té accés hi suma el rol', () => {
  escenari({ members: [{ id: 'a', name: 'Puig, Anna', section: 'S' }, { id: 'e', name: 'Mas, Elisa', section: 'S', leader: true }] });
  S.staff = new Map([['dir@x.cat', { email: 'dir@x.cat', name: 'Director', roles: ['director'] }]]);
  const p = peoplePlan(['Anna Puig — anna@x.cat', 'Nova, Persona\tnova@x.cat', 'Sense Correu', 'dir@x.cat', 'Elisa Mas elisa@x.cat', 'anna@x.cat'].join('\n'), 'singer', 'C', true);
  igual(p.map(r => [r.member?.id || '', !!r.newMember, !!r.adds, r.skip || '']),
    [['a', false, true, ''], ['', true, true, ''], ['', true, false, ''], ['', true, true, ''], ['e', false, true, ''], ['', false, false, 'Repetida a la llista']]);
  igual([p[1].sec, p[2].sec], ['C', 'C'], 'les fitxes noves van a la corda triada');
  igual([p[3].name, p[3].roles], ['Director', ['director', 'singer']], 'qui ja tenia accés conserva el nom i el rol');
  igual(peoplePlan('nou@x.cat', 'singer', 'S', true)[0].skip, 'Falta el nom', 'una fitxa nova necessita el nom');
  igual(p[4].roles, ['leader', 'singer'], 'qui la fitxa diu que és cap de corda en té el permís');
  const d = peoplePlan('Director, Nou\tnou@x.cat\nSense Correu', 'director', 'S', true);
  igual(d.map(r => [!!r.newMember, r.skip || '']), [[false, ''], [false, 'Falta el correu']], 'la direcció no va a la plantilla i necessita correu');
  const n = peoplePlan('Anna Puig — anna@x.cat\nNou Cantaire', 'singer', 'T', false);
  igual(n.map(r => [r.mail, !!r.newMember, !!r.mailIgnored]), [['', false, true], ['', true, false]], 'sense ser administració, només noms');
  S.staff = new Map();
});
prova('accountForMember i leadsOwn: la marca de cap de corda i el permís del compte van junts', () => {
  S.staff = new Map();
  const acc = { email: 'x@x.cat', name: 'Puig, Anna', roles: ['singer'], role: 'singer', memberId: 'a' };
  const m = { id: 'a', name: 'Puig, Anna', section: 'S', leader: true };
  const up = accountForMember(acc, m, { ...m, leader: false });
  igual([up.roles, up.role, up.section], [['leader', 'singer'], 'leader', 'S'], 'en fer-la cap de corda, té el permís');
  const down = accountForMember(up, { ...m, leader: false }, m);
  igual([down.roles, 'section' in down], [['singer'], false], 'i en treure-li, el perd');
  igual(accountForMember(acc, { ...m, leader: false }, { ...m, leader: false }), null, 'si no canvia res, no es desa res');
  igual(accountForMember(up, { ...m, section: 'C' }, m).section, 'C', 'si canvia de corda, porta la nova');
  igual(accountForMember(acc, { ...m, leader: false, name: 'Puig Ferrer, Anna' }, { ...m, leader: false }).name, 'Puig Ferrer, Anna', 'el nom segueix la fitxa');
  igual([leadsOwn(m, up), leadsOwn(m, acc), leadsOwn(m, null)], [true, false, true], 'amb compte mana el permís; sense, la fitxa');
});

/* ---------- Desar només el que canvia ---------- */
prova('changedFields: a les produccions i als Ajustos només es desa el que ha canviat', () => {
  const FV = { delete: () => '«esborra»', arrayUnion: (...x) => ({ afegeix: x }), arrayRemove: (...x) => ({ treu: x }) };
  const base = { id: 'p1', name: 'Dido', excluded: ['a', 'b'], roll: { S: 'x', T: 'y' }, sessions: [{ id: 's1', date: '2026-10-01' }], poster: 'p' };
  igual(changedFields(base, clone(base), FV), {}, 'sense canvis, res');
  igual(changedFields(base, { ...base, excluded: ['a', 'b', 'c'] }, FV), { excluded: { afegeix: ['c'] } }, 'algú més no la fa: només s’hi afegeix');
  igual(changedFields(base, { ...base, excluded: ['b'] }, FV), { excluded: { treu: ['a'] } }, 'algú la torna a fer: només se’n treu');
  igual(changedFields(base, { ...base, excluded: ['c', 'a'] }, FV), { excluded: ['c', 'a'] }, 'si s’afegeix i es treu alhora, la llista sencera');
  igual(changedFields(base, { ...base, roll: { S: 'x', T: 'z' } }, FV), { roll: { T: 'z' } }, 'dins d’un mapa, només el que canvia');
  igual(changedFields(base, { ...base, roll: { S: 'x' } }, FV), { roll: { T: '«esborra»' } }, 'i el que se’n treu s’esborra');
  const { poster, ...sense } = base;
  igual(changedFields(base, sense, FV), { poster: '«esborra»' }, 'un camp que ja no hi és');
  igual(changedFields(base, { ...base, sessions: [{ id: 's1', date: '2026-10-02' }] }, FV), { sessions: [{ id: 's1', date: '2026-10-02' }] }, 'les sessions, senceres');
  igual(changedFields({ a: 1 }, { a: 1, b: { c: 2 } }, FV), { b: { c: 2 } }, 'un mapa nou, sencer');
});

/* ---------- Bandes ---------- */
prova('parseBandes: una categoria per línia, les de parella, les d’una corda i el text enganxat d’un PDF', () => {
  escenari({});
  const txt = ['BANDES INDIVIDUALS', '- Cor Jove: les que millor representen el cor.', '- "Soprano": la millor soprano.',
    '- Contralt: la millor contralt (no ens enganyarem,', 'la majoria són mezzos).', '- Jove Promesa: arriba i ho peta.', 'Apunten maneres!!',
    'Sense descripció', 'Tres de cop [3]: una prova', '', 'BANDES DE PARELLA', '- Parella de l’any: la del Hola.', 'Solta [individual, T]: una de tenors'].join('\n');
  const c = parseBandes(txt, { win: 2 });
  igual(c.map(x => x.name), ['Cor Jove', '"Soprano"', 'Contralt', 'Jove Promesa', 'Sense descripció', 'Tres de cop', 'Parella de l’any', 'Solta'], 'noms');
  igual(c.map(x => [x.pair, x.sec, x.win]), [[false, '', 2], [false, 'S', 1], [false, 'C', 1], [false, '', 2], [false, '', 2], [false, '', 3], [true, '', 1], [false, 'T', 1]], 'tipus, corda i bandes');
  igual(c[2].desc, 'la millor contralt (no ens enganyarem, la majoria són mezzos).', 'la descripció continua a la línia de sota');
  igual(c[3].desc, 'arriba i ho peta. Apunten maneres!!', 'una frase curta després d’una descripció acabada també hi va');
  igual(parseBandes(bandesText({ cats: c, win: 2 }), { win: 2, old: c }), c, 'el text de les categories es torna a llegir igual, amb els mateixos ids');
  igual(parseBandes('A\nB\nC').map(x => x.name), ['A', 'B', 'C'], 'una llista de noms sols');
});
prova('bandesTally: el recompte, els vots que no valen, l’empat i el desempat', () => {
  escenari({ members: [{ id: 'a', name: 'Puig, Anna', section: 'S' }, { id: 'b', name: 'Ferrer, Laia', section: 'S' }, { id: 'c', name: 'Mas, Júlia', section: 'C' },
    { id: 'd', name: 'Bosch, Marc', section: 'T' }, { id: 'e', name: 'Font, Pere', section: 'B' }] });
  const p = { id: 'q', kind: 'bandes', picks: 2, sections: [], out: ['e'], cats: [{ id: 'k1', name: 'Cor', pair: false, sec: '', win: 2 },
    { id: 'k2', name: 'Soprano', pair: false, sec: 'S', win: 1 }, { id: 'k3', name: 'Parella', pair: true, sec: '', win: 1 }] };
  const v = (m, picks, at) => ({ pollId: 'q', memberId: m, picks, at });
  const votes = [
    v('a', { k1: ['b', 'c', 'd'], k2: ['b'], k3: ['c', 'd'] }, '2026-11-02T10:00:00Z'),   // la tercera persona ja no compta
    v('b', { k1: ['b', 'c'], k2: ['a'], k3: ['d', 'c'] }, '2026-11-02T11:00:00Z'),        // no es pot votar: només compta la c
    v('c', { k1: ['d', 'd'], k2: ['c'], k3: ['a'] }, '2026-11-04T09:00:00Z'),             // repetida; no és soprano; parella d'una
    v('d', { k1: ['e', 'a'], k2: ['b'] }, '2026-11-04T19:00:00Z'),                        // la e no hi participa
    v('e', { k1: ['a'] }), { pollId: 'altra', memberId: 'a', picks: { k1: ['d'] } }];
  const people = bandesPeople(p);
  igual(people.map(m => m.id).sort(), ['a', 'b', 'c', 'd'], 'qui hi participa');
  let t = bandesTally(p, votes, people);
  igual([t.voters, t.expected, t.filled], [4, 4, 9 / 4], 'participació i categories per papereta');
  igual(t.days, { '2026-11-02': 2, '2026-11-04': 2 }, 'paperetes per dia');
  const [k1, k2, k3] = t.cats;
  igual(k1.rows, [{ key: 'c', n: 2 }, { key: 'a', n: 1 }, { key: 'b', n: 1 }, { key: 'd', n: 1 }], 'recompte (els empatats, per nom)');
  igual([k1.winners, k1.tied, k1.open], [['c'], ['a', 'b', 'd'], 1], 'dues bandes: una de clara i un empat a tres per l’altra');
  igual([k2.rows, k2.winners, k2.ballots, k2.blank], [[{ key: 'b', n: 2 }, { key: 'a', n: 1 }], ['b'], 3, 1], 'la de sopranos');
  igual([k3.rows, k3.winners], [[{ key: 'c+d', n: 2 }], ['c+d']], 'la parella, en qualsevol ordre');
  igual(t.people.find(x => x.id === 'c'), { id: 'c', nominations: 2, votes: 4, wins: ['k1', 'k3'] }, 'qui ha rebut vots on');
  t = bandesTally({ ...p, ties: { k1: ['b'] } }, votes, people);
  igual([t.cats[0].winners, t.cats[0].open, !!t.cats[0].decided], [['c', 'b'], 0, true], 'el desempat de l’equip');
  t = bandesTally({ ...p, ties: { k1: ['a', 'b'] } }, votes, people);
  igual(t.cats[0].open, 1, 'un desempat que no tria just les que falten no val');
  igual(bandesBallot(p, { k1: ['b', 'c', 'd'], k2: ['c'], k3: ['a'] }, 'a'), { k1: ['b', 'c'] }, 'el que s’envia d’una papereta');
  igual(bandesWinners({ win: 2 }, [{ key: 'x', n: 3 }], null).winners, ['x'], 'menys gent votada que bandes');
});

/** Executa totes les proves: { ok, fail, lines }. */
function runProves() {
  const lines = [];
  let ok = 0, fail = 0;
  for (const p of PROVES) {
    try { p.fn(); ok++; lines.push(`✓ ${p.name}`); }
    catch (e) { fail++; lines.push(`✗ ${p.name}\n    ${e && e.message}`); }
  }
  lines.push(`${ok} proves bé, ${fail} malament`);
  return { ok, fail, lines };
}
