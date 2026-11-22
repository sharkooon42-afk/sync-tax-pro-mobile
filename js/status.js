// Status-Etikett eines Termins, nur aus gespeicherten Spalten (die App rechnet nichts nach).
// Gleiche Reihenfolge wie `queries.appointment_status` im Programm, aber ohne „unterbezahlt“ (braucht die Warnung)
// und ohne „überfällig“ (braucht die Einstellung): ein vergangener Termin ohne Abrechnung heißt hier „Beleg fehlt“.
export function statusVon(termin, heuteIso) {
  if (termin.zahlung_status === "bezahlt") return { text: "bezahlt", art: "bezahlt" };
  if (termin.zahlung_status === "teilweise") return { text: "teilweise bezahlt", art: "teilweise" };
  if (termin.beleg_status === "vorhanden") return { text: "abgerechnet", art: "abgerechnet" };
  if (termin.datum > heuteIso) return { text: "geplant", art: "geplant" };
  return { text: "Beleg fehlt", art: "fehlt" };
}
