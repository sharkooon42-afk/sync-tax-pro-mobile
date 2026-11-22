// Ansicht „Termine“. Nur ansehen. Fünf Darstellungen, der Nutzer wählt im Menü „Mehr“ (Entscheidung 22.11.2026; Standard 2):
//   1 Karten mit Datumsblock, Monats-Trenner   2 nach Tagen gruppiert, Uhrzeit vorn   3 kompakte Zeilen, Status als Punkt
//   4 Zeitstrahl                               5 ein Datumsblock je Tag, Wochen-Trenner
// In allen: „Heute“ hervorgehoben. Gleiche Daten, gleiche Reihenfolge, gleiche Etiketten; nur die Form ist anders.
import { dispoTermine, termineAb } from "./datenbank.js";
import { h, leeren } from "./dom.js";
import { datumBlock, kalenderwoche, monatJahr, tagKurz, tagWort, uhrzeitBeginn } from "./format.js";
import { statusVon } from "./status.js";

const REITER = [["anstehend", "Anstehend"], ["vergangen", "Vergangen"], ["alle", "Alle"]];
const MAX_KARTEN = 300;                       // mehr braucht auf dem Handy niemand auf einmal; der Rest steht im Hinweis
export const STANDARD = 2;
export const DARSTELLUNGEN = [
  [1, "Karten mit Monats-Trennern", "Datum links, Heute lila, Trenner je Monat"],
  [2, "Nach Tagen gruppiert", "„Heute“, „Morgen“ als Überschrift, Uhrzeit vorn"],
  [3, "Kompakte Zeilen", "die meisten Termine auf einen Blick, Status als Punkt"],
  [4, "Zeitstrahl", "Linie mit Punkten, heute leuchtet"],
  [5, "Ein Datum je Tag", "Termine eines Tages unter einem Datum, Wochen-Trenner"],
];

/** Gültige Nummer einer Darstellung (sonst der Standard). */
export function darstellungNr(wert) {
  const n = Number(wert);
  return DARSTELLUNGEN.some(([nr]) => nr === n) ? n : STANDARD;
}

/** Teilt die Termine für einen Reiter ein (anstehend: ab heute aufsteigend, sonst neueste zuerst). */
export function auswahl(termine, reiter, heuteIso) {
  if (reiter === "anstehend") return termine.filter((t) => t.datum >= heuteIso);
  const rueckwaerts = termine.slice().reverse();
  return reiter === "vergangen" ? rueckwaerts.filter((t) => t.datum < heuteIso) : rueckwaerts;
}

/** Aufeinanderfolgende Termine mit gleichem Schlüssel zusammenfassen: [{ schluessel, termine: [...] }]. */
export function gruppieren(liste, schluesselVon) {
  const gruppen = [];
  for (const t of liste) {
    const s = schluesselVon(t);
    if (gruppen.length && gruppen.at(-1).schluessel === s) gruppen.at(-1).termine.push(t);
    else gruppen.push({ schluessel: s, termine: [t] });
  }
  return gruppen;
}

/** Text der Tages-Überschrift: links „Heute“/„Morgen“/„Gestern“ oder das Datum, rechts das Datum bzw. die KW. */
export function tagKopf(datum, heuteIso) {
  const wort = tagWort(datum, heuteIso);
  const kw = kalenderwoche(datum);
  return { links: wort || tagKurz(datum), rechts: wort ? tagKurz(datum) : `KW ${kw.woche}` };
}

/** Text eines Wochen-Trenners: „Diese Woche · KW 47“, „KW 48“ (anderes Jahr: „KW 1 / 2027“). */
export function wochenText(datum, heuteIso) {
  const kw = kalenderwoche(datum);
  const jetzt = kalenderwoche(heuteIso);
  const name = kw.jahr === jetzt.jahr ? `KW ${kw.woche}` : `KW ${kw.woche} / ${kw.jahr}`;
  return kw.jahr === jetzt.jahr && kw.woche === jetzt.woche ? `Diese Woche · ${name}` : name;
}

// ---------------------------------------------------------------- Bausteine

function etiketten(t, heuteIso, hatDispo) {
  const status = statusVon(t, heuteIso);
  return h("div", { klasse: "etiketten" },
    h("span", { klasse: `etikett ${status.art}` }, status.text),
    t.kategorie ? h("span", { klasse: "etikett rolle" }, t.kategorie) : null,
    hatDispo ? h("span", { klasse: "etikett rolle" }, "Dispo da") : null);
}

function datumsblock(datum, heuteIso) {
  const b = datumBlock(datum);
  return h("div", { klasse: "datum" }, h("small", {}, datum === heuteIso ? "Heute" : b.wochentag), h("b", {}, b.tag), h("small", {}, b.monat));
}

const zeileText = (t) => [t.zeit, t.studio].filter(Boolean).join(" · ");
const trenner = (text) => h("div", { klasse: "trenner" }, text);

function kopf(datum, heuteIso) {
  const k = tagKopf(datum, heuteIso);
  return h("div", { klasse: datum === heuteIso ? "tagkopf heute" : "tagkopf" }, k.links, h("span", {}, k.rechts));
}

function kartenInhalt(t, heuteIso, dispo) {
  return [h("div", { klasse: "titel" }, t.projekt || "(ohne Projekt)"),
    zeileText(t) ? h("div", { klasse: "leise" }, zeileText(t)) : null,
    etiketten(t, heuteIso, dispo.has(t.id))];
}

/** Karte mit Datumsblock (Darstellung 1, auch für Tests von früher). */
export function karte(t, heuteIso, hatDispo) {
  return h("div", { klasse: t.datum === heuteIso ? "tag heute" : "tag", "data-termin": t.id }, datumsblock(t.datum, heuteIso),
    h("div", { klasse: "karte" }, kartenInhalt(t, heuteIso, hatDispo ? new Set([t.id]) : new Set())));
}

// ---------------------------------------------------------------- die fünf Darstellungen (liefern Elemente)

const ZEICHNER = {
  1(liste, heuteIso, dispo) {
    return gruppieren(liste, (t) => t.datum.slice(0, 7)).flatMap((g) =>
      [trenner(monatJahr(g.termine[0].datum)), ...g.termine.map((t) => karte(t, heuteIso, dispo.has(t.id)))]);
  },
  2(liste, heuteIso, dispo) {
    return gruppieren(liste, (t) => t.datum).flatMap((g) => [kopf(g.schluessel, heuteIso), ...g.termine.map((t) =>
      h("div", { klasse: t.datum === heuteIso ? "karte zeitkarte heute" : "karte zeitkarte", "data-termin": t.id },
        h("div", { klasse: "uhr" }, uhrzeitBeginn(t.zeit) || "–"),
        h("div", { klasse: "rest" }, h("div", { klasse: "titel" }, t.projekt || "(ohne Projekt)"),
          t.studio ? h("div", { klasse: "leise" }, t.studio) : null, etiketten(t, heuteIso, dispo.has(t.id)))))]);
  },
  3(liste, heuteIso, dispo) {
    return gruppieren(liste, (t) => t.datum).flatMap((g) => [kopf(g.schluessel, heuteIso), ...g.termine.map((t) => {
      const status = statusVon(t, heuteIso);
      return h("div", { klasse: "zeile-kompakt", "data-termin": t.id },
        h("div", { klasse: "uhr" }, uhrzeitBeginn(t.zeit) || "–"),
        h("div", { klasse: "mitte" }, h("b", {}, t.projekt || "(ohne Projekt)"),
          h("span", { klasse: "leise" }, [t.studio, t.kategorie].filter(Boolean).join(" · "))),
        dispo.has(t.id) ? h("span", { klasse: "mini" }, "Dispo") : null,
        h("span", { klasse: `punkt ${status.art}`, title: status.text, "aria-label": status.text }));
    })]);
  },
  4(liste, heuteIso, dispo) {
    const knoten = gruppieren(liste, (t) => t.datum).flatMap((g) => g.termine.map((t, i) =>
      h("div", { klasse: t.datum === heuteIso ? "knoten heute" : "knoten", "data-termin": t.id },
        i === 0 ? h("div", { klasse: "klein" }, tagWort(t.datum, heuteIso) || tagKurz(t.datum)) : null,
        h("div", { klasse: "karte" }, kartenInhalt(t, heuteIso, dispo)))));
    return [h("div", { klasse: "strahl" }, knoten)];
  },
  5(liste, heuteIso, dispo) {
    const wochen = gruppieren(liste, (t) => { const k = kalenderwoche(t.datum); return `${k.jahr}-${k.woche}`; });
    return wochen.flatMap((w) => [trenner(wochenText(w.termine[0].datum, heuteIso)),
      ...gruppieren(w.termine, (t) => t.datum).map((g) =>
        h("div", { klasse: g.schluessel === heuteIso ? "tag heute" : "tag" }, datumsblock(g.schluessel, heuteIso),
          h("div", { klasse: "stapel" }, g.termine.map((t) => h("div", { klasse: "karte", "data-termin": t.id }, kartenInhalt(t, heuteIso, dispo))))))]);
  },
};

/** Die Liste in einer Darstellung (Element mit Klasse `termine d<Nr>`). Auch für die Vorschau im Menü. */
export function liste(termine, darstellung, heuteIso, dispo = new Set()) {
  const nr = darstellungNr(darstellung);
  return h("div", { klasse: `termine d${nr}` }, ZEICHNER[nr](termine, heuteIso, dispo));
}

export function zeige(wurzel, ctx) {
  const { db, heuteIso, zustand } = ctx;
  const von = `${Number(heuteIso.slice(0, 4)) - 1}-01-01`;      // aktuelles Jahr und Vorjahr
  const termine = termineAb(db, von);
  const dispo = dispoTermine(db);
  const reiter = zustand.termineReiter || "anstehend";
  leeren(wurzel);
  wurzel.append(h("div", { klasse: "reiter" }, REITER.map(([schluessel, text]) =>
    h("button", { klasse: schluessel === reiter ? "an" : "", onClick: () => { zustand.termineReiter = schluessel; zeige(wurzel, ctx); } }, text))));
  const ausgewaehlt = auswahl(termine, reiter, heuteIso);
  if (!ausgewaehlt.length) {
    wurzel.append(h("p", { klasse: "leer" }, reiter === "anstehend" ? "Keine anstehenden Termine." : "Keine Termine."));
    return;
  }
  wurzel.append(liste(ausgewaehlt.slice(0, MAX_KARTEN), zustand.darstellung, heuteIso, dispo));
  if (ausgewaehlt.length > MAX_KARTEN) wurzel.append(h("p", { klasse: "leer" }, `${ausgewaehlt.length - MAX_KARTEN} weitere Termine nicht angezeigt.`));
}
