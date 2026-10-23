// A Tempo · 02c-fitxes-privades.js — Amb les llistes privades, la part de cada fitxa que només veuen l'equip i la persona (memberPriv).
// Els fitxers de js/ són scripts clàssics que comparteixen l'àmbit global i es carreguen en ordre (vegeu index.html).
'use strict';

/* ---------- Fitxes privades ---------- */
// La plantilla (members) la llegeix tothom de l'agrupació: hi ha de ser el nom, la corda i la veu de cadascú. Amb les llistes
// privades, el que la resta no ha de veure (el telèfon, les notes, les baixes i les altes amb el motiu) va a
// memberPriv/<membre>, que només llegeixen l'equip i la persona. Aquí es tornen a ajuntar.
const MEMBER_PRIV = ['phone', 'notes', 'leaves', 'history'];
const privMembers = () => !!S.config.attPrivate;
function splitMember(m) {
  const pub = { ...m }, priv = { memberId: m.id };
  for (const k of MEMBER_PRIV) {
    if (!(k in pub)) continue;
    const v = pub[k];
    if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) priv[k] = v;
    delete pub[k];
  }
  // De les baixes, a la part pública només hi van les dates (sense el motiu): vegeu leavesOf.
  const away = (m.leaves || []).filter(l => l && l.from).map(l => ({ from: l.from, ...(l.to ? { to: l.to } : {}) }));
  if (away.length) pub.away = away; else delete pub.away;
  return { pub, priv };
}
/** Cada fitxa amb la seva part privada (la de les fitxes que en tenen; les altres, tal com són). */
function mergePriv() {
  for (const [id, p] of S.memberPriv) {
    const m = S.members.get(id);
    if (!m) continue;
    const base = { ...m };
    for (const k of MEMBER_PRIV) delete base[k];
    const { memberId, syncAt, ...rest } = p;
    S.members.set(id, { ...base, ...rest });
  }
}
let privWatch = null;
/** Qui no és de l'equip només llegeix la seva part privada (les baixes compten a la seva assistència). */
function watchMyPriv() {
  if (privWatch || !db || !privMembers() || !S.memberId) return;
  privWatch = db.doc(`memberPriv/${S.memberId}`).onSnapshot(snap => {
    S.memberPriv = new Map(snap.exists ? [[snap.id, snap.data()]] : []);
    mergePriv();
    if (S.ready) scheduleRender();
  }, () => {});
}
function saveMember(m) {
  m = normPersonName(m);
  S.members.set(m.id, m);
  if (!privMembers()) { persist('members', m.id, m, 50); return; }
  const { pub, priv } = splitMember(m);
  S.memberPriv.set(m.id, priv);
  persist('members', m.id, pub, 50);
  persist('memberPriv', m.id, priv, 50);
}
/** En fer (o desfer) les llistes privades: les parts privades de totes les fitxes passen a memberPriv (o hi tornen). */
async function moveMemberPriv(toPriv) {
  const all = [...S.members.values()];
  for (let i = 0; i < all.length; i += 200) {
    const b = fs.batch();
    for (const m of all.slice(i, i + 200)) {
      if (toPriv) {
        const { pub, priv } = splitMember(m);
        b.set(db.doc(`memberPriv/${m.id}`), stamped(`memberPriv/${m.id}`, priv));
        b.set(db.doc(`members/${m.id}`), stamped(`members/${m.id}`, pub));
        S.memberPriv.set(m.id, priv);
      } else {
        b.set(db.doc(`members/${m.id}`), stamped(`members/${m.id}`, m));
        if (S.memberPriv.has(m.id)) b.delete(db.doc(`memberPriv/${m.id}`));
      }
    }
    await b.commit();
  }
  if (!toPriv && S.memberPriv.size) { S.memberPriv.clear(); bumpEpoch('memberPriv'); }
}
