# MykoLab

Statische, deutschsprachige Laborverwaltung für den Lesezeichen-Hub. Die Anwendung speichert ihre Datensätze im Browser in IndexedDB und benötigt zur Laufzeit keinen Internetzugang und kein Backend.

## Versionierung

Bei jeder Änderung wird die Projektversion angepasst. `version.json`, `package.json`, `package-lock.json` und die sichtbare Versionsanzeige in `index.html` tragen dieselbe Version. Neue Funktionen erhöhen die Minor-Version, Fehlerkorrekturen die Patch-Version. Die IndexedDB-Schema-Version wird unabhängig davon nur bei Datenbankänderungen erhöht.

## Start und Integration

Der Lesezeichen-Hub kann dieses Repository als Modul laden. `index.html` liegt im Repository-Hauptverzeichnis und verwendet ausschließlich relative Ressourcenpfade. Der Hub liefert die Dateien unter `/modules/<id>/index.html` aus. Lokal genügt `node tools/serve.mjs` und danach `http://127.0.0.1:8765`; dieser Entwicklungsserver benötigt keine Installation. `file://` ist wegen IndexedDB- und Worker-Beschränkungen kein unterstützter Startweg.

Der Speicher gehört zur **Origin** aus Protokoll, Hostname und Port. Ein Wechsel dieser Werte zeigt einen anderen Datenbestand. Das Aktualisieren der Moduldateien überschreibt die IndexedDB nicht. Ein lokaler IndexedDB-Datenbestand ist kein externes Backup; regelmäßige Exporte unter **Import / Export** sind nötig.

## Funktionen

- CRUD für Rezepturen mit strukturierten Zutaten, Pilzarten, Stämme, individuelle Kulturen, Beimpfungen, Messungen, Ernten und Experimente. Rezeptmengen lassen sich für die Anzeige skalieren; Masse und Volumen werden getrennt summiert.
- UUID-Beziehungen, eindeutige Seriennummern, Rezeptsnapshot bei Beimpfung, chronologische Ereignisse und Löschschutz für verknüpfte Stammdaten.
- Dunkles Analyse-Dashboard mit gemeinsamen Filtern, Messabdeckung, Erträgen, Statusverteilung und klickbaren Laborereignissen. Statistik nach Stamm, Substrat/Revision, Behälter und Versuchsgruppe; unabhängige Ansätze und Erntedurchgänge werden getrennt gezählt.
- Drei Zeitlinienansichten: alle Ansätze auf einer gemeinsamen Kalenderachse, Einzelverlauf bis zur Fruchtbildung und Ernte sowie Versuchsvergleich. Angezeigt werden ausschließlich dokumentierte Ereignisse; laufende Zeitbalken reichen kenntlich bis heute.
- Kontaminations-Schnellaktion in Beimpfungsliste und Details, mit tatsächlichem Erfassungszeitpunkt und lokalem Feststellungsdatum. Wiederholtes Markieren verändert den Erstzeitstempel nicht.
- Durchgängige Kurzinfo zu Ansatz, Pilz, Stamm/Kultur und verwendeter Rezeptur. Neue Beimpfungen sichern ihre Herkunft; Messungen und nummerierte Erntedurchgänge sind direkt aus dem Ansatz erfassbar.
- Fotos für Kulturen, Beimpfungen, Erntedurchgänge und Experimente mit lokalen Vorschaubildern. QR-Kennungen für Beimpfungen enthalten UUID und Seriennummer.
- Responsive SVG-Diagramme mit Achsenwerten, Serienauswahl, Fokus-/Hoverdetails, Zeitachsenzoom, Kalender-/Tag-0-Modus und Datentabellen. PNG-, SVG- und CSV-Export sowie druckbare Auswertungen. Globale Suche nach Namen, Herkunft und allen Kennungen; sortierbare und filterbare Tabellen mit CSV-Export.
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

## Kontamination und Rückverfolgung

Jedes Glas beziehungsweise jeder Beutel wird als eigene **Beimpfung** mit eindeutiger Kennung geführt. In der Beimpfungsliste oder den Details markiert das Biohazard-Symbol **Als kontaminiert markieren** genau diesen Ansatz, nicht dessen Substratrezeptur oder andere Ansätze. Status, Feststellungsdatum und Ereignis werden zusammen gespeichert. Das Beimpfungsdatum, vorhandene Messungen und Ernten bleiben erhalten; die Markierung setzt keinen automatischen Abschluss oder Entsorgungszeitpunkt.

Die Details zeigen Pilzart, Stamm/Kultur, Substrat und Rezeptrevision sowie den Verlauf von Beimpfung, dokumentierten Phasen und Messungen bis zu den Erntedurchgängen. **Messung / Phase** und **Ernte** übernehmen den Ansatz automatisch. Fruchtbildung oder Erntereife werden als Phasenbeobachtung mit Datum erfasst; mehrere Ernten bleiben möglich. Einzelne Fruchtkörper benötigen keine eigenen Datensätze. Jeder Erntedurchgang kann eigene Fotos erhalten.

Verwendete Rezepturen bleiben als Snapshot erhalten. Neue Ansätze sichern zusätzlich den damaligen Herkunftsstand; spätere Stammdatenänderungen überschreiben ihn nicht. Bei Altdaten ohne Herkunftssnapshot wird die Kurzinfo aus den aktuellen Stammdaten aufgelöst und entsprechend bezeichnet. Bewusste Herkunftskorrekturen werden protokolliert. Historische Kontaminationen ohne bekanntes Datum zählen zur Quote, erhalten aber keinen erfundenen Zeitlinienmarker.

## Auswertungsgrundlage

Die gemeinsamen Filter in **Dashboard**, **Zeitlinien** und **Statistiken** wählen Ansätze anhand ihrer Herkunft, ihres aktuellen Status und ihres Beimpfungszeitraums aus. Dieser Zeitraum ist eine Kohortenauswahl, keine Begrenzung der angezeigten Messungs- oder Erntedaten. Der ausgewählte Bestand und die Filter stehen oberhalb jeder Auswertung.

- Kontaminationsquote: mindestens einmal als kontaminiert dokumentierte Ansätze / alle Ansätze der aktuellen Auswahl. Auch ein Statusfilter verändert diese Bezugsgruppe.
- Ertrag: dokumentierte Ernten werden zunächst je Ansatz summiert. Mittelwert, Median und Stichprobenstreuung zählen unabhängige Ansätze mit dokumentiertem Ertrag, nicht einzelne Erntedurchgänge. Fehlende Ernten sind keine Nullwerte.
- Kompatible Massen in g, kg und mg werden in g normalisiert. Frisch-, Trocken- und unbekannte Massearten bleiben getrennt; andere Einheiten werden nicht automatisch umgedeutet.
- Laufzeit: nur abgeschlossene Ansätze mit gültigem Start- und Enddatum. Kontaminationsverläufe verwenden das bekannte Feststellungsdatum.
- Wachstum: ausschließlich tatsächliche Messpunkte, wahlweise nach Kalenderdatum oder Tagen seit Beimpfung. Verbindungslinien sind keine zusätzlichen Messwerte. Kleine Versuche erhalten keine automatisch behauptete statistische Signifikanz.

Diagrammexporte enthalten die sichtbare Auswahl, Einheiten und Filterstand; CSV liefert die zugrunde liegenden Werte. Daten- und Messtabellen ermöglichen die Kontrolle auch ohne grafische Darstellung.

## Backup und Wiederherstellung

**Vollständiges Backup herunterladen** erzeugt eine `.mykolab.json`-Datei mit Schema-Version, Zeitstempel, Fotos und allen IndexedDB-Tabellen. Für die Wiederherstellung die Datei auswählen, **Zusammenführen** oder **Vollständig ersetzen** wählen und die Vorschau bestätigen. Vor dem Ersetzen zuerst ein Backup erstellen. Beide Varianten schreiben alle Tabellen in einer IndexedDB-Transaktion.

## Entwicklung und Tests

`npm install` und `npm test` führen die Kernfunktionstests aus. Unter Windows kann bei blockiertem PowerShell-Skript `npm.cmd` verwendet werden. Für Browsertests `node tools/serve.mjs` starten und in einem zweiten Terminal `node tests/smoke.mjs` sowie `node tests/migration.mjs` ausführen. Die Tests verwenden Playwright und eine lokal installierte Chrome-Version. Sie prüfen unter anderem Kennungsvergabe, Schema-Migration, alte Backups, Persistenz, Fotos, QR und SQLite-Importe sowie datierte Kontaminationen, Parallelmarkierung, historische Herkunft, Erntezuordnung, Diagrammexport und 30 Serien mit langen Kennungen. PNG-Pixel und Screenshots werden für 1440, 768, 390 und 320 Pixel breite Ansichten geprüft; diese Testdaten entstehen nur in einem isolierten Browserkontext.

Laufzeitbibliotheken: [sql.js 1.15.2](https://github.com/sql-js/sql.js) und [qrcode-generator 2.0.4](https://github.com/kazuhikoarase/qrcode-generator), lokal in `vendor/`, beide MIT-lizenziert. Keine externen Laufzeitdienste.

Icons: ausgewählte SVG-Dateien aus [Lucide 0.468.0](https://lucide.dev), lokal unter `assets/icons/` mit zugehöriger ISC-Lizenz. Keine CDN-Abhängigkeit.

## Bekannte Grenzen dieser Fassung

Noch nicht umgesetzt sind Batch-Bearbeitung, eigenständige Rezeptversionshistorie mit Zutatenvergleich, inferenzstatistische Versuchsvergleiche, komprimierte `.mykolab`-Backups sowie Aufgaben-, Lager- und Materialverwaltung. Historische Daten können unvollständige Herkunfts- und Phasenangaben haben; diese werden nicht nachträglich erfunden. Bei der Wachstumsmigration werden Zeilen ohne eindeutige Zuordnung nur als Originaldaten im Importdatensatz bewahrt. Die SQLite-Vorschau begrenzt Tabellen auf 10.000 Zeilen; darüber wird der Import gesperrt. Backups zusammenzuführen bedeutet weiterhin, gleiche UUIDs mit den eingehenden Daten zu überschreiben; vor einer Wiederherstellung ein externes Backup anlegen. Keine automatischen Ertragsannahmen oder Hintergrundbenachrichtigungen bei geschlossener Anwendung.
