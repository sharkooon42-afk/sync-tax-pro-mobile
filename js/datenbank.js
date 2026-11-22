// Die Datenbank der App: öffnen, Stand prüfen, lesen. Der einzige Ort mit SQL (außer den Kennzahl-Abfragen im
// Lese-Vertrag). Gelesen wird nur, was im Lese-Vertrag steht (`lesevertrag.js`, erzeugt aus dem PC-Programm);
// ein Test prüft, dass hier keine andere Tabelle vorkommt. Geschrieben wird nie.
import { ABFRAGEN, TABELLEN, VERTRAG_NUMMER } from "./lesevertrag.js";

const KOPF = "SQLite format 3\u0000";

/** Ist das eine SQLite-Datei? (Die ersten 16 Bytes sind festgelegt.) */
export function istSqlite(bytes) {
  if (!bytes || bytes.length < 100) return false;
  for (let i = 0; i < KOPF.length; i++) if (bytes[i] !== KOPF.charCodeAt(i)) return false;
  return true;
}

/** Öffnet die Datenbank aus Bytes. `initSqlJs` kommt von außen (Browser: global, Test: require). */
export async function oeffnen(initSqlJs, bytes, locateFile) {
  if (!istSqlite(bytes)) throw new Error("Das ist keine Datenbank von Sync-Tax Pro (keine SQLite-Datei).");
  const SQL = await initSqlJs(locateFile ? { locateFile } : undefined);
  return new SQL.Database(bytes);
}

/** Alle Zeilen einer Abfrage als Objekte. Benannte Parameter (:name) werden nur gebunden, wenn sie im SQL stehen. */
export function alle(db, sql, parameter = {}) {
  const stmt = db.prepare(sql);
  try {
    const gebunden = {};
    for (const [, name] of sql.matchAll(/:(\w+)/g)) gebunden[":" + name] = parameter[name];
    if (Object.keys(gebunden).length) stmt.bind(gebunden);
    const zeilen = [];
    while (stmt.step()) zeilen.push(stmt.getAsObject());
    return zeilen;
  } finally {
    stmt.free();
  }
}

/** Stand der Datei: passt sie zu dieser App? -> { ok, grund, meldung, vertrag } */
export function pruefeStand(db) {
  const vertrag = Number(alle(db, "PRAGMA user_version")[0].user_version);
  if (vertrag === 0) {
    return { ok: false, grund: "programm_zu_alt", vertrag,
      meldung: "Diese Datenbank wurde noch nicht mit Sync-Tax Pro ab Version 0.151 geöffnet. Bitte das Programm am PC "
        + "aktualisieren, einmal starten und die Datei danach neu laden." };
  }
  if (vertrag > VERTRAG_NUMMER) {
    return { ok: false, grund: "app_zu_alt", vertrag,
      meldung: "Bitte App aktualisieren: Die Datenbank gehört zu einem neueren Sync-Tax Pro als diese App. "
        + "Mit Internet die Seite neu laden (oder die App neu öffnen)." };
  }
  for (const [tabelle, spalten] of Object.entries(TABELLEN)) {
    const vorhanden = new Set(alle(db, `PRAGMA table_info(${tabelle})`).map((z) => z.name));
    const fehlt = spalten.find((s) => !vorhanden.has(s));
    if (fehlt) {
      return { ok: false, grund: "aufbau", vertrag,
        meldung: `Die Datenbank hat nicht den erwarteten Aufbau (${tabelle}.${fehlt} fehlt). Bitte Programm und App auf `
          + "denselben Stand bringen." };
    }
  }
  return { ok: true, grund: "", meldung: "", vertrag };
}

/** Kennzahlen laut Lese-Vertrag für einen Zeitraum: { verdienst, noch_offen_betrag, … } */
export function kennzahlen(db, von, bis, heute) {
  const out = {};
  for (const [name, sql] of Object.entries(ABFRAGEN)) out[name] = alle(db, sql, { von, bis, heute })[0].wert;
  return out;
}

/** Termine ab einem Datum (ohne ausgeblendete), nach Datum und Zeit. */
export function termineAb(db, von) {
  return alle(db,
    "SELECT id, datum, zeit, projekt, studio, kategorie, umfang, beleg_status, zahlung_status, gage_ist, takes_soll, takes_ist "
    + "FROM appointments WHERE datum >= :von AND COALESCE(ausgeblendet, 0) = 0 ORDER BY datum, zeit, id", { von });
}

/** Ids der Termine, zu denen ein Dispo-Foto gehört. */
export function dispoTermine(db) {
  return new Set(alle(db, "SELECT DISTINCT termin_id FROM dispos WHERE status = 'aktiv' AND termin_id IS NOT NULL")
    .map((z) => z.termin_id));
}

/** Überweisungen, die noch keinem Termin zugeordnet sind (neueste zuerst). */
export function offeneUeberweisungen(db, grenze = 100) {
  return alle(db,
    "SELECT id, datum, absender, betrag, verwendungszweck FROM bank_transactions WHERE status = 'offen' "
    + "ORDER BY datum DESC, id DESC LIMIT :grenze", { grenze });
}

/** Ergebnis eines Zettels vom Handy (für M5): 'uebernommen' | 'abgelehnt' | 'fehler' | null. */
export function zettelErgebnis(db, zettelId) {
  const z = alle(db, "SELECT ergebnis FROM mobil_erledigt WHERE zettel_id = :zettelId", { zettelId })[0];
  return z ? z.ergebnis : null;
}
