const adb = require('adbkit');
const request = require("request");
const fs = require("fs");

/**
 * 
 * Script to get/set states on FireTV Sticks
 * https://github.com/gsicilia82/FireTV_iobroker
 * 
 * ##################################################
 * PLEASE, DO NOT CHANGE NOTHING BELOW THIS COMMENT!
 * States path: "javascript.X.FireTV"
 * ##################################################
 * 
 * 
 * Workflow:
 * 
 * - Connect to Stick >>> Work >>> Disconnect
 * - Disconnect will only set into State-Object, if connect attempt fails.
 * - Start points inside class FireTV are:
 *     - init()                  | called from Interval if device is disconnected (after failed connect attempt)
 *     - checkStateAndPackage()  | called from Interval if device is "connected"  (no failed connect attempts)
 *     - stateEvent()            | triggered from different object states (called from user)
 * 
 * - To prevent, that one task disconnects while another task is running, there is a counter "workingThreads" [ connect() = +1; disconnect() = -1 ]
 * - Each promise chain from start points  ends with "finally( disconnect ... )" to hold "workingThreads" in balance
 */



// Version of Script
let version = "v0.2.0";


let praefixStates = `javascript.${instance}.FireTV.`;

let DefaultDevices = '{ "Wohnzimmer": "192.168.0.0", "Schlafzimmer": "192.168.0.0"}';

let stoppingScript = false;

// Only one instance of adb client possible! Therefore not included in FireTV class (ADBKIT limitation!)
// PreDeclared as global object and later instanciated in main()
let client = null;

let Devices = [];
let MainSubscribtion = null;

let maxShellLogOutLength = 500;

function dbglog(){
    return getState( praefixStates + "Log_Debug").val
}


function validateIpAddress( ip) {  
  if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test( ip)) {  
    return (true)  
  }
  return (false)  
}


function checkUpdate(){
    let urlGithub = 'https://api.github.com/repos/gsicilia82/FireTV_iobroker/git/refs/tags';

    request( { url: urlGithub, headers: { 'User-Agent': 'request'} }, (error, response, result) => {
        console.log( "Checking for Script Update...");
        let latest = JSON.parse( result).pop().ref.split("/")[2];
        let splitServVers = latest.substring(1).split(".").map( Number );
        let serverVersion = splitServVers[0] * 1e6 + splitServVers[1] * 1e3 + splitServVers[2];
        let splitThisVers = version.substring(1).split(".").map( Number );
        let thisVersion   = splitThisVers[0] * 1e6 + splitThisVers[1] * 1e3 + splitThisVers[2];
        if ( serverVersion > thisVersion){
            console.log( "Script Update available to version: " + latest);
            setState( praefixStates + "UpdateAvailable", true, true);
        } else {
            console.log( "No Script Update available.");
            setState( praefixStates + "UpdateAvailable", false, true);
        }
    }).on("error", err => {
        console.warn( "Error on checking for updates:");
        console.warn( err) 
    });
}
let SchedUpdate = schedule("0 16 * * *", checkUpdate);


function pushStatesJs( JsStates, cb=null) {
    let ownJsStates = JSON.parse( JSON.stringify( JsStates));
    if ( Object.keys( ownJsStates).length === 0) cb && cb();
    else {
        let firstKey = Object.keys( ownJsStates)[0];
        let state = ownJsStates[ firstKey];
        createState( state.id, state.initial, state.forceCreation, state.common, state.native, () => { delete ownJsStates[ firstKey]; pushStates( ownJsStates, cb); });
    }
}

/**
 * ####################################################################################
 * Creates device specific states; Subscribtion to states including "callback"
 * ####################################################################################
 */
class States {
    constructor( FireTV) {
        this.FireTV = FireTV;
        this.devPart = this.FireTV.ip.replace(/\./g, '_');
        this.praefixStates = `${praefixStates}${this.devPart}.`;
        this.StateDef;  // Includes whole state definitions
        this.StateSubs = []; // Includes each single state for Subscribtion
        this.Subscribtion = null;
        this._init();
    }

    _init(){

        this.StateDef = {
            /* id's are filled with complete id including instance inside loop below */
            /*
            Command: {
                id: "Console.Command",
                initial: "",
                forceCreation: false,
                common: { role: "state", read: true, write: true, name: `Shell Command ${this.FireTV.name}`, type: "string" },
                native: {}
            },
            ResultRaw: {
                id: "Console.ResultRaw",
                initial: "",
                forceCreation: false,
                common: { role: "state", read: true, write: false, name: `ResultRaw ${this.FireTV.name}`, type: "string" },
                native: {}
            },
            ResultArray: {
                id: "Console.ResultArray",
                initial: "[]",
                forceCreation: false,
                common: { role: "state", read: true, write: false, name: `ResultArray ${this.FireTV.name}`, type: "string" },
                native: {}
            },
            ResultObj: {
                id: "Console.ResultObj",
                initial: "{}",
                forceCreation: false,
                common: { role: "state", read: true, write: false, name: `ResultObj ${this.FireTV.name}`, type: "string" },
                native: {}
            },
            */
            StartPackage: {
                id: "Package.StartPackage",
                initial: "",
                forceCreation: false,
                common: { role: "state", read: true, write: true, name: `StartPackage ${this.FireTV.name}`, type: "string", states: {} },
                native: {}
            },
            StopPackage: {
                id: "Package.StopPackage",
                initial: "",
                forceCreation: false,
                common: { role: "state", read: true, write: true, name: `StopPackage ${this.FireTV.name}`, type: "string", states: {}},
                native: {}
            },
            StopForegroundPackage: {
                id: "Package.StopForegroundPackage",
                initial: false,
                forceCreation: false,
                common: { role: "button", read: true, write: true, name: `StopForegroundPackage ${this.FireTV.name}`, type: "boolean"},
                native: {}
            },
            RunningPackage: {
                id: "Package.RunningPackage",
                initial: "",
                forceCreation: false,
                common: { role: "state", read: true, write: true, name: `RunningPackage ${this.FireTV.name}`, type: "string"},
                native: {}
            },
            ReadInstalledPackages: {
                id: "Package.ReadInstalledPackages",
                initial: false,
                forceCreation: false,
                common: { role: "button", read: true, write: true, name: `ReadInstalledPackages ${this.FireTV.name}`, type: "boolean"},
                native: {}
            },
            State: {
                id: "State",
                initial: "",
                forceCreation: false,
                common: { role: "state", read: true, write: false, name: `Device State ${this.FireTV.name}`, type: "string"},
                native: {}
            },
            State_Trigger: {
                id: "State_Trigger",
                initial: false,
                forceCreation: false,
                common: { role: "button", read: true, write: true, name: `State_Trigger ${this.FireTV.name}`, type: "boolean"},
                native: {}
            },
            PlayerStop: {
                id: "PlayerStop",
                initial: false,
                forceCreation: false,
                common: { role: "button", read: true, write: true, name: `Stop Mediaplayer ${this.FireTV.name}`, type: "boolean" },
                native: {}
            },
            PlayerPause: {
                id: "PlayerPause",
                initial: false,
                forceCreation: false,
                common: { role: "button", read: true, write: true, name: `Pause/Play Mediaplayer ${this.FireTV.name}`, type: "boolean" },
                native: {}
            },
            Reboot: {
                id: "Reboot",
                initial: false,
                forceCreation: false,
                common: { role: "button", read: true, write: true, name: `Reboot ${this.FireTV.name}`, type: "boolean" },
                native: {}
            },
            Sleep: {
                id: "Sleep",
                initial: false,
                forceCreation: false,
                common: { role: "button", read: true, write: true, name: `Sleep ${this.FireTV.name}`, type: "boolean" },
                native: {}
            },
            Connected: {
                id: "Connected",
                initial: false,
                forceCreation: false,
                common: { role: "state", read: true, write: false, name: `Connection state ${this.FireTV.name}`, type: "boolean" },
                native: {}
            }
        };

        Object.keys( this.StateDef).forEach( ele => {
            let completeID = `${this.praefixStates}${ this.StateDef[ ele].id}`;
            this.StateDef[ ele].id = completeID;
            this.StateSubs.push( completeID);
        });

        pushStatesJs( this.StateDef, () => {
            if (dbglog()) console.log(`States created for device "${this.FireTV.name}" (${this.FireTV.ip})`);
            this.subscribe();
            this.FireTV.init();
        });

    }

    subscribe(){
        this.Subscribtion = on({id: this.StateSubs, change: "ne", ack: false}, ( obj) => {
            let id = obj.id;
            let value = obj.state.val;
            Object.keys( this.StateDef).forEach( key => {
                if ( this.StateDef[ key].id === id){
                    if (dbglog()) console.log(`State triggered for device "${this.FireTV.name}" (${this.FireTV.ip}) with key: ${key}`)
                    this.FireTV.stateEvent( key, value);
                }
            });
        });
    }

    unsubscribe(){
        return new Promise((resolve, reject) => {
            if ( this.Subscribtion) {
                unsubscribe( this.Subscribtion);
                this.Subscribtion = null;
                if (dbglog()) console.log(`Unsubscribe states for for device "${this.FireTV.name}" (${this.FireTV.ip})`);
            }
            resolve(true)
        });
    }

    updatePackageStates(){
        let id = this.StateDef.StartPackage.id;
        let obj = getObject( id);
        obj.common.states = this.FireTV.Apps;
        setObject( id, obj);

        id = this.StateDef.StopPackage.id;
        obj = getObject( id);
        obj.common.states = this.FireTV.Apps;
        setObject( id, obj);

        if (dbglog()) console.log(`Package states (Start/Stop) updated for device "${this.FireTV.name}" (${this.FireTV.ip})`);
    }

    write( jsKey, value, ack = true) {
        if (dbglog()) console.log(`Write state: ${this.StateDef[ jsKey].id} = ${ ( value === "" ? '' : value)} (ack = ${ack})`);
        setState( this.StateDef[ jsKey].id, value, ack);
    }

    read( jsKey) {
        return getState( this.StateDef[ jsKey].id).val
    }
}


/**
 * ####################################################################################
 * Contains Device specific attributes and methods
 * ####################################################################################
 */
class FireTV {
    
    constructor( ip, name){
        this.ip = ip;
        this.name = name;
        this.id = "";
        this.workingThreads = 0;
        this._connected = false;
        this.checkIsRunning = false;
        this.IntvlCheckState = null;
        this.Apps = {};
        this.States = new States( this);
        this.ioBrokerOnFire = false;
    }

    init(){
        if(dbglog()) console.log( `Init running for "${this.name}" (${this.ip})...`);
        this.connect( true)
            .then( () => this.get3rdPartyPackages() )
            .then( () => this.startIobrokerOnFire() )
            .then( ()=> this.setPlayState() )
            .then( ()=> this.setForegroundApp() )
            .then( () => this.startIntvl( true) )
            .catch( err => {
                if(dbglog()) console.log( err)
                if( !this.connected && !this.IntvlCheckState) this.startIntvl( false) // Needed if FireTV is offline when script starts
            })
            .finally( () => this.disconnect( "init") )
    }

    set connected( status){
        if ( status !== this._connected){
            this._connected = status;
            this.States.write( "Connected", status);
            if ( status) console.log( `Device "${this.name}" (${this.ip}) connected!`);
            else {
                console.log( `Device "${this.name}" (${this.ip}) disconnected!`);
                this.States.write( "State", "");
                this.States.write( "RunningPackage", "");
                if( !stoppingScript){
                    console.log( `Start Intervall WorkDisconnected for <${this.name}> (${this.ip})`);
                    this.startIntvl( false);
                }
            }
        }
    }

    get connected(){ return this._connected }

    // Interval calls "init()" in case of disconnected device, otherwise "checkStateAndPackage()"
    startIntvl( connectedState){
        if(dbglog()) console.log( `Starting Interval for "${this.name}" (${this.ip}) with connection state: ${connectedState}`);
        if( this.IntvlCheckState){
            clearInterval( this.IntvlCheckState);
            this.IntvlCheckState = null;
        }
        let idSuffix;
        if ( connectedState) idSuffix = "Timing.CheckIfConnected";
        else idSuffix = "Timing.CheckIfNotConnected";

        let intvlTime = getState( praefixStates + idSuffix).val * 1000;
        if ( intvlTime < 10000){
            intvlTime = 10000;
            console.log( `ID "${praefixStates + idSuffix}" was lower 10s. Set now to 10s!`);
            setState( praefixStates + idSuffix, 10);
        }
        if ( connectedState) this.IntvlCheckState = setInterval( this.checkStateAndPackage.bind(this), intvlTime);
        else this.IntvlCheckState = setInterval( this.init.bind(this), intvlTime);
        
    }

    checkStateAndPackage(){
        if(dbglog()) console.log( `Triggered checkStateAndPackage for "${this.name}" (${this.ip})`);

        // Prevent running multiple threads from this function. Possible if connect() holds on within too short Interval
        if ( this.checkIsRunning) {
            if(dbglog()) console.log( `Triggered checkStateAndPackage aborted for "${this.name}" (${this.ip}). Already running old thread!`);
            return Promise.resolve();
        }
        
        this.checkIsRunning = true;
        return this.connect( true)
            .then( ()=> this.setPlayState() )
            .then( ()=> this.setForegroundApp() )
            .catch( err => { if(dbglog()) console.log( err) })
            .finally( ()=> {
                this.disconnect( "checkStateAndPackage");
                setTimeout( ()=> this.checkIsRunning = false, 1000); // Allow next call from checkStateAndPackage
            });
    }

    async connect( ignoreError=false){
        this.workingThreads++;
        let connected = false;
        try{
            if(dbglog()) console.log( `Trying to connect Device "${this.name}" (${this.ip}) ...`);
            this.id = await client.connect( this.ip);
            await sleep( 200);
            connected = await this.connectWork();
            if(dbglog()) console.log( `Actual connect state from Device "${this.name}" (${this.ip}): ${connected}`);
        }
        catch( err) {
            if ( Object.keys( err).length !== 0){ // empty in case off powered off device; avoid error message in this case
                try{
                    if ( err.cmd === "adb start-server") console.error( `ADB server could not start. Is package "android-tools-adb" installed?!`)
                    else console.error( err);
                } catch ( err){
                    console.error( err);
                }
            }
            if( !ignoreError){
                console.warn( "CONNECTION_ERROR: " + err);
                console.warn( `Device "${this.name}" (${this.ip}) not connected! Powered Off? Not authorized?`);
            }
        }

        return new Promise((resolve, reject) => {
            if ( connected){
                this.connected = true;
                resolve( this.id);
            } else {
                this.connected = false;
                reject( `Device "${this.name}" (${this.ip}) not connected! Powered Off? Not authorized?`);
            }
        });
    }

    async connectWork(){
        let connected = false;
        let ArrWaitMS = [ 0, 30000, 5000, 2000, 1000, 500];
        let loops = 5;
        let sleepTime = 500;
        let error = "";
        try{
            do{
                if(dbglog()) console.log( `Device "${this.name}" (${this.ip}) looping to connect! Remaining loops: ${loops}`);
                let Devices = await client.listDevices();
                Devices.forEach( Device => {
                    if ( Device.id === this.id){
                        if ( Device.type === "device") connected = true;
                        else {
                            if(dbglog()) console.log( `Device "${this.name}" (${this.ip}) not connected! Device state: ${Device.type}`);
                            if( loops>0) console.log( `Device "${this.name}" (${this.ip}) not connected [=${Device.type}]! Not authorized or offline? Waiting ${ArrWaitMS[ loops]/1000}s ...`);
                            sleepTime = ArrWaitMS[ loops];
                        }
                        loops--;
                    }
                })
                if ( !connected) await sleep( sleepTime);
            } while( !connected && loops >= 0)

        }
        catch ( err){
            error = err;
        }
        
        return new Promise((resolve, reject) => {
            if ( error !== "") reject( error);
            else resolve( connected);
        });
    }

    clearDevice(){
        // clearDevice() called only from stop-script function discharge()
        return new Promise(( resolve, reject) => {
            this.connected = false;
            clearInterval( this.IntvlCheckState);
            this.IntvlCheckState = null;
            this.States.unsubscribe();
            // disconnect bug in ADBKIT throws always error... therefore ignore error and resolve always
            client.disconnect( this.id).then( () => resolve( this.id) ).catch( err => resolve( this.id) );
        });
    }

    disconnect( caller=""){
        this.workingThreads--;
        return new Promise(( resolve, reject) => {
            if ( this.workingThreads > 0){
                if(dbglog()) console.log( `Disconnect called from "${caller}" for "${this.name}" (${this.ip}). Not disconnecting cause of pending working threads (${this.workingThreads}).`);
                resolve( this.id);
            } else {
                if(dbglog()) console.log( `Disconnect called from "${caller}" for "${this.name}" (${this.ip}). Disconnect executed.`);
                // disconnect bug in ADBKIT throws always error... therefore ignore error and resolve always
                client.disconnect( this.id).then( () => resolve( this.id) ).catch( err => resolve( this.id) );
            }
        });
    }

    shell( cmd){
        if(dbglog()) console.log( `Execute Shell_CMD "${this.name}" (${this.ip}): ${cmd}`);
        return new Promise((resolve, reject) => {
            client.shell( this.id, cmd)
                .then( adb.util.readAll)
                .then( bOut => {
                    let sOut = bOut.toString();
                    if(dbglog() && sOut.length > 0) console.log( `Result Shell_CMD "${this.name}" (${this.ip}): ${ ( sOut.length > maxShellLogOutLength ? sOut.substring(0,maxShellLogOutLength)+" ..." : sOut ) }`);
                    resolve( sOut )
                })
                .catch( err => reject( err) )
        });
    }

    setPlayState(){
        return this.shell( "dumpsys media_session")
            .then( (sOut)=> {
                let regexPlaying = /active=true\n.*\n.*\n.*\n.*state=PlaybackState.*{state=(3),/g;
                let Matches = regexPlaying.exec( sOut);
                if ( Matches){
                    this.States.write( "State", "playing");
                } else {
                    let regexPaused = /active=true\n.*\n.*\n.*\n.*state=PlaybackState.*{state=(2),/g;
                    Matches = regexPaused.exec( sOut);
                    if ( Matches){
                        this.States.write( "State", "paused");
                    } else {
                        this.States.write( "State", "idle");
                    }
                }
            })
            .catch( err => {
                console.warn( `Error by reading playing time from "${this.name}" (${this.ip})!`);
                console.warn( err)
            })
    }

    // Loop needed if App is started and needs time to be loaded (returns null at beginning)
    async setForegroundApp( attempts=2, waitAttempt=1000){
        if ( this.ioBrokerOnFire) return Promise.resolve(); // If App is installed, this check not needed
        let foreGroundApp = "";
        do{
            try{
                let sOut = await this.shell( "dumpsys window windows | grep -E 'mCurrentFocus' ");
                if ( !sOut.includes( "=null") ) foreGroundApp = sOut.split( " u0 ")[1].split("}")[0].split("/")[0];
                else {
                    attempts--;
                    if(dbglog()) console.log( `Running package on device "${this.name}" (${this.ip}) is Null! Remaining attempts = ${attempts}${ attempts > 0 ? `. Next attempt in ${waitAttempt/1000}s.` : `` }`);
                    if ( attempts > 0) await sleep( waitAttempt);
                }
            }
            catch( err) {
                attempts--;
                console.log( `Error by reading running package from device "${this.name}" (${this.ip})! Remaining attempts = ${attempts}${ attempts > 0 ? `. Next attempt in ${waitAttempt/1000}s.` : `` }`);
                console.log( err)
                if ( attempts > 0) await sleep( waitAttempt);
            }
        } while( foreGroundApp === "" && attempts > 0)

        return new Promise((resolve, reject) => {
            if ( foreGroundApp !== "") {
                this.States.write( "RunningPackage", foreGroundApp);
                resolve( foreGroundApp);
            }
            else reject( `Error by reading running package from device "${this.name}" (${this.ip})!`);
        });
    }

    get3rdPartyPackages(){
        return new Promise((resolve, reject) => {
            this.shell( "pm list packages -3")
                .then( sOut => {
                    let ArrByLines = [];
                    sOut = sOut.trim().replace(/\r/g, ''); // remove all CarriageReturn   
                    ArrByLines = sOut.split( "\n")
                    ArrByLines.forEach( row => {
                        let pack = row.split(":")[1];
                        this.Apps[ pack] = pack;
                    })
                })
                .then( () => this.States.updatePackageStates() )
                .then( () => resolve( this.Apps) )
                .catch( err => reject( err) )
        });
    }

    startIobrokerOnFire(){
        return new Promise((resolve, reject) => {
            if ( this.Apps.hasOwnProperty( "com.iobroker.onfire")){
                console.log( `Found installed package "com.iobroker.onfire" on device "${this.name}" (${this.ip}).`)
                this.shell( "pm grant com.iobroker.onfire android.permission.PACKAGE_USAGE_STATS")
                    .then( () => this.startApp( "com.iobroker.onfire", true) )
                    .then( () => {
                        this.ioBrokerOnFire = true;
                        resolve( true);
                    })
                    .catch( err => reject( err) )
            } else {
                let apk = "/opt/iobroker/ioBrokerOnFire.apk";
                if ( fs.existsSync( apk) ){
                    console.log( `Found "/opt/iobroker/ioBrokerOnFire.apk"! Installing now on device "${this.name}" (${this.ip})...`);
                    client.install(this.id, apk)
                        .then( () => console.log( `App "ioBrokerOnFire.apk" (Package name: com.iobroker.onfire) installed successfull on device "${this.name}" (${this.ip})! Starting it now ...`) )
                        .then( () => this.shell( "pm grant com.iobroker.onfire android.permission.PACKAGE_USAGE_STATS") )
                        .then( () => this.get3rdPartyPackages() )
                        .then( () => this.startApp( "com.iobroker.onfire", true) )
                        .then( () => {
                            this.ioBrokerOnFire = true;
                            resolve( true);
                        })
                        .catch( err => reject( err) )
                } else {
                    if(dbglog()) console.log( `Optional "ioBrokerOnFire.apk" (Package name: com.iobroker.onfire) not installed on device "${this.name}" (${this.ip}) and not found in path "/opt/iobroker". Proceeding without ...`);
                    resolve( false)
                }
            }
        });
    }

    sendKeyEvent( keyEvent){
        return this.shell( "input keyevent " + keyEvent)
    }

    startApp( packName, withoutCheck=false){
        return new Promise((resolve, reject) => {
            console.log( `Starting package "${packName}" on device "${this.name}" (${this.ip}).`);
            if( this.Apps.hasOwnProperty( packName)){
                this.shell( ` monkey --pct-syskeys 0 -p ${packName} 1`)
                    .then( () => sleep( 1000) )
                    .then( () => this.setForegroundApp() )
                    .then( runningApp => {
                        if ( runningApp === packName || withoutCheck){
                            resolve( packName)
                        }
                        // Sometimes, Kodi doesn't start at first attempt when not stopped properly before (e.g. by only pressing Home button)
                        else {
                            console.log( `Starting package "${packName}" on device "${this.name}" (${this.ip}). 2nd and last attempt!`);
                            this.shell( ` monkey --pct-syskeys 0 -p ${packName} 1`)
                                .then( () => sleep( 1000) )
                                .then( () => this.setForegroundApp() )
                                .then( runningApp2nd => {
                                    if ( runningApp2nd === packName){
                                        resolve( packName)
                                    }
                                    else {
                                        reject( `Starting package "${packName}" on device "${this.name}" (${this.ip}) failed. Still running "${runningApp2nd}" !!!`)
                                    }
                                });
                        }
                    })
                    .catch( err => reject( err) )
            }
            else reject( "Package Name not found in predefined Apps!")
        });
    }

    stopApp( packName){
        console.log( `Stopping package "${packName}"`);
        return this.shell( `am force-stop ${packName}`)
                        .then( () => sleep( 1000) )
                        .then( () => this.setForegroundApp() )
    }

    sleep(){
        console.log( `Put device "${this.name}" (${this.ip}) to sleep`);
        return this.sendKeyEvent( `KEYCODE_SLEEP`)
    }

    reboot(){
        console.log( `Rebooting device "${this.name}" (${this.ip})`);
        return this.shell( "reboot")
    }

    stateEvent( key, value){
        switch ( key) {
            case "StartPackage":
                if ( value === this.States.read( "RunningPackage") ){
                    console.log( "Selected Package is already running, nothing to do!");
                    this.States.write("StartPackage", "");
                    break;
                }
                this.connect()
                    .then( () => this.startApp( value) )
                    .catch( err => console.error( err) )
                    .finally( ()=> {
                        this.disconnect( "StartPackage");
                        this.States.write("StartPackage", "");
                    })
                break;
            case "StopPackage":
                this.connect()
                    .then( () => this.stopApp( value) )
                    .catch( err => console.error( err) )
                    .finally( ()=> {
                        this.disconnect( "StopPackage");
                        this.States.write("StopPackage", "");
                    })
                break;
            case "StopForegroundPackage":
                this.connect()
                    .then( () => this.setForegroundApp() )
                    .then( () => this.stopApp( this.States.read( "RunningPackage")) )
                    .catch( err => console.error( err) )
                    .finally( ()=> {
                        this.disconnect( "StopPackage");
                        this.States.write("StopForegroundPackage", false);
                    })
                break;
            case "ReadInstalledPackages":
                this.connect()
                    .then( () => this.get3rdPartyPackages() ).then(cl)
                    .catch( err => console.error( err) )
                    .finally( ()=> {
                        this.disconnect( "ReadInstalledPackages");
                        this.States.write("ReadInstalledPackages", false);
                    })
                break;
            case "State_Trigger":
                this.connect()
                    .then( () => this.checkStateAndPackage() ) // disconnect included in checkStateAndPackage()
                    .catch( err => console.error( err) )
                    .finally( ()=> this.States.write("State_Trigger", false) )
                break;
            case "Reboot":
                this.connect()
                    .then( () => this.reboot() )
                    .catch( err => console.error( err) )
                    .finally( ()=> {
                        this.disconnect( "Reboot");
                        this.States.write("Reboot", false);
                    })
                break;
            case "Sleep":
                this.connect()
                    .then( () => this.sleep() )
                    .catch( err => console.error( err) )
                    .finally( ()=> {
                        this.disconnect( "Sleep");
                        this.States.write("Sleep", false);
                    })
                break;
            case "PlayerStop":
                this.connect()
                    .then( () => this.sendKeyEvent( "KEYCODE_MEDIA_STOP") )
                    .catch( err => console.error( err) )
                    .finally( ()=> {
                        this.disconnect( "PlayerStop");
                        this.States.write("PlayerStop", false);
                    })
                break;
            case "PlayerPause":
                this.connect()
                    .then( () => this.sendKeyEvent( "KEYCODE_MEDIA_PLAY_PAUSE") )
                    .catch( err => console.error( err) )
                    .finally( ()=> {
                        this.disconnect( "PlayerPause");
                        this.States.write("PlayerPause", false);
                    })
                break;
        }
    }
}





let BasicStates = {
    CheckIfNotConnected: {
        id: praefixStates + "Timing.CheckIfNotConnected",
        initial: 60,
        forceCreation: false,
        common: { role: "state", read: true, write: true, unit: "s", name: "Check for Connection", type: "number" },
        native: {}
    },
    CheckIfConnected: {
        id: praefixStates + "Timing.CheckIfConnected",
        initial: 15,
        forceCreation: false,
        common: { role: "state", read: true, write: true, unit: "s", name: "Check for actual status", type: "number" },
        native: {}
    },
    Log_Debug: {
        id: praefixStates + "Log_Debug",
        initial: false,
        forceCreation: true,
        common: { role: "state", read: true, write: true, name: "Acivate Debug Loglevel", type: "boolean" },
        native: {}
    },
    Update: {
        id: praefixStates + "UpdateAvailable",
        initial: false,
        forceCreation: false,
        common: { role: "state", read: true, write: false, name: "Script Update Available", type: "boolean" },
        native: {}
    },
    Version: {
        id: praefixStates + "Version",
        initial: version,
        forceCreation: false,
        common: { role: "state", read: true, write: false, name: "Script Version", type: "string" },
        native: {}
    },
    Devices: {
        id: praefixStates + "Devices",
        initial: DefaultDevices,
        forceCreation: false,
        common: { role: "state", read: true, write: true, name: "Config your Devices", type: "string" },
        native: {}
    },
    RestartScript: {
        id: praefixStates + "RestartScript",
        initial: false,
        forceCreation: false,
        common: { role: "button", read: true, write: true, name: "Restart Script", type: "boolean"},
        native: {}
    }
};



function main() {

    let abortMain = false;
    let JsonDevices = {};

    checkUpdate();

    // Validate JSON from devices
    let stateDevices = getState( praefixStates + "Devices").val;
    if ( stateDevices === DefaultDevices ){
        console.warn( `Please configure state "${stateDevices}" with your own device(s). Script will restart automatically by change of state!`);
        abortMain = true;
    } else {
        try{
            JsonDevices = JSON.parse( stateDevices);
        } catch {
            console.error( `Error parsing state "${stateDevices}" to JSON. Please check JSON syntax. Script will restart automatically by change of state!`);
            abortMain = true;
        }
    }

    if ( abortMain) return
    client = adb.createClient();
    
    Object.keys( JsonDevices).forEach( device => {
        let ip = JsonDevices[ device];
        let name = device;
        console.log( `Creating new device "${name}" with IP ${ip} ...`)

        if ( validateIpAddress( ip) ) Devices.push( new FireTV( ip, name) )
        else {
            console.error( `Error creating new device ${name} with IP ${ip}! IP has not a valid syntax in state "${stateDevices}". Script will restart automatically by change of state!`);
        }
    })
    
}

// Create basic states and call main function
pushStatesJs( BasicStates, () => {

    MainSubscribtion = on({id: [ praefixStates + "Devices", praefixStates + "RestartScript", praefixStates + "Timing.CheckIfConnected", praefixStates + "Timing.CheckIfNotConnected"], change: "ne", ack: false}, function (obj) {
        let triggeredState = obj.id.split(".").pop();
        console.log( "State changed: " + triggeredState + "; restarting Script...");
        // Reset State if button was pushed
        if ( triggeredState === "RestartScript") setState( praefixStates + "RestartScript", false, true)
        discharge();
        setTimeout( () => {
            stoppingScript = false;
            Devices = [];
            main();
        }, 1000)
    });

    main();
});



function discharge(){
    stoppingScript = true;
    clearSchedule( SchedUpdate);
    Devices.forEach( Device => {
        Device.clearDevice()
            .then( DevID => { if ( DevID !== "") console.log( `Device with ID "${DevID}" disconnected`) })
            .catch( err => console.error(err) )
    })
}

onStop( discharge);



