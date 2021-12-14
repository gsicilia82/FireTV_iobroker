# FireTV Skript für ioBroker

Script zur Steuerung von FireTV Sticks

**Dies ist kein Adapter** sondern ein Skript. Es muss aus der Datei /Skripte/skript.js kopiert und in ein neuen JS-Skript einer beliebigen Javascript-Instanz kopiert werden

* [Start](#start)
* [Erläuterungen](#erläuterungen)
* [ToDos](#todos)
* [Changelog](changelog)

## Start

<u>IN ARBEIT</u>

* `adbkit` als Modul in Javascript-Instanz eingeben

* Datei `adb` aus Pfad ./ADB lokal auf ioBroker PC ablegen

* Skript starten
  
  * Erste States werden unter `javascript.X.FireTV` erstellt
  
  * ADB-Pfad in State `javascript.X.FireTV.ADB_Path` eingeben/korrigieren
  
  * Eigene FireTV Geräte in State `javascript.X.FireTV.Devices` als JSON-String eingeben. Zwei <u>Beispiele</u> sind bereits hinterlegt.
  
  * Für jedes hinterlegte FireTV Gerät werden zusätzliche States angelegt 

* Falls Github Updates für Skript vorliegen, wird es in State `javascript.X.FireTV.UpdateAvailable` angezeigt

---

## Erläuterungen

<u>IN ARBEIT</u>

Anbei ein paar Worte zu den verschiedenen States:

* FireTV.Timing.CheckConnection
  
  * Wenn ein Gerät noch nicht verbunden ist (z.B. ausgeschaltet), wird es in diesem Intervall (schedule) versucht es zu verbinden

* FireTV.Timing.CheckState
  
  * Nur wenn ein Gerät verbunden ist , wird in diesem Intervall (schedule inkl. Sekunden!) versucht, den aktuellen Status zu ermitteln. Möglich sind
    
    * playing, pause und idle

Geänderte Timings werden mit Restart vom Skript übernommen. Dies kann über Button in States erfolgen.

***

## ToDo's

<u>IN ARBEIT</u>

* Check ob adb lokale abgelegt wurde!

* Direkte Eingabe von Befehlen für Shell-Konsole ermöglichen

* Wenn Gerät aus JSON entfernt wird, sollte States auomatisch gelöscht werden

***

## Changelog

**Changelog v0.0.1 14.12.2021**

* Erste Version...
* Unterkategorie "Console" in Objekten <u>noch ohne Funktion</u>
