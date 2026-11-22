// Service Worker: legt die App-Dateien beim ersten Besuch auf das Handy, damit die App auch ohne Internet startet.
// Mit Internet gilt immer die neueste Datei (zuerst das Netz, höchstens 3 Sekunden Geduld), ohne Internet die gemerkte.
// Die Datenbank des Nutzers geht nie durch den Service Worker; sie liegt in IndexedDB (js/speicher.js).
// VERSION muss mit mobile/VERSION übereinstimmen (ein Test prüft das).
const VERSION = "0.3.0";
const CACHE = `sync-tax-pro-mobile-${VERSION}`;
const SCHALE = [
  "./", "index.html", "manifest.webmanifest",
  "css/farben.css", "css/app.css",
  "js/app.js", "js/ansicht_geld.js", "js/cloud_dropbox.js", "js/ansicht_platzhalter.js", "js/ansicht_termine.js", "js/datenbank.js", "js/demo.js",
  "js/dom.js", "js/format.js", "js/lesevertrag.js", "js/speicher.js", "js/status.js", "js/version.js",
  "lib/sql-wasm.js", "lib/sql-wasm.wasm",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];
const GEDULD_MS = 3000;

self.addEventListener("install", (ereignis) => {
  ereignis.waitUntil(caches.open(CACHE).then((c) => c.addAll(SCHALE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ereignis) => {
  ereignis.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n.startsWith("sync-tax-pro-mobile-") && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()));
});

function mitGeduld(anfrage) {
  return new Promise((ok, fehler) => {
    const uhr = setTimeout(() => fehler(new Error("zu langsam")), GEDULD_MS);
    fetch(anfrage).then((antwort) => { clearTimeout(uhr); ok(antwort); }, (f) => { clearTimeout(uhr); fehler(f); });
  });
}

self.addEventListener("fetch", (ereignis) => {
  const anfrage = ereignis.request;
  if (anfrage.method !== "GET" || new URL(anfrage.url).origin !== self.location.origin) return;
  ereignis.respondWith(
    mitGeduld(anfrage)
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(CACHE).then((c) => c.put(anfrage, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(anfrage, { ignoreSearch: true }).then((treffer) => treffer || Response.error())));
});
