# FireTV Skript für ioBroker

Script zur Steuerung von FireTV Sticks

**Dies ist kein Adapter** sondern ein Skript. Es muss aus der Datei /Skripte/skript.js kopiert und in ein neuen JS-Skript einer beliebigen Javascript-Instanz kopiert werden

* [Start](#start)
* [Erläuterungen](#erläuterungen)
* [ToDos](#todos)
* [Changelog](#changelog)

## Start

Am FireTV Stick muss das ADB-Debugging aktiviert werden unter:

"Mein Fire TV" > "Entwickleroptionen" > "ADB-Debugging"

Die nachfolgenden Schritte erfolgen am ioBroker:

* `adbkit` als Modul in Javascript-Instanz eingeben

* Datei `adb` aus Pfad ./ADB lokal auf ioBroker-Host ablegen

* Skript starten (für die nachfolgenden Schritte werden vom Skript auch entsprechende Hinweise im Log ausgegeben)
  
  * Erste States werden unter `javascript.X.FireTV` erstellt
  
  * ADB-Pfad in State `javascript.X.FireTV.ADB_Path` eingeben/korrigieren
  
  * Eigene FireTV Geräte in State `javascript.X.FireTV.Devices` als JSON-String eingeben. Zwei <u>Beispiele</u> sind bereits hinterlegt.
  
  * Für jedes hinterlegte FireTV Gerät werden zusätzliche States angelegt 
  
  * Wenn die eigenen Geräte korrekt hinterlegt wurden, versucht das Skript nun über ADB zu verbinden. Beim erstamligen Verbindungsversuch erscheint am TV ein PopUp, dass dauerhaft bestätigt werden muss (Checkbox in PopUp anwählen, sonst erfolgt diese Meldung immer wieder)

* Falls Github Updates für Skript vorliegen, wird es in State `javascript.X.FireTV.UpdateAvailable` angezeigt

---

## Erläuterungen

**IN ARBEIT**

Anbei ein paar Worte zu den verschiedenen States:

* FireTV.Timing.CheckConnection
  
  * Wenn ein Gerät nicht verbunden ist (z.B. ausgeschaltet, ADB-Debugging aus oder nicht freigegeben), wird es in diesem Intervall (schedule) versucht es zu verbinden

* FireTV.Timing.CheckState
  
  * Nur wenn ein Gerät verbunden ist , wird in diesem Intervall (schedule inkl. Sekunden!) folgendes versucht:
    
    * Status: playing, pause und idle `javascript.X.FireTV.192_168_Y_Z.State`
    * Aktuell laufende App unter `javascript.X.FireTV.192_168_Y_Z.Package.RunningPackage`

Geänderte Timings werden mit Restart vom Skript übernommen. Dies kann über Button in States erfolgen.

***

## ToDo's

* Check ob adb lokal abgelegt wurde!

* Direkte Eingabe von Befehlen für Shell-Konsole ermöglichen

* Wenn Gerät aus JSON entfernt wird, sollten States auomatisch gelöscht werden

***

## Changelog

**Changelog v0.0.3 19.12.2021**

- Connected Status über DeviceTracker ermitteln
- Status UND RunningPackage im Intervall auslesen

**Changelog v0.0.2 14.12.2021**

- Automatische Online Prüfung ob Update vorliegt

**Changelog v0.0.1 14.12.2021**

* Erste Version...
* Unterkategorie "Console" in Objekten noch ohne Funktion
