# MykoLab

Statische, deutschsprachige Laborverwaltung für den Lesezeichen-Hub. Die Anwendung speichert ihre Datensätze im Browser in IndexedDB und benötigt zur Laufzeit keinen Internetzugang und kein Backend.

## Start und Integration

Der Lesezeichen-Hub kann dieses Repository als Modul laden. `index.html` liegt im Repository-Hauptverzeichnis und verwendet ausschließlich relative Ressourcenpfade. Der Hub liefert die Dateien unter `/modules/<id>/index.html` aus. Lokal genügt `node tools/serve.mjs` und danach `http://127.0.0.1:8765`; dieser Entwicklungsserver benötigt keine Installation. `file://` ist wegen IndexedDB- und Worker-Beschränkungen kein unterstützter Startweg.

Der Speicher gehört zur **Origin** aus Protokoll, Hostname und Port. Ein Wechsel dieser Werte zeigt einen anderen Datenbestand. Das Aktualisieren der Moduldateien überschreibt die IndexedDB nicht. Ein lokaler IndexedDB-Datenbestand ist kein externes Backup; regelmäßige Exporte unter **Import / Export** sind nötig.

## Funktionen

- CRUD für Rezepturen mit strukturierten Zutaten, Pilzarten, Stämme, individuelle Kulturen, Beimpfungen, Messungen, Ernten und Experimente. Rezeptmengen lassen sich für die Anzeige skalieren; Masse und Volumen werden getrennt summiert.
- UUID-Beziehungen, eindeutige Seriennummern, Rezeptsnapshot bei Beimpfung, chronologische Ereignisse und Löschschutz für verknüpfte Stammdaten.
- Dashboard und Statistik mit ausschließlich dokumentierten Werten; Erträge verschiedener Einheiten und Massearten werden getrennt ausgewertet.
- Fotos für Kulturen, Beimpfungen und Experimente mit lokalen Vorschaubildern. QR-Kennungen für Beimpfungen enthalten UUID und Seriennummer.
- SVG-Wachstumskurve mit Tooltip und wählbarer Messgröße, SVG- und CSV-Export, globale Suche sowie sortierbare, filterbare und seitenweise Tabellen mit CSV-Export der Treffer.
- Vollständiges JSON-Backup mit Schema-Version sowie Zusammenführen oder Ersetzen nach Vorschau und Bestätigung.
- Lokaler SQLite-Import der Tabellen `Substrate` und `Beimpfungen` per sql.js/WASM im Worker. Unbekannte Wachstumstabellen können manuell über Seriennummer, Datum und Wert zugeordnet werden. `Substratmischung` bleibt historische Beschreibung; Stammspalten und Originalzeilen bleiben im Legacy-Bereich des Importdatensatzes. `SubstratIndex` wird über die ursprüngliche `Index`-Spalte zu einer neuen UUID aufgelöst. Ertragswerte werden nur mit bestätigter Einheit übernommen. Eine wiederholt importierte identische Datei wird am SHA-256-Fingerprint erkannt.

## Kennungsschema

| Bereich | Automatische Kennung | Beispiel |
|---|---|---|
| Substratrezept | `SUB-JJJJ-NNNN` | `SUB-2026-0001` |
| Individuelle Kultur | `KUL-JJJJ-NNNN` | `KUL-2026-0001` |
| Beimpfung | `BEP-JJJJ-NNNN` | `BEP-2026-0001` |
| Experiment | `EXP-JJJJ-NNNN` | `EXP-2026-0001` |

`JJJJ` ist das Jahr der Anlage, `NNNN` eine je Bereich und Jahr fortlaufende Zahl. Das Feld darf leer bleiben; die Kennung wird beim Speichern vergeben. Eine eigene Kennung ist weiterhin möglich, etwa für vorhandene Etiketten. Groß- und Kleinschreibung sowie Rand-Leerzeichen zählen bei der Kollisionsprüfung nicht als Unterschied. Beim Duplizieren wird immer eine neue Kennung erzeugt. Die Vergabe erfolgt zusammen mit dem Datensatz in einer IndexedDB-Transaktion und ist damit auch bei zwei geöffneten Tabs eindeutig. Interne Beziehungen verwenden weiterhin UUIDs. Pilzarten und Stämme werden über Namen und UUIDs geführt; Messungen und Ernten sind Ereignisse einer Beimpfung und erhalten nur eine interne UUID.

Das Schema-Upgrade auf Datenbankversion 2 ergänzt fehlende Kennungen und löst vorhandene Dubletten auf, ohne eindeutige historische Kennungen umzubenennen. Backups aus Schema-Version 1 werden bei der Wiederherstellung entsprechend angepasst. Importierte Substratrezepturen erhalten eine stabile `SUB-IMP-…`-Kennung aus dem Dateifingerprint und dem historischen Index; der Originalindex bleibt unter `legacy.index` erhalten. Historische Beimpfungsseriennummern bleiben erhalten.

## SQLite-Migration

Unter **Import / Export** eine `.db`, `.sqlite` oder `.sqlite3` auswählen und **Datei untersuchen** anklicken. Die Anwendung liest die Datei im Browser; die Ursprungsdatei wird nicht verändert und nicht hochgeladen. Die Vorschau zeigt erkannte Tabellen, Datensatzzahlen und Probleme. Historische Ertragseinheit und Konfliktstrategie auswählen, dann den Import ausdrücklich bestätigen. Für separate Wachstumstabellen können Seriennummer, Datum und Messwert manuell zugeordnet werden. Ungültige Daten oder fehlende Substratreferenzen sperren derzeit den gesamten Import. Synthetische Altschemata liegen unter `tests/*.sqlite`.

## Backup und Wiederherstellung

**Vollständiges Backup herunterladen** erzeugt eine `.mykolab.json`-Datei mit Schema-Version, Zeitstempel, Fotos und allen IndexedDB-Tabellen. Für die Wiederherstellung die Datei auswählen, **Zusammenführen** oder **Vollständig ersetzen** wählen und die Vorschau bestätigen. Vor dem Ersetzen zuerst ein Backup erstellen. Beide Varianten schreiben alle Tabellen in einer IndexedDB-Transaktion.

## Entwicklung und Tests

`npm install` und `npm test` führen die Kernfunktionstests aus. Für Browsertests `node tools/serve.mjs` starten und in einem zweiten Terminal `node tests/smoke.mjs` sowie `node tests/migration.mjs` ausführen. Die Tests verwenden Playwright und eine lokal installierte Chrome-Version. Sie prüfen unter anderem automatische und manuelle Kennungen, parallele Anlagen, Dublettenschutz, die Schema-Migration von Version 1 auf 2, alte Backups, Persistenz, Diagramme, Fotos, QR-Kennungen und SQLite-Importe.

Laufzeitbibliotheken: [sql.js 1.15.2](https://github.com/sql-js/sql.js) und [qrcode-generator 2.0.4](https://github.com/kazuhikoarase/qrcode-generator), lokal in `vendor/`, beide MIT-lizenziert. Keine externen Laufzeitdienste.

## Bekannte Grenzen dieser Fassung

Die im Entwicklungsauftrag beschriebenen fortgeschrittenen Funktionen sind noch nicht vollständig umgesetzt. Dazu zählen Batch-Bearbeitung, Rezeptvergleich, erweiterte statistische Versuchsgruppenvergleiche, Diagrammzoom und PNG-Export sowie komprimierte `.mykolab`-Backups. Bei der Wachstumsmigration werden Zeilen ohne eindeutige Zuordnung derzeit nur als Originaldaten im Importdatensatz bewahrt. Die SQLite-Vorschau begrenzt Tabellen derzeit auf 10.000 Zeilen; darüber wird der Import gesperrt. Es gibt keine automatischen Ertragsannahmen und keine erfundenen Messwerte.
