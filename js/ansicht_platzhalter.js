// „Eintragen“ und „Dispo“ kommen in einer späteren Version der App (Stufe M5). Bis dahin sagt die Ansicht das ehrlich.
import { h, leeren } from "./dom.js";

const TEXTE = {
  eintragen: ["Eintragen", "Termin oder Fahrt eintragen kommt in einer späteren Version der App. Das Programm am PC kann die "
    + "Zettel dafür schon lesen (Einstellungen → Daten & Werkzeuge → „Zettel vom Handy …“)."],
  dispo: ["Dispo-Foto", "Dispo-Fotos aufnehmen kommt in einer späteren Version der App."],
};

export function zeige(wurzel, ctx, welche) {
  const [titel, text] = TEXTE[welche];
  leeren(wurzel);
  wurzel.append(h("div", { klasse: "karte" }, h("div", { klasse: "titel" }, titel), h("p", { klasse: "leise" }, text)));
}
