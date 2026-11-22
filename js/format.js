// Anzeige von Datum, Uhrzeit und Geld. Reine Funktionen, ohne Seiteneffekte (laufen auch in Node-Tests).
const WOCHENTAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

/** Ein Datum als ISO-Text 'JJJJ-MM-TT' (ohne Zeitzonen-Verschiebung). */
export function iso(datum) {
  const z = (n) => String(n).padStart(2, "0");
  return `${datum.getFullYear()}-${z(datum.getMonth() + 1)}-${z(datum.getDate())}`;
}

function teile(isoDatum) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDatum || "");
  if (!m) return null;
  const [, j, mo, t] = m;
  return { jahr: +j, monat: +mo, tag: +t };
}

export function datumDe(isoDatum) {
  const t = teile(isoDatum);
  return t ? `${String(t.tag).padStart(2, "0")}.${String(t.monat).padStart(2, "0")}.${t.jahr}` : (isoDatum || "");
}

/** { wochentag: 'Mo', tag: 23, monat: 'Nov' } für den Datumsblock der Karten. */
export function datumBlock(isoDatum) {
  const t = teile(isoDatum);
  if (!t) return { wochentag: "", tag: "", monat: "" };
  const d = new Date(Date.UTC(t.jahr, t.monat - 1, t.tag, 12));
  return { wochentag: WOCHENTAGE[d.getUTCDay()], tag: t.tag, monat: MONATE[t.monat - 1] };
}

const MONATE_LANG = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const TAG_MS = 86400000;

function utc(isoDatum) {
  const t = teile(isoDatum);
  return t ? Date.UTC(t.jahr, t.monat - 1, t.tag) : NaN;
}

/** 'November 2026' (für Monats-Trenner). */
export function monatJahr(isoDatum) {
  const t = teile(isoDatum);
  return t ? `${MONATE_LANG[t.monat - 1]} ${t.jahr}` : "";
}

/** Kalenderwoche nach ISO 8601 (Woche beginnt Montag; KW 1 enthält den 4. Januar): { jahr, woche }. */
export function kalenderwoche(isoDatum) {
  const ms = utc(isoDatum);
  if (Number.isNaN(ms)) return { jahr: 0, woche: 0 };
  const d = new Date(ms);
  const wt = (d.getUTCDay() + 6) % 7;                         // Mo = 0 … So = 6
  const donnerstag = new Date(ms + (3 - wt) * TAG_MS);        // der Donnerstag dieser Woche bestimmt das Jahr
  const jahr = donnerstag.getUTCFullYear();
  return { jahr, woche: 1 + Math.floor((donnerstag - Date.UTC(jahr, 0, 1)) / TAG_MS / 7) };
}

/** 'Heute', 'Morgen', 'Gestern' oder '' (sonst). */
export function tagWort(isoDatum, heuteIso) {
  const abstand = Math.round((utc(isoDatum) - utc(heuteIso)) / TAG_MS);
  return { 0: "Heute", 1: "Morgen", "-1": "Gestern" }[abstand] || "";
}

/** 'So, 22. Nov' */
export function tagKurz(isoDatum) {
  const b = datumBlock(isoDatum);
  return b.tag === "" ? "" : `${b.wochentag}, ${b.tag}. ${b.monat}`;
}

/** Beginn aus dem Zeitfeld: '10:00 - 12:30' → '10:00'; leer → ''. */
export function uhrzeitBeginn(zeit) {
  const m = /(\d{1,2}):(\d{2})/.exec(zeit || "");
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

/** '2026-11-22' + Uhrzeit 'tt.mm. hh:mm' aus einem Zeitstempel in Millisekunden. */
export function zeitpunktKurz(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const z = (n) => String(n).padStart(2, "0");
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}. ${z(d.getHours())}:${z(d.getMinutes())}`;
}

/** 1234.5 -> '1.234,50 €' (deutsches Format, ohne Intl, damit es überall gleich aussieht). */
export function euro(betrag) {
  const zahl = Number(betrag || 0);
  const neg = zahl < 0 ? "-" : "";
  const [ganz, cent] = Math.abs(zahl).toFixed(2).split(".");
  return `${neg}${ganz.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cent} €`;
}

/** Text kürzen: bis zu `max` Zeichen, danach „…“. */
export function kuerzen(text, max) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/** Sekunden als '0,4 s' (für die gemessene Ladezeit). */
export function sekunden(ms) {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}
