# FireTV Skript für ioBroker

Script zur Steuerung von FireTV Sticks

**Dies ist kein Adapter sondern ein JS-Skript. Es muss aus der Datei /Skripte/skript.js kopiert und in ein neuen JS-Skript einer beliebigen Javascript-Instanz kopiert werden**

* [Start](#start)
* [Erläuterungen](#erläuterungen)
* [ToDos](#todos)
* [Changelog](#changelog)

## Start

Am FireTV Stick muss das ADB-Debugging aktiviert werden unter:

"Mein Fire TV" > "Entwickleroptionen" > "ADB-Debugging"

Die nachfolgenden Schritte erfolgen am ioBroker:

* `adbkit` als Modul in Javascript-Instanz eingeben
  ![ADBKIT hinzufügen](./ReadMe_Images/adbkit.png)

* Datei `adb` aus Pfad ./ADB lokal auf ioBroker-Host ablegen

* In ioBroker ein neues Javascript unter dem Reiter "Skripte" erstellen und aus diesem Repo den Inhalt der Datei Skripte/skript.js dort hinein kopieren  

* Skript starten (für die nachfolgenden Schritte werden vom Skript auch entsprechende Hinweise im Log ausgegeben)
  
  * Erste States werden unter `javascript.X.FireTV` erstellt
  
  * ADB-Pfad in State `javascript.X.FireTV.ADB_Path` eingeben/korrigieren
  
  * Eigene FireTV Geräte in State `javascript.X.FireTV.Devices` als JSON-String eingeben. Zwei <u>Beispiele</u> sind bereits hinterlegt (Fake-IPs).
  
  * Für jedes hinterlegte FireTV Gerät werden zusätzliche States angelegt 
  
  * Wenn die eigenen Geräte korrekt hinterlegt wurden, versucht das Skript nun über ADB zu verbinden. Beim erstamligen Verbindungsversuch erscheint am TV ein PopUp, dass dauerhaft bestätigt werden muss (Checkbox in PopUp anwählen, sonst erfolgt diese Meldung immer wieder)

* Falls Github Updates für Skript vorliegen, wird es in State `javascript.X.FireTV.UpdateAvailable` angezeigt

---

## Erläuterungen

Anbei ein paar Worte zu den verschiedenen States:

* FireTV.Timing.**CheckIfConnected**
  
  * In diesem Intervall (in Sekunden) werden die verbundenen FireTV nach idle/pause/play und aktuell laufendem Package abgefragt.
    
    (Das Intervall sollte bei nicht weniger als 10s liegen, da fehlgeschlagene Befehle bereits 10s für ein Timeout benötigen)

* FireTV.Timing.**CheckIfNotConnected**
  
  * Wenn ein Gerät nicht verbunden ist, wird in diesem Intervall (in Sekunden) versucht eine Verbindung aufzubauen.

* FireTV.192_168_Y_Z.**State**
  
  * Status: playing, paused und idle werden zurückgemeldet
    (DAZN meldet den Status leider nicht unter Android Media-Sessions zurück)

* FireTV.192_168_Y_Z.**ReadInstalledPackages**
  
  * Wenn erstmalig nach Skript-Start ein FireTV verbunden wird, werden die installierten Packages ausgelesen und als DropDown in StartPackage und StopPackage hinterlegt. Dies kann zur Laufzeit mit einem Klick auf diesen Button forciert werden

* FireTV.192_168_Y_Z.**State_Trigger**
  
  * Mit diesem Button kann das Auslesen vom Status manuell angestoßen werden. Auch die aktuell laufende App wird aktualisiert



Übersicht der verschiedenen States:

![States Übersicht](./ReadMe_Images/states_overview.png)

***

## ToDo's

* Check ob adb lokal abgelegt wurde!

* Direkte Eingabe von Befehlen für Shell-Konsole ermöglichen

* Wenn Gerät aus JSON entfernt wird, sollten States auomatisch gelöscht werden

***

## Changelog

**Changelog v0.0.10 04.01.2022**

- Script optimized regarding states handling

**Changelog v0.0.8 02.01.2022**

- Bugfix createState() in case of REDIS database
* Intervall statt Schedules für Prüfung der Verbindung und Status der Geräte
* Verschiedene Error-Handlings, wenn Gerät Offline geht
* Verschiedene States gelöscht und neu hinzugefügt

**Changelog v0.0.5 19.12.2021**

- Connected Status über DeviceTracker ermitteln
- Status UND RunningPackage im Intervall auslesen

**Changelog v0.0.2 14.12.2021**

- Automatische Online Prüfung ob Update vorliegt

**Changelog v0.0.1 14.12.2021**

* Erste Version...
* Unterkategorie "Console" in Objekten noch ohne Funktion
