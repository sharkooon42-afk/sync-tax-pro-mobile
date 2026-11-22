// Ablage auf dem Handy (IndexedDB). Es liegen dort nur zwei Dinge, je höchstens einmal:
// - die zuletzt geladene Datenbank (Ablage „datei“), damit die App ohne Internet sofort etwas zeigt;
// - die Dropbox-Anmeldung (Ablage „anmeldung“, seit M4), damit man sich nicht bei jedem Öffnen neu anmeldet.
// „Von diesem Handy entfernen“ im Menü löscht beides.
// Dazu kleine Einstellungen der Anzeige (seit 0.3.0: Darstellung der Termine) in localStorage: je ein kurzer Wert, überschrieben,
// nie vermehrt; keine persönlichen Daten.
const DB_NAME = "sync-tax-pro-mobile";
const DB_VERSION = 2;                         // 1 = nur „datei“ (M3), 2 = dazu „anmeldung“ (M4)
const DATEI = "datei";
const ANMELDUNG = "anmeldung";
const SCHLUESSEL = "aktuell";

function oeffnenIdb(indexedDb) {
  return new Promise((ok, fehler) => {
    const anfrage = indexedDb.open(DB_NAME, DB_VERSION);
    anfrage.onupgradeneeded = () => {
      for (const ablage of [DATEI, ANMELDUNG]) {
        if (!anfrage.result.objectStoreNames.contains(ablage)) anfrage.result.createObjectStore(ablage);
      }
    };
    anfrage.onsuccess = () => ok(anfrage.result);
    anfrage.onerror = () => fehler(anfrage.error);
  });
}

function lauf(indexedDb, ablage, modus, aktion) {
  return oeffnenIdb(indexedDb).then((idb) => new Promise((ok, fehler) => {
    const tx = idb.transaction(ablage, modus);
    const ergebnis = aktion(tx.objectStore(ablage));
    tx.oncomplete = () => { idb.close(); ok(ergebnis.result); };
    tx.onerror = () => { idb.close(); fehler(tx.error); };
    tx.onabort = () => { idb.close(); fehler(tx.error); };
  }));
}

/** Speichert { bytes: Uint8Array, name, geaendert (ms der Datei), geladen (ms jetzt), rev (nur aus Dropbox) }. */
export function speichern(eintrag, indexedDb = globalThis.indexedDB) {
  return lauf(indexedDb, DATEI, "readwrite", (s) => s.put(eintrag, SCHLUESSEL));
}

/** Die gespeicherte Datei oder undefined. */
export function laden(indexedDb = globalThis.indexedDB) {
  return lauf(indexedDb, DATEI, "readonly", (s) => s.get(SCHLUESSEL));
}

export function entfernen(indexedDb = globalThis.indexedDB) {
  return lauf(indexedDb, DATEI, "readwrite", (s) => s.delete(SCHLUESSEL));
}

/** Dropbox-Anmeldung { erneuerung, konto, zugang, gueltigBis } bzw. während der Anmeldung { pruefwert, zustand }. */
export function anmeldungSpeichern(eintrag, indexedDb = globalThis.indexedDB) {
  return lauf(indexedDb, ANMELDUNG, "readwrite", (s) => s.put(eintrag, SCHLUESSEL));
}

export function anmeldungLaden(indexedDb = globalThis.indexedDB) {
  return lauf(indexedDb, ANMELDUNG, "readonly", (s) => s.get(SCHLUESSEL));
}

export function anmeldungEntfernen(indexedDb = globalThis.indexedDB) {
  return lauf(indexedDb, ANMELDUNG, "readwrite", (s) => s.delete(SCHLUESSEL));
}

const EINSTELLUNG = "sync-tax-pro-mobile.";

/** Einstellung der Anzeige oder null (ohne localStorage, z. B. gesperrt: null). */
export function einstellungLesen(name, ablage = globalThis.localStorage) {
  try {
    return ablage ? ablage.getItem(EINSTELLUNG + name) : null;
  } catch {
    return null;
  }
}

/** Speichert eine Einstellung der Anzeige (überschreibt; Fehler werden geschluckt: dann gilt sie nur bis zum Schließen). */
export function einstellungSetzen(name, wert, ablage = globalThis.localStorage) {
  try {
    if (ablage) ablage.setItem(EINSTELLUNG + name, String(wert));
  } catch { /* privater Modus o. Ä. */ }
}

/** Bittet den Browser, die Datei nicht von selbst zu löschen (kann abgelehnt werden; dann ist es nur ein Cache). */
export async function dauerhaft() {
  try {
    return (await globalThis.navigator?.storage?.persist?.()) === true;
  } catch {
    return false;
  }
}
