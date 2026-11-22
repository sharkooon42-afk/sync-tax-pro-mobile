// Dropbox für Sync-Tax Pro Mobile (Stufe M4): anmelden ohne Server (OAuth mit PKCE), die Datenbank nur laden, wenn sie
// sich geändert hat, und `zustand.json` lesen („PC hat offen“). Die App sieht nur ihren eigenen App-Ordner in Dropbox
// (Apps/<Name der Dropbox-App>/); dort liegt der Datenordner von Sync-Tax Pro.
//
// Regeln:
// - In M4 nur lesen: die Anmeldung fragt nur Leserechte an (SCOPES). Schreiben (Zettel, Fotos) kommt mit M5.
// - Der App-Schlüssel (APP_KEY) ist bei PKCE kein Geheimnis und darf öffentlich in der App stehen. Den zweiten
//   Schlüssel der Dropbox-App (den geheimen) gibt es hier nie.
// - Netz austauschbar: jede Funktion bekommt `netz` (fetch) als Parameter, Tests setzen eine Attrappe ein.
// - Kein Abfragen im Takt: Dropbox wird nur beim Start und bei „Aktualisieren“ gefragt.
export const APP_KEY = "68hfy1g4dladkfu";                                  // von der Dropbox-App des Nutzers (Reiter Settings, „App key“)
export const SCOPES = "files.metadata.read files.content.read";
export const DB_PFAD = "/sync_tax.db";                       // im App-Ordner; der Datenordner liegt dort direkt
export const ZUSTAND_PFAD = "/zustand.json";
export const ALT_AB_S = 120 * 3;                             // wie syncpro/datenordner/zustand.py: 3 verpasste Lebenszeichen

const AUTORISIEREN = "https://www.dropbox.com/oauth2/authorize";
const TOKEN = "https://api.dropboxapi.com/oauth2/token";
const METADATEN = "https://api.dropboxapi.com/2/files/get_metadata";
const HERUNTERLADEN = "https://content.dropboxapi.com/2/files/download";
const ABMELDEN = "https://api.dropboxapi.com/2/auth/token/revoke";
const PUFFER_S = 60;                                        // Zugang so viele Sekunden vor Ablauf erneuern

export class CloudFehler extends Error {
  constructor(meldung, grund) { super(meldung); this.grund = grund; }
}

// ------------------------------------------------------------------ PKCE

function base64url(bytes) {
  let text = "";
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Zufälliger Prüfwert (43 Zeichen, RFC 7636). */
export function neuerPruefwert(krypto = globalThis.crypto) {
  return base64url(krypto.getRandomValues(new Uint8Array(32)));
}

/** S256-Ableitung des Prüfwerts, die an Dropbox geht. */
export async function ableitung(pruefwert, krypto = globalThis.crypto) {
  const summe = await krypto.subtle.digest("SHA-256", new TextEncoder().encode(pruefwert));
  return base64url(new Uint8Array(summe));
}

/** Adresse, auf die Dropbox nach der Anmeldung zurückleitet: immer index.html im Ordner der App, ohne Zusätze.
 *  Genau diese Adresse muss in der Dropbox-App unter „Redirect URIs“ stehen. */
export function rueckkehrAdresse(adresse) {
  return new URL("index.html", adresse).href;
}

/** Baut die Anmeldeseite von Dropbox. `merken` bekommt { pruefwert, zustand }, damit die Rückkehr sie wiederfindet. */
export async function anmeldeAdresse({ appKey = APP_KEY, rueckkehr, krypto = globalThis.crypto }) {
  if (!appKey) throw new CloudFehler("Die App ist noch nicht mit einer Dropbox-App verbunden (App-Schlüssel fehlt).", "kein_schluessel");
  const pruefwert = neuerPruefwert(krypto);
  const zustand = neuerPruefwert(krypto).slice(0, 16);
  const p = new URLSearchParams({
    client_id: appKey, response_type: "code", redirect_uri: rueckkehr, state: zustand,
    code_challenge: await ableitung(pruefwert, krypto), code_challenge_method: "S256",
    token_access_type: "offline", scope: SCOPES,
  });
  return { adresse: `${AUTORISIEREN}?${p}`, pruefwert, zustand };
}

/** Liest die Rückkehr von Dropbox aus der Adresse: { code, zustand } oder { fehler } oder null (keine Rückkehr). */
export function rueckkehrLesen(adresse) {
  const p = new URL(adresse).searchParams;
  if (p.get("error")) {
    return { fehler: p.get("error") === "access_denied" ? "Die Anmeldung wurde bei Dropbox abgebrochen." : `Dropbox meldet: ${p.get("error")}` };
  }
  if (!p.get("code")) return null;
  return { code: p.get("code"), zustand: p.get("state") || "" };
}

async function tokenAnfrage(netz, felder) {
  let antwort;
  try {
    antwort = await netz(TOKEN, { method: "POST", body: new URLSearchParams(felder) });   // Formular: keine Vorab-Anfrage (CORS)
  } catch {
    throw new CloudFehler("Keine Verbindung zu Dropbox.", "offline");
  }
  const daten = await antwort.json().catch(() => ({}));
  if (!antwort.ok) {
    if (daten.error === "invalid_grant") throw new CloudFehler("Die Dropbox-Anmeldung gilt nicht mehr. Bitte neu verbinden.", "abgemeldet");
    throw new CloudFehler(`Dropbox lehnt die Anmeldung ab (${daten.error || antwort.status}).`, "abgelehnt");
  }
  return daten;
}

/** Tauscht den Code aus der Rückkehr gegen die Anmeldung. Ergebnis zum Speichern: { erneuerung, konto, zugang, gueltigBis }. */
export async function anmeldungAbschliessen({ code, pruefwert, rueckkehr, appKey = APP_KEY, netz = globalThis.fetch, jetzt = Date.now() }) {
  const d = await tokenAnfrage(netz, {
    code, grant_type: "authorization_code", code_verifier: pruefwert, client_id: appKey, redirect_uri: rueckkehr,
  });
  if (!d.refresh_token) throw new CloudFehler("Dropbox hat keine dauerhafte Anmeldung geliefert.", "abgelehnt");
  return { erneuerung: d.refresh_token, konto: d.account_id || "", zugang: d.access_token, gueltigBis: jetzt + (d.expires_in || 0) * 1000 };
}

/** Gültiger Zugang; erneuert ihn bei Bedarf. Verändert `anmeldung` (zugang, gueltigBis) – danach speichern. */
export async function zugang(anmeldung, { appKey = APP_KEY, netz = globalThis.fetch, jetzt = Date.now() } = {}) {
  if (anmeldung.zugang && anmeldung.gueltigBis - PUFFER_S * 1000 > jetzt) return anmeldung.zugang;
  const d = await tokenAnfrage(netz, { grant_type: "refresh_token", refresh_token: anmeldung.erneuerung, client_id: appKey });
  anmeldung.zugang = d.access_token;
  anmeldung.gueltigBis = jetzt + (d.expires_in || 0) * 1000;
  return anmeldung.zugang;
}

/** Meldet die Anmeldung bei Dropbox ab (best effort: ohne Netz bleibt sie bei Dropbox bestehen, bis man die App
 *  in den Dropbox-Einstellungen unter „Verbundene Apps“ entfernt). Ergebnis: true, wenn Dropbox es bestätigt hat. */
export async function abmelden(anmeldung, { appKey = APP_KEY, netz = globalThis.fetch, jetzt = Date.now() } = {}) {
  try {
    const token = await zugang(anmeldung, { appKey, netz, jetzt });
    const antwort = await netz(ABMELDEN, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    return antwort.ok;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ Dateien

/** Dropbox verlangt im Kopf `Dropbox-API-Arg` reines ASCII: alles darüber als \uXXXX. */
export function kopfJson(wert) {
  return JSON.stringify(wert).replace(/[\u007f-￿]/g, (z) => `\\u${z.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

async function aufruf(netz, url, optionen, wasFehlt) {
  let antwort;
  try {
    antwort = await netz(url, optionen);
  } catch {
    throw new CloudFehler("Keine Verbindung zu Dropbox.", "offline");
  }
  if (antwort.ok) return antwort;
  const text = await antwort.text().catch(() => "");
  if (antwort.status === 401) throw new CloudFehler("Die Dropbox-Anmeldung gilt nicht mehr. Bitte neu verbinden.", "abgemeldet");
  if (antwort.status === 409 && text.includes("not_found")) throw new CloudFehler(wasFehlt, "fehlt");
  if (antwort.status === 429) throw new CloudFehler("Dropbox bittet um eine Pause. Bitte gleich noch einmal versuchen.", "pause");
  throw new CloudFehler(`Dropbox antwortet mit Fehler ${antwort.status}.`, "dropbox");
}

const FEHLT_DB = "In deinem Dropbox-App-Ordner liegt keine Datei „sync_tax.db“. Ist der Datenordner von Sync-Tax Pro schon dorthin umgezogen?";

/** Kennung der aktuellen Fassung der Datenbank in Dropbox: { rev, groesse, geaendert }. */
export async function stand(token, { netz = globalThis.fetch, pfad = DB_PFAD } = {}) {
  const antwort = await aufruf(netz, METADATEN, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path: pfad }),
  }, FEHLT_DB);
  const m = await antwort.json();
  if (m[".tag"] !== "file") throw new CloudFehler(FEHLT_DB, "fehlt");
  return { rev: m.rev, groesse: m.size, geaendert: Date.parse(m.server_modified) || 0 };
}

/** Lädt eine Datei; mit `rev` genau diese Fassung (dann passen Kennung und Inhalt sicher zusammen). */
export async function herunterladen(token, { netz = globalThis.fetch, pfad = DB_PFAD, rev = "", wasFehlt = FEHLT_DB } = {}) {
  const antwort = await aufruf(netz, HERUNTERLADEN, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Dropbox-API-Arg": kopfJson({ path: rev ? `rev:${rev}` : pfad }) },
  }, wasFehlt);
  return new Uint8Array(await antwort.arrayBuffer());
}

/** Sieht nach, ob es eine neuere Datenbank gibt, und lädt sie nur dann.
 *  Ergebnis: { neu: false, rev } oder { neu: true, rev, bytes, geaendert }. */
export async function datenbankHolen(token, bekannteRev, { netz = globalThis.fetch } = {}) {
  const s = await stand(token, { netz });
  if (bekannteRev && s.rev === bekannteRev) return { neu: false, rev: s.rev };
  const bytes = await herunterladen(token, { netz, rev: s.rev });
  return { neu: true, rev: s.rev, bytes, geaendert: s.geaendert };
}

/** Inhalt von zustand.json; fehlt die Datei oder ist sie unlesbar: {} (wie zustand.lesen im Programm). */
export async function zustandHolen(token, { netz = globalThis.fetch } = {}) {
  try {
    const bytes = await herunterladen(token, { netz, pfad: ZUSTAND_PFAD, wasFehlt: "" });
    const daten = JSON.parse(new TextDecoder().decode(bytes).replace(/^﻿/, ""));
    return daten && typeof daten === "object" && !Array.isArray(daten) ? daten : {};
  } catch (fehler) {
    if (fehler instanceof CloudFehler && fehler.grund !== "fehlt") throw fehler;
    return {};
  }
}

async function sha256hex(bytes, krypto) {
  const summe = new Uint8Array(await krypto.subtle.digest("SHA-256", bytes));
  return [...summe].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hinweis für die App aus zustand.json, Regeln wie `zustand.pruefen` im Programm:
 *  offen → „ist offen“ (oder „vermutlich nicht mehr offen“ nach ALT_AB_S); sonst Datenbank gegen den letzten sauberen
 *  Abschluss prüfen (Prüfsumme). Ergebnis: Text oder "" (nichts zu sagen). */
export async function hinweis(zustandDaten, bytes, { jetzt = Date.now(), krypto = globalThis.crypto } = {}) {
  const offen = zustandDaten?.offen_auf;
  if (offen && typeof offen === "object" && offen.geraet) {
    const zuletzt = Date.parse(offen.zuletzt_aktiv || offen.seit || "");
    const alter = Number.isFinite(zuletzt) ? Math.max(0, Math.round((jetzt - zuletzt) / 1000)) : null;
    if (alter !== null && alter > ALT_AB_S) {
      return `Sync-Tax Pro auf „${offen.geraet}“ ist vermutlich nicht mehr offen (letztes Lebenszeichen vor ${dauer(alter)}), `
        + "wurde aber nicht sauber beendet. Was du siehst, kann unvollständig sein.";
    }
    return `Sync-Tax Pro ist gerade auf „${offen.geraet}“ offen${alter !== null ? ` (aktiv vor ${dauer(alter)})` : ""}. `
      + "Was du siehst, kann sich noch ändern.";
  }
  const abschluss = zustandDaten?.letzter_abschluss;
  if (bytes && abschluss && typeof abschluss === "object" && abschluss.db_pruefsumme) {
    if (await sha256hex(bytes, krypto) !== abschluss.db_pruefsumme) {
      return "Die Datenbank passt nicht zum letzten Beenden am PC. Dropbox überträgt vielleicht noch; später noch einmal aktualisieren.";
    }
  }
  return "";
}

/** Ein ganzer Abgleich, wie ihn die App beim Start und bei „Aktualisieren“ macht: Zugang (bei Bedarf erneuert),
 *  Datenbank nur bei neuer Fassung laden, zustand.json lesen, Hinweis bilden.
 *  Ergebnis: { neu, rev, bytes?, geaendert?, hinweis }. `anmeldung` kann sich ändern (neuer Zugang) – danach speichern. */
export async function abgleichen(anmeldung, bekannteRev, bekannteBytes,
                                 { appKey = APP_KEY, netz = globalThis.fetch, jetzt = Date.now(), krypto = globalThis.crypto } = {}) {
  const token = await zugang(anmeldung, { appKey, netz, jetzt });
  const ergebnis = await datenbankHolen(token, bekannteRev, { netz });
  const zustandDaten = await zustandHolen(token, { netz });
  ergebnis.hinweis = await hinweis(zustandDaten, ergebnis.neu ? ergebnis.bytes : bekannteBytes, { jetzt, krypto });
  return ergebnis;
}

function dauer(s) {
  if (s < 90) return `${s} Sekunden`;
  if (s < 5400) return `${Math.round(s / 60)} Minuten`;
  if (s < 172800) return `${Math.round(s / 3600)} Stunden`;
  return `${Math.round(s / 86400)} Tagen`;
}
