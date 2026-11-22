// Sync-Tax Pro Mobile: Start, Datenbank holen (Dropbox oder Datei von Hand), Navigation. Nur ansehen: die App öffnet
// eine Datenbank-Datei (die Datenbank von Sync-Tax Pro) und zeigt Termine und Geld. Geschrieben wird nie.
import * as Geld from "./ansicht_geld.js";
import * as Platzhalter from "./ansicht_platzhalter.js";
import * as Termine from "./ansicht_termine.js";
import * as Cloud from "./cloud_dropbox.js";
import * as DB from "./datenbank.js";
import { demoDatenbank } from "./demo.js";
import { h, leeren } from "./dom.js";
import { iso, sekunden, zeitpunktKurz } from "./format.js";
import * as Speicher from "./speicher.js";
import { VERSION } from "./version.js";

const el = (id) => document.getElementById(id);
const locateFile = (name) => `lib/${name}`;
const TITEL = { termine: "Termine", geld: "Geld", eintragen: "Eintragen", dispo: "Dispo-Foto" };
const parameter = new URLSearchParams(location.search);

const zustand = {
  ansicht: Object.hasOwn(TITEL, parameter.get("ansicht")) ? parameter.get("ansicht") : "termine",   // ?ansicht=geld
  darstellung: Termine.darstellungNr(parameter.get("darstellung") || Speicher.einstellungLesen("termine_darstellung")),   // ?darstellung=3
};
let ctx = null;                               // { db, heuteIso, zustand } sobald eine passende Datenbank offen ist
let info = { quelle: "", stand: 0, ladezeit: 0, bytes: 0, rev: "", netz: 0 };
let aktuelleBytes = null;                     // Bytes der angezeigten Datei (für die Prüfsumme gegen zustand.json)
let anmeldung = null;                         // Dropbox-Anmeldung { erneuerung, … } oder null
let benutzerHatGewaehlt = false;              // hat der Nutzer schon etwas getan, darf der automatische Start nichts mehr überschreiben

function heute() {
  const gesetzt = parameter.get("heute");      // nur für Tests und Bilder: ?heute=2026-11-22
  return /^\d{4}-\d{2}-\d{2}$/.test(gesetzt || "") ? new Date(`${gesetzt}T12:00:00`) : new Date();
}

function meldung(text) {
  const kasten = el("meldung");
  kasten.textContent = text || "";
  kasten.hidden = !text;
}

function startBildschirm(text) {
  ctx = null;
  el("stand").textContent = "";
  leeren(el("inhalt"));
  el("leiste").hidden = true;
  el("menue-knopf").hidden = false;                       // ohne Leiste: Menü über ⋯ oben
  meldung(text);
  const mitDropbox = Boolean(Cloud.APP_KEY);
  el("inhalt").append(h("div", { klasse: "karte" },
    h("div", { klasse: "titel" }, "Datenbank wählen"),
    h("p", { klasse: "leise" }, mitDropbox
      ? "Verbinde die App mit deiner Dropbox: Sie holt dann die Datenbank von Sync-Tax Pro aus ihrem App-Ordner, "
        + "und zwar nur, wenn sie sich geändert hat. Oder wähle die Datei „sync_tax.db“ von Hand. "
        + "Die App liest nur und ändert nichts. Sie merkt sich die Datei, damit sie auch ohne Internet funktioniert."
      : "Wähle die Datei „sync_tax.db“ aus dem Datenordner von Sync-Tax Pro (z. B. in deiner Cloud). "
        + "Die App liest sie nur und ändert nichts daran. Sie merkt sich die Datei, damit sie danach auch ohne Internet funktioniert."),
    anmeldung
      ? h("button", { klasse: "knopf", onClick: () => dropboxAbgleich(false) }, "Aus Dropbox laden")
      : mitDropbox && h("button", { klasse: "knopf", onClick: verbinden }, "Mit Dropbox verbinden …"),
    h("button", { klasse: mitDropbox ? "knopf zweit" : "knopf", onClick: () => el("datei").click() }, "Datei wählen …"),
    h("button", { klasse: "knopf zweit", onClick: beispiel }, "Beispieldaten ansehen")));
}

function standText() {
  if (!info.stand) return info.quelle || "";
  return `Stand: ${zeitpunktKurz(info.stand)}${info.rev ? " · Dropbox" : ""}`;
}

function render() {
  if (!ctx) return;
  el("leiste").hidden = false;
  el("menue-knopf").hidden = true;                        // mit Leiste: Menü über „Mehr“ unten
  el("titel").textContent = TITEL[zustand.ansicht];
  el("stand").textContent = standText();
  for (const knopf of document.querySelectorAll("#leiste button[data-ansicht]")) {
    knopf.classList.toggle("an", knopf.dataset.ansicht === zustand.ansicht);
  }
  const wurzel = el("inhalt");
  if (zustand.ansicht === "termine") Termine.zeige(wurzel, ctx);
  else if (zustand.ansicht === "geld") Geld.zeige(wurzel, ctx);
  else Platzhalter.zeige(wurzel, ctx, zustand.ansicht);
  wurzel.scrollTop = 0;
}

function anzeigen(db, neueInfo) {
  const stand = DB.pruefeStand(db);
  if (!stand.ok) {
    startBildschirm(stand.meldung);
    return false;
  }
  meldung("");
  info = neueInfo;
  ctx = { db, heuteIso: iso(heute()), zustand };
  render();
  return true;
}

async function sqlModul() {
  if (typeof initSqlJs !== "function") throw new Error("Die Datenbank-Bibliothek konnte nicht geladen werden.");
  return initSqlJs;
}

/** Öffnet und zeigt eine Datenbank. `extra`: { rev } bei Dropbox, { netz } = Dauer des Herunterladens in ms. */
async function ausBytes(bytes, quelle, stand, speichern, extra = {}) {
  const t0 = performance.now();
  try {
    const db = await DB.oeffnen(await sqlModul(), bytes, locateFile);
    const ok = anzeigen(db, { quelle, stand, ladezeit: performance.now() - t0, bytes: bytes.length, rev: extra.rev || "", netz: extra.netz || 0 });
    if (!ok) return false;
    aktuelleBytes = bytes;
    if (speichern) {
      await Speicher.speichern({ bytes, name: quelle, geaendert: stand, geladen: Date.now(), rev: extra.rev || "" });
      Speicher.dauerhaft();
    }
    return true;
  } catch (fehler) {
    startBildschirm(fehler.message || String(fehler));
    return false;
  }
}

async function dateiGewaehlt(ereignis) {
  benutzerHatGewaehlt = true;
  const datei = ereignis.target.files[0];
  ereignis.target.value = "";
  if (!datei) return;
  await ausBytes(new Uint8Array(await datei.arrayBuffer()), datei.name, datei.lastModified, true);
}

async function beispiel() {
  benutzerHatGewaehlt = true;
  menueZu();
  try {
    const t0 = performance.now();
    const db = await demoDatenbank(await sqlModul(), locateFile, heute());
    aktuelleBytes = null;
    anzeigen(db, { quelle: "Beispieldaten (erfunden)", stand: 0, ladezeit: performance.now() - t0, bytes: 0, rev: "", netz: 0 });
  } catch (fehler) {
    startBildschirm(fehler.message || String(fehler));
  }
}

// ------------------------------------------------------------------ Dropbox

/** Schritt 1 der Anmeldung: Prüfwert merken, dann zu Dropbox. Dropbox leitet danach auf index.html?code=… zurück. */
async function verbinden() {
  menueZu();
  try {
    const rueckkehr = Cloud.rueckkehrAdresse(location.href);
    const a = await Cloud.anmeldeAdresse({ rueckkehr });
    await Speicher.anmeldungSpeichern({ pruefwert: a.pruefwert, zustand: a.zustand, rueckkehr });
    location.assign(a.adresse);
  } catch (fehler) {
    meldung(fehler.message || String(fehler));
  }
}

/** Schritt 2: Rückkehr von Dropbox verarbeiten. Ergebnis: Text für die Meldung ("" = alles gut oder keine Rückkehr). */
async function rueckkehrVerarbeiten() {
  const r = Cloud.rueckkehrLesen(location.href);
  if (!r) return "";
  history.replaceState(null, "", Cloud.rueckkehrAdresse(location.href));       // Code nicht in der Adresse stehen lassen
  const offen = await Speicher.anmeldungLaden();
  const halb = offen && !offen.erneuerung;
  if (r.fehler) {
    if (halb) await Speicher.anmeldungEntfernen();
    return r.fehler;
  }
  if (!halb || offen.zustand !== r.zustand) {
    return "Die Rückkehr von Dropbox passt nicht zu einer begonnenen Anmeldung. Bitte noch einmal „Mit Dropbox verbinden“.";
  }
  try {
    const fertig = await Cloud.anmeldungAbschliessen({ code: r.code, pruefwert: offen.pruefwert, rueckkehr: offen.rueckkehr });
    await Speicher.anmeldungSpeichern(fertig);
    return "";
  } catch (fehler) {
    await Speicher.anmeldungEntfernen();
    return fehler.message || String(fehler);
  }
}

/** Sieht in Dropbox nach und lädt die Datenbank nur, wenn sie neu ist. `automatisch` = beim Start (dann gewinnt,
 *  was der Nutzer inzwischen selbst gewählt hat). */
async function dropboxAbgleich(automatisch) {
  if (!anmeldung) return;
  menueZu();
  if (!automatisch) benutzerHatGewaehlt = false;
  const vorher = el("stand").textContent;
  el("stand").textContent = "Dropbox …";
  const t0 = performance.now();
  try {
    const e = await Cloud.abgleichen(anmeldung, ctx ? info.rev : "", aktuelleBytes);
    await Speicher.anmeldungSpeichern(anmeldung);                               // Zugang ist vielleicht erneuert
    if (automatisch && benutzerHatGewaehlt) return;
    if (e.neu) {
      const ok = await ausBytes(e.bytes, "sync_tax.db (Dropbox)", e.geaendert, true, { rev: e.rev, netz: performance.now() - t0 });
      if (!ok) return;
    } else {
      el("stand").textContent = vorher || standText();
    }
    meldung(e.hinweis || (automatisch ? "" : "Keine neuere Fassung in Dropbox."));
  } catch (fehler) {
    el("stand").textContent = vorher;
    if (fehler.grund === "abgemeldet") {
      anmeldung = null;
      await Speicher.anmeldungEntfernen();
    }
    const text = fehler.grund === "offline" && ctx ? "Ohne Internet: du siehst den zuletzt geladenen Stand." : (fehler.message || String(fehler));
    if (ctx) meldung(text);
    else startBildschirm(text);
  }
}

async function trennen() {
  menueZu();
  const alt = anmeldung;
  anmeldung = null;
  await Speicher.anmeldungEntfernen();
  const bestaetigt = alt ? await Cloud.abmelden(alt) : false;
  meldung(bestaetigt
    ? "Dropbox ist getrennt. Die zuletzt geladene Datei bleibt auf dem Handy, bis du sie entfernst."
    : "Dropbox ist auf diesem Handy getrennt. Dropbox selbst hat es nicht bestätigt (kein Internet?): "
      + "Entferne die App bei Bedarf in den Dropbox-Einstellungen unter „Verbundene Apps“.");
}

// ------------------------------------------------------------------ Menü

async function vergessen() {
  benutzerHatGewaehlt = true;
  menueZu();
  await Speicher.entfernen();
  aktuelleBytes = null;
  if (anmeldung) {
    const alt = anmeldung;
    anmeldung = null;
    await Speicher.anmeldungEntfernen();
    await Cloud.abmelden(alt);
  }
  startBildschirm("Die gespeicherte Datei wurde von diesem Handy entfernt.");
}

function menueZu() { el("menue").hidden = true; }

function menueAuf() {
  const kasten = el("menue-inhalt");
  leeren(kasten);
  const punkt = (text, aktion) => h("button", { klasse: "menuepunkt", onClick: aktion }, text);
  kasten.append(
    anmeldung && punkt("Aus Dropbox aktualisieren", () => dropboxAbgleich(false)),
    !anmeldung && Cloud.APP_KEY && punkt("Mit Dropbox verbinden …", verbinden),
    ctx && punkt("Darstellung der Termine …", darstellungWaehlen),
    punkt("Andere Datei wählen …", () => { menueZu(); el("datei").click(); }),
    punkt("Beispieldaten ansehen", beispiel),
    anmeldung && punkt("Dropbox trennen", trennen),
    punkt(anmeldung ? "Gespeicherte Datei und Dropbox-Anmeldung von diesem Handy entfernen" : "Gespeicherte Datei von diesem Handy entfernen", vergessen),
    h("p", { klasse: "leise klein" },
      [`App ${VERSION}`, anmeldung ? "mit Dropbox verbunden" : "", info.quelle ? `Datei: ${info.quelle}` : "",
       info.netz ? `aus Dropbox geholt in ${sekunden(info.netz)}` : "",
       info.ladezeit ? `Geladen in ${sekunden(info.ladezeit)}${info.bytes ? ` (${(info.bytes / 1048576).toFixed(1).replace(".", ",")} MB)` : ""}` : ""]
        .filter(Boolean).join(" · ")));
  el("menue").hidden = false;
}

/** Menü-Seite „Darstellung der Termine“: die fünf Darstellungen mit echter, verkleinerter Vorschau (erfundene Termine). */
function darstellungWaehlen() {
  const kasten = el("menue-inhalt");
  leeren(kasten);
  const heuteIso = iso(heute());
  const morgen = iso(new Date(heute().getFullYear(), heute().getMonth(), heute().getDate() + 1, 12));
  const beispiel = [
    { id: -1, datum: heuteIso, zeit: "18:00", projekt: "Beispiel Hörbuch", studio: "Studio West", kategorie: "Rolle", beleg_status: "vorhanden" },
    { id: -2, datum: morgen, zeit: "10:00", projekt: "Beispiel Serie", studio: "Studio Nord", kategorie: "Rolle" },
    { id: -3, datum: morgen, zeit: "15:00", projekt: "Beispiel Film", studio: "Studio Süd", kategorie: "Ensemble" },
  ];
  kasten.append(h("div", { klasse: "titel" }, "Darstellung der Termine"),
    h("p", { klasse: "leise" }, "Gilt nur auf diesem Handy. Die Daten bleiben dieselben, nur die Form ändert sich."),
    ...Termine.DARSTELLUNGEN.map(([nr, name, text]) => h("button", {
      klasse: nr === zustand.darstellung ? "darstellung an" : "darstellung",
      onClick: () => {
        zustand.darstellung = nr;
        Speicher.einstellungSetzen("termine_darstellung", nr);
        zustand.ansicht = "termine";
        menueZu();
        render();
      },
    }, h("div", { klasse: "vorschau" }, Termine.liste(beispiel, nr, heuteIso)),
      h("div", {}, h("b", {}, `${nr} ${name}`), nr === Termine.STANDARD ? " (Standard)" : "", h("div", { klasse: "leise" }, text)))),
    h("button", { klasse: "menuepunkt", onClick: menueAuf }, "‹ Zurück"));
}

function start() {
  el("datei").addEventListener("change", dateiGewaehlt);
  el("menue-knopf").addEventListener("click", menueAuf);
  el("mehr-knopf").addEventListener("click", menueAuf);
  el("menue").addEventListener("click", (e) => { if (e.target === el("menue")) menueZu(); });
  for (const knopf of document.querySelectorAll("#leiste button[data-ansicht]")) {
    knopf.addEventListener("click", () => { zustand.ansicht = knopf.dataset.ansicht; render(); });
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});   // ohne: nur nicht offline
  (async () => {
    if (parameter.get("demo") === "1") return beispiel();
    let text = "";
    try {
      text = await rueckkehrVerarbeiten();
      const a = await Speicher.anmeldungLaden();
      anmeldung = a && a.erneuerung ? a : null;
    } catch { /* kein Speicher verfügbar: dann ohne Dropbox */ }
    try {
      const gespeichert = await Speicher.laden();
      if (benutzerHatGewaehlt) return;
      if (gespeichert) await ausBytes(gespeichert.bytes, gespeichert.name, gespeichert.geaendert, false, { rev: gespeichert.rev });
    } catch { /* kein Speicher verfügbar: dann eben Dateiauswahl */ }
    if (benutzerHatGewaehlt) return;
    if (!ctx) startBildschirm(text || (anmeldung ? "Hole die Datenbank aus Dropbox …" : ""));
    else if (text) meldung(text);
    if (anmeldung) dropboxAbgleich(true);
  })();
}

start();
