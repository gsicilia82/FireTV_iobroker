# FireTV Skript für ioBroker

Script zur Steuerung von FireTV Sticks

**Dies ist kein Adapter sondern ein JS-Skript. Es muss aus der Datei /Skripte/skript.js kopiert und in ein neuen JS-Skript einer beliebigen Javascript-Instanz kopiert werden**

* [Start](#start)
* [Erläuterungen](#erläuterungen)
* [ToDos](#todos)
* [Changelog](#changelog)

Eine Übersicht der verschiedenen States:

![States Übersicht](./ReadMe_Images/states_example.png)

## Start

Am FireTV Stick muss das ADB-Debugging aktiviert werden unter:

"Mein Fire TV" > "Entwickleroptionen" > "ADB-Debugging"

Die nachfolgenden Schritte erfolgen am ioBroker:

* `adbkit` als Modul in Javascript-Instanz eingeben
  ![ADBKIT hinzufügen](./ReadMe_Images/adbkit.png)

* Das Tool `adb` muss auf dem ioBroker Host installiert sein. Auf einem Standardsystem kann es wie folgt installiert werden:

```
  sudo apt-get install -y android-tools-adb
```

  Falls ioBroker im Docker Container von buanet läuft, kann das Paket mittels Variable installiert werden:

```yaml
  environment:
    - PACKAGES=android-tools-adb
```

* In ioBroker ein neues Javascript unter dem Reiter "Skripte" erstellen und aus diesem Repo den Inhalt der Datei Skripte/skript.js dort hinein kopieren  

* Skript starten (für die nachfolgenden Schritte werden vom Skript auch entsprechende Hinweise im Log ausgegeben)
  
  * Erste States werden unter `javascript.X.FireTV` erstellt
  
  * Pfad zu lokal abgelegter `adb` in State `javascript.X.FireTV.ADB_Path` eingeben/korrigieren
  
  * Eigene FireTV Geräte in State `javascript.X.FireTV.Devices` als JSON-String eingeben. Bitte beachtet die JSON-Notation; ein trennendes Komma-Zeichen wird nur zwischen mehreren Einträgen benötigt, nicht am Ende. Wenn es nur ein Eintrag ist, dann würde es so aussehen:
    `{  "Wohnzimmer": "192.168.192.55"}`
    Zwei <u>Beispiele</u> sind bereits hinterlegt (Fake-IPs).
  
  * Für jedes hinterlegte FireTV Gerät werden automatisch entsprechende States angelegt 
  
  * Wenn die eigenen Geräte korrekt hinterlegt wurden, versucht das Skript nun über ADB zu verbinden. Beim erstamligen Verbindungsversuch erscheint am TV ein PopUp, dass dauerhaft bestätigt werden muss (Checkbox in PopUp anwählen, sonst erfolgt diese Meldung immer wieder)

* Falls auf Github Updates für dieses Skript vorliegen, wird es im State `javascript.X.FireTV.UpdateAvailable` angezeigt. So bleibt ihr up to date...

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
  
  * Mit diesem Button kann das Auslesen vom Status manuell angestoßen werden. Auch die aktuell laufende App wird aktualisiert.

---

## ToDo's

* Direkte Eingabe von Befehlen für Shell-Konsole ermöglichen

* Wenn Gerät aus JSON entfernt wird, sollten States auomatisch gelöscht werden

---

## Changelog

**Changelog v0.2.0 19.02.2022**

* Don't check running package, if optional app is installed on FireTV

**Changelog v0.1.3 11.02.2022**

- Creating states optimized
- Update State with setObject instead of forceCreate

**Changelog v0.1.2 10.01.2022**

- First release
