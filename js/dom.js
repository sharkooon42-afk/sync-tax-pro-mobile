// Kleine Hilfe zum Bauen von Elementen. Texte kommen immer als Text hinein (nie als HTML),
// damit Inhalte aus der Datenbank nichts ausführen können.
export function h(tag, eigenschaften, ...kinder) {
  const el = document.createElement(tag);
  for (const [name, wert] of Object.entries(eigenschaften || {})) {
    if (wert === null || wert === undefined || wert === false) continue;
    if (name === "klasse") el.className = wert;
    else if (name.startsWith("on")) el.addEventListener(name.slice(2).toLowerCase(), wert);
    else el.setAttribute(name, wert === true ? "" : String(wert));
  }
  for (const kind of kinder.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    el.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
  return el;
}

export function leeren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
