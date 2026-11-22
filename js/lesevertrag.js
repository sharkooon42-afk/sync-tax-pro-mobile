// ERZEUGT von mobile/werkzeuge/erzeugen.py aus syncpro/mobil/lesevertrag.py. Nicht von Hand ändern.
export const VERTRAG_NUMMER = 1;
export const TABELLEN = {
  "appointments": [
    "id",
    "datum",
    "zeit",
    "projekt",
    "studio",
    "kategorie",
    "umfang",
    "beleg_status",
    "zahlung_status",
    "gage_ist",
    "takes_soll",
    "takes_ist",
    "ausgeblendet"
  ],
  "studios": [
    "name",
    "adresse",
    "fahrzeit_min"
  ],
  "documents": [
    "id",
    "betrag",
    "absender",
    "appointment_id"
  ],
  "bank_transactions": [
    "id",
    "datum",
    "absender",
    "betrag",
    "verwendungszweck",
    "status"
  ],
  "dispos": [
    "termin_id",
    "status"
  ],
  "mobil_erledigt": [
    "zettel_id",
    "ergebnis",
    "zeit"
  ]
};
export const ABFRAGEN = {
  "verdienst": "SELECT ROUND(COALESCE(SUM(gage_ist), 0), 2) AS wert FROM appointments WHERE datum BETWEEN :von AND :bis AND beleg_status = 'vorhanden'",
  "noch_offen_betrag": "SELECT ROUND(COALESCE(SUM(gage_ist), 0), 2) AS wert FROM appointments WHERE datum BETWEEN :von AND :bis AND beleg_status = 'vorhanden' AND zahlung_status = 'offen'",
  "teilweise_anzahl": "SELECT COUNT(*) AS wert FROM appointments WHERE datum BETWEEN :von AND :bis AND zahlung_status = 'teilweise'",
  "fehlende_belege": "SELECT COUNT(*) AS wert FROM appointments WHERE datum BETWEEN :von AND :bis AND datum <= :heute AND beleg_status <> 'vorhanden'",
  "offene_ueberweisungen": "SELECT COUNT(*) AS wert FROM bank_transactions WHERE status = 'offen'"
};
