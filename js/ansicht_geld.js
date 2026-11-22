// Ansicht „Geld“: vier Kacheln aus den Kennzahl-Abfragen des Lese-Vertrags und die noch nicht zugeordneten
// Überweisungen. Die App rechnet nichts selbst: Summen und Zählungen kommen als fertige SQL-Abfragen.
import { kennzahlen, offeneUeberweisungen } from "./datenbank.js";
import { h, leeren } from "./dom.js";
import { datumDe, euro, kuerzen } from "./format.js";

export function zeitraum(jahr) {
  return { von: `${jahr}-01-01`, bis: `${jahr}-12-31` };
}

export function kachel(text, wert, farbe) {
  return h("div", { klasse: "kachel" }, h("div", { klasse: "leise" }, text), h("div", { klasse: "zahl", style: `color: var(--${farbe})` }, wert));
}

export function zeige(wurzel, ctx) {
  const { db, heuteIso, zustand } = ctx;
  const aktuell = Number(heuteIso.slice(0, 4));
  const jahr = zustand.geldJahr || aktuell;
  const { von, bis } = zeitraum(jahr);
  const k = kennzahlen(db, von, bis, heuteIso);
  const ueberweisungen = offeneUeberweisungen(db);
  leeren(wurzel);
  wurzel.append(h("div", { klasse: "reiter" }, [aktuell, aktuell - 1].map((j) =>
    h("button", { klasse: j === jahr ? "an" : "", onClick: () => { zustand.geldJahr = j; zeige(wurzel, ctx); } }, String(j)))));
  wurzel.append(h("div", { klasse: "kacheln" },
    kachel("Verdienst", euro(k.verdienst), "teal"),
    kachel("Noch offen", euro(k.noch_offen_betrag), "amber"),
    kachel("Teilweise bezahlt", `${k.teilweise_anzahl} ${k.teilweise_anzahl === 1 ? "Termin" : "Termine"}`, "blue"),
    kachel("Fehlende Belege", String(k.fehlende_belege), "red")));
  wurzel.append(h("p", { klasse: "hinweis" },
    "„Noch offen“ zählt Termine mit Abrechnung, deren Zahlung noch ganz offen ist. Teilweise bezahlte stehen extra. "
    + "„Erhalten“ und „Ausstehend“ wie im Programm gibt es hier nicht: Das Programm bildet sie aus den Kontoauszügen."));
  wurzel.append(h("h2", { klasse: "abschnitt" }, `Noch nicht zugeordnete Überweisungen (${k.offene_ueberweisungen})`));
  if (!ueberweisungen.length) wurzel.append(h("p", { klasse: "leer" }, "Keine."));
  for (const u of ueberweisungen) {
    wurzel.append(h("div", { klasse: "karte ueberweisung" },
      h("div", { klasse: "zeile" }, h("span", { klasse: "titel" }, u.absender || "(ohne Absender)"), h("span", { klasse: "titel" }, euro(u.betrag))),
      h("div", { klasse: "leise" }, [datumDe(u.datum), kuerzen(u.verwendungszweck, 90)].filter(Boolean).join(" · "))));
  }
  if (k.offene_ueberweisungen > ueberweisungen.length) {
    wurzel.append(h("p", { klasse: "leer" }, `${k.offene_ueberweisungen - ueberweisungen.length} weitere nicht angezeigt.`));
  }
}
