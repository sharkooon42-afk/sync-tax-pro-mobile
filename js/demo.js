// Erfundene Beispieldaten, damit man die App ohne eigene Datenbank ausprobieren kann. Die Tabellen entstehen aus dem
// Lese-Vertrag (genau die Spalten, die die App liest), die Termine liegen relativ zu heute.
import { TABELLEN, VERTRAG_NUMMER } from "./lesevertrag.js";
import { iso } from "./format.js";

function tagePlus(heute, n) {
  const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + n, 12);
  return iso(d);
}

export async function demoDatenbank(initSqlJs, locateFile, heute = new Date()) {
  const SQL = await initSqlJs(locateFile ? { locateFile } : undefined);
  const db = new SQL.Database();
  for (const [tabelle, spalten] of Object.entries(TABELLEN)) db.run(`CREATE TABLE ${tabelle} (${spalten.join(", ")})`);
  db.run(`PRAGMA user_version = ${VERTRAG_NUMMER}`);
  const termin = (id, tage, zeit, projekt, studio, kategorie, beleg, zahlung, gage, versteckt = 0) => db.run(
    "INSERT INTO appointments (id, datum, zeit, projekt, studio, kategorie, umfang, beleg_status, zahlung_status, gage_ist, "
    + "takes_soll, takes_ist, ausgeblendet) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, NULL, NULL, ?)",
    [id, tagePlus(heute, tage), zeit, projekt, studio, kategorie, beleg, zahlung, gage, versteckt]);
  termin(1, 1, "10:00 - 12:30", "Beispiel Serie S2E4", "Studio Nord", "Rolle", "fehlt", "offen", 0);
  termin(2, 1, "15:00", "Beispiel Film", "Studio Süd", "Ensemble", "fehlt", "offen", 0);
  termin(3, 4, "09:30", "Beispiel Doku Folge 7", "Studio Nord", "Rolle", "fehlt", "offen", 0);
  termin(4, 9, "11:00", "Beispiel Serie S2E5", "Studio Ost", "Rolle", "fehlt", "offen", 0);
  termin(5, -5, "14:00", "Beispiel Hörspiel", "Studio Nord", "Rolle", "vorhanden", "offen", 320.5);
  termin(6, -12, "16:30", "Beispiel Werbung", "Studio Süd", "Rolle", "vorhanden", "bezahlt", 180);
  termin(7, -20, "10:00", "Beispiel Serie S2E3", "Studio Ost", "Rolle", "vorhanden", "teilweise", 240);
  termin(8, -30, "13:00", "Beispiel Film 2", "Studio Süd", "Ensemble", "fehlt", "offen", 0);
  termin(9, -40, "09:00", "Beispiel Doku Folge 6", "Studio Nord", "Rolle", "vorhanden", "offen", 410);
  termin(10, -3, "12:00", "Beispiel (ausgeblendet)", "Studio Nord", "Rolle", "fehlt", "offen", 0, 1);
  for (const [name, adresse] of [["Studio Nord", "Musterweg 1, Beispielstadt"], ["Studio Süd", "Testallee 2, Beispielstadt"],
                                 ["Studio Ost", "Probeplatz 3, Beispielstadt"]]) {
    db.run("INSERT INTO studios (name, adresse, fahrzeit_min) VALUES (?, ?, 20)", [name, adresse]);
  }
  db.run("INSERT INTO documents (id, betrag, absender, appointment_id) VALUES (1, 320.5, 'Beispiel Büro', 5), (2, 410, 'Beispiel Büro', 9)");
  db.run("INSERT INTO bank_transactions (id, datum, absender, betrag, verwendungszweck, status) VALUES "
    + `(1, '${tagePlus(heute, -8)}', 'Beispiel Büro', 240, 'Honorar Beispiel Serie S2E3 Teil 1', 'offen'), `
    + `(2, '${tagePlus(heute, -6)}', 'Muster Studio GmbH', 96.5, 'Gutschrift 4711', 'offen'), `
    + `(3, '${tagePlus(heute, -12)}', 'Beispiel Büro', 180, 'Honorar Beispiel Werbung', 'zugeordnet')`);
  db.run("INSERT INTO dispos (termin_id, status) VALUES (3, 'aktiv')");
  return db;
}
