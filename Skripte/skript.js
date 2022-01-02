const adb = require('adbkit')
const request = require("request");

/**
 * 
 * Script zur Steuerung von FireTV Sticks und zum Auslesen verschiedener Zustände
 * 
 * Warte für DeviceTracker bevor connect()? Manchmal träge Erkennung vom Tracker
 * 
 */

let thisVersion = "v0.0.6"

let setPrae = `FireTV.`;
let getPrae = `javascript.${instance}.${setPrae}`;

let DefaultAdbPath = "/your/adb/path";
let DefaultDevices = '{ "Wohnzimmer": "192.168.0.0", "Schlafzimmer": "192.168.0.0"}';

let stoppingScript = false;

// Only one instance of adb client possible! Therefore not included in FireTV class (ADBKIT limitation!)
// PreDeclared as global object and later instanciated in main()
let client = null;

let Devices = [];
let MainSubscribtion = null;
let Tracker = null;

function dbglog(){
    return getState( getPrae + "Log_Debug").val
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
        let latest = JSON.parse( result).pop().ref.split("/")[2];
        console.log( "Checking for Script Update...");
        if ( latest > thisVersion) {
            console.log( "Script Update available to version: " + latest);
            setState( setPrae + "UpdateAvailable", true);
        } else {
            console.log( "No Script Update available.");
            setState( setPrae + "UpdateAvailable", false);
        }
    }).on("error", err => {
        console.warn( "Error on checking for updates:");
        console.warn( err) 
    });
}
let SchedUpdate = schedule("0 16 * * *", checkUpdate);


function pushStates( JsStates, cb) {
    let ownJsStates = JSON.parse( JSON.stringify( JsStates));
    if ( Object.keys( ownJsStates).length === 0){
        cb();
    } else {
        let ArrStateNames = Object.keys( ownJsStates);
        let actStateName = ArrStateNames[0]
        let State = ownJsStates[ actStateName];
        createState( State.id, State.initial, State.forceCreation, State.common, State.native, () => {
            delete ownJsStates[ actStateName];
            pushStates( ownJsStates, cb);
        });
    }
}


/**
 * Creates device specific states
 * Subscribtion to states including callback
 */
class States {
    constructor( FireTV) {
        this.FireTV = FireTV;
        this.devPart = this.FireTV.ip.replace(/\./g, '_');
        this.setPrae = `${setPrae}${this.devPart}.`
        this.getPrae = `${getPrae}${this.devPart}.`
        this.StateDef;  // Includes whole state definitions
        this.StateSubs = []; // Includes each single state for Subscribtion
        this.Subscribtion = null;
        this._init();
    }

    _init(){

        this.StateDef = {
            /*
            Command: {
                id: this.set("Console.Command"),
                initial: "",
                forceCreation: false,
                common: { role: "state", read: true, write: true, name: "Console.Command", type: "string" },
                native: {}
            },
            ResultRaw: {
                id: this.set("Console.ResultRaw"),
                initial: "",
                forceCreation: false,
                common: { role: "state", read: true, write: false, name: "Console.ResultRaw", type: "string" },
                native: {}
            },
            ResultArray: {
                id: this.set("Console.ResultArray"),
                initial: "[]",
                forceCreation: false,
                common: { role: "state", read: true, write: false, name: "Console.ResultArray", type: "string" },
                native: {}
            },
            ResultObj: {
                id: this.set("Console.ResultObj"),
                initial: "{}",
                forceCreation: false,
                common: { role: "state", read: true, write: false, name: "Console.ResultObj", type: "string" },
                native: {}
            },
            */
            StartPackage: {
                id: this.set("Package.StartPackage"),
                initial: "",
                forceCreation: true,
                common: { role: "state", read: true, write: true, name: "StartPackage", type: "string", states: {} },
                native: {}
            },
            StopPackage: {
                id: this.set("Package.StopPackage"),
                initial: "",
                forceCreation: true,
                common: { role: "state", read: true, write: true, name: "StopPackage", type: "string", states: {}},
                native: {}
            },
            StopForegroundPackage: {
                id: this.set("Package.StopForegroundPackage"),
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: "StopForegroundPackage", type: "boolean"},
                native: {}
            },
            RunningPackage: {
                id: this.set("Package.RunningPackage"),
                initial: "",
                forceCreation: true,
                common: { role: "state", read: true, write: false, name: "RunningPackage", type: "string"},
                native: {}
            },
            ReadInstalledPackages: {
                id: this.set("Package.ReadInstalledPackages"),
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: "ReadInstalledPackages", type: "boolean"},
                native: {}
            },
            State: {
                id: this.set("State"),
                initial: "",
                forceCreation: true,
                common: { role: "state", read: true, write: false, name: "Device State", type: "string"},
                native: {}
            },
            State_Trigger: {
                id: this.set("State_Trigger"),
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: "State_Trigger", type: "boolean"},
                native: {}
            },
            PlayerStop: {
                id: this.set("PlayerStop"),
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `Stop Mediaplayer`, type: "boolean" },
                native: {}
            },
            PlayerPause: {
                id: this.set("PlayerPause"),
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `Pause/Play Mediaplayer`, type: "boolean" },
                native: {}
            },
            Reboot: {
                id: this.set("Reboot"),
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `Reboot ${this.FireTV.name}`, type: "boolean" },
                native: {}
            },
            Sleep: {
                id: this.set("Sleep"),
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `Sleep ${this.FireTV.name}`, type: "boolean" },
                native: {}
            },
            Connected: {
                id: this.set("Connected"),
                initial: false,
                forceCreation: true,
                common: { role: "state", read: true, write: false, name: `Connection state ${this.FireTV.name}`, type: "boolean" },
                native: {}
            }
        };

        Object.keys( this.StateDef).forEach( ele => {
            let complete = `javascript.${instance}.${ this.StateDef[ ele].id}`;
            this.StateDef[ ele].complete = complete;
            this.StateSubs.push( complete);
        });

        pushStates( this.StateDef, () => {
            if (dbglog()) console.log(`States created for device <${this.FireTV.name}> (${this.FireTV.ip})`);
            this.subscribe();
            this.FireTV.init();
        });

    }

    subscribe(){
        this.Subscribtion = on({id: this.StateSubs, change: "any", ack: false}, ( obj) => {
            /**
             * ###################################################
             * Subscribtion for states to trigger FireTV functions
             * ###################################################
             */
            let cmd = obj.id.split(".").pop();
            let value = obj.state.val;
            if (dbglog()) console.log(`State triggered for command: ${cmd}`)
            switch ( cmd) {
                case "StartPackage":
                    this.write("StartPackage", "");
                    this.FireTV.connect()
                        .then( () => this.FireTV.startApp( value) )
                        .catch( err => console.error( err) )
                        .finally( ()=> this.FireTV.disconnect( "StartPackage") )
                    break;
                case "StopPackage":
                    this.write("StopPackage", "");
                    this.FireTV.connect()
                        .then( () => this.FireTV.stopApp( value) )
                        .catch( err => console.error( err) )
                        .finally( ()=> this.FireTV.disconnect( "StopPackage") )
                    break;
                case "StopForegroundPackage":
                    this.write("StopForegroundPackage", false);
                    this.FireTV.connect()
                        .then( () => this.FireTV.setForegroundApp() )
                        .then( () => this.FireTV.stopApp( this.read( "RunningPackage")) )
                        .catch( err => console.error( err) )
                        .finally( ()=> this.FireTV.disconnect( "StopPackage") )
                    break;
                case "ReadInstalledPackages":
                    this.write("ReadInstalledPackages", false);
                    this.FireTV.connect()
                        .then( () => this.FireTV.get3rdPartyPackages() )
                        .catch( err => console.error( err) )
                        .finally( ()=> this.FireTV.disconnect( "ReadInstalledPackages") )
                    break;
                case "State_Trigger":
                    this.write("State_Trigger", false);
                    this.FireTV.connect()
                        .then( () => this.FireTV.checkStateAndPackage() )
                        .catch( err => console.error( err) )
                    break;
                case "Reboot":
                    this.write("Reboot", false);
                    this.FireTV.connect()
                        .then( () => this.FireTV.reboot() )
                        .catch( err => console.error( err) )
                        .finally( ()=> this.FireTV.disconnect( "Reboot") )
                    break;
                case "Sleep":
                    this.write("Sleep", false);
                    this.FireTV.connect()
                        .then( () => this.FireTV.sleep() )
                        .catch( err => console.error( err) )
                        .finally( ()=> this.FireTV.disconnect( "Sleep") )
                    break;
                case "PlayerStop":
                    this.write("PlayerStop", false);
                    this.FireTV.connect()
                        .then( () => this.FireTV.sendKeyEvent( "KEYCODE_MEDIA_STOP") )
                        .catch( err => console.error( err) )
                        .finally( ()=> this.FireTV.disconnect( "PlayerStop") )
                    break;
                case "PlayerPause":
                    this.write("PlayerPause", false);
                    this.FireTV.connect()
                        .then( () => this.FireTV.sendKeyEvent( "KEYCODE_MEDIA_PLAY_PAUSE") )
                        .catch( err => console.error( err) )
                        .finally( ()=> this.FireTV.disconnect( "PlayerPause") )
                    break;
            }
        });
    }

    unsubscribe(){
        return new Promise((resolve, reject) => {
            if ( this.Subscribtion) {
                unsubscribe( this.Subscribtion);
                this.Subscribtion = null;
                if (dbglog()) console.log(`Unsubscribe states for for device <${this.FireTV.name}> (${this.FireTV.ip})`);
            }
            resolve(true)
        });
    }

    updatePackageStates(){
        let ToUpdate = {
            StartPackage: this.StateDef.StartPackage,
            StopPackage:  this.StateDef.StopPackage,
        };
        ToUpdate.StartPackage.common.states = ToUpdate.StopPackage.common.states = this.FireTV.Apps;

        pushStates( ToUpdate, () => {
            if (dbglog()) console.log(`Package states (Start/Stop) updated for device <${this.FireTV.name}> (${this.FireTV.ip})`);
        });

    }

    write( jsKey, value, ack = true) {
        if (dbglog()) console.log(`Write state: ${this.StateDef[ jsKey].id} = ${ ( value === "" ? '' : value)} (ack = ${ack})`);
        setState( this.StateDef[ jsKey].id, value, ack);
    }

    read( jsKey) {
        return getState( this.StateDef[ jsKey].id).val
    }

    set( state) { return `${this.setPrae}${state}` }

    get( state) { return `${this.getPrae}${state}` }

}


/**
 * Contains Device specific attributes and methods
 */
class FireTV {
    
    constructor( ip, name){
        this.ip = ip;
        this.name = name;
        this.id = "";
        this.isBusy = false;
        this._connected = false;
        this.isInitialized = false;
        this._deviceTrackerState = "";
        this.checkIsRunning = false;
        this.IntvlCheckState = null;
        this.Apps = {};
        this.States = new States( this);
    }

    init(){
        if(dbglog()) console.log( `Init <${this.name}> (${this.ip})...`);
        this.connect( true)
            .then( () => this.get3rdPartyPackages() )
            .then( () => {
                this.isInitialized = true;
                this.checkStateAndPackage( true);
            })
            .catch( err => {
                if(dbglog()) console.log( err)
                if( !this.connected) this.workDisconnected()
            })
    }

    set connected( status){
        if ( status !== this._connected){
            this._connected = status;
            this.States.write( "Connected", status);
            // Read running package if connection established now
            if ( status) {
                console.log( `Device <${this.name}> (${this.ip}) connected!`);
                this.workConnected();
            } else {
                if( !stoppingScript) this.workDisconnected();
            }
        }
    }

    get connected(){ return this._connected }


    set deviceTrackerState( state){
        this._deviceTrackerState = state;
        if ( state === "device") this.connected = true;
    }

    get deviceTrackerState(){ return this._deviceTrackerState }


    workDisconnected(){ 
        if(dbglog()) console.log( `Running WorkDisconnected for <${this.name}> (${this.ip})`);
        if( this.IntvlCheckState){
            clearInterval( this.IntvlCheckState);
            this.IntvlCheckState = null;
        }
        let intvlTime = getState( getPrae + "Timing.CheckIfNotConnected").val * 1000;
        if ( intvlTime < 5000){
            intvlTime = 5000;
            setState( setPrae + "Timing.CheckIfNotConnected", 5);
            console.log( "<CheckIfNotConnected> was lower 5s. Set now to 5s!")
        }
        this.IntvlCheckState = setInterval( this.checkStateAndPackage.bind(this), intvlTime);
        this.States.write( "State", "");
        this.States.write( "RunningPackage", "");
    }

    workConnected(){
        if(dbglog()) console.log( `Running WorkConnected for <${this.name}> (${this.ip})`);
        if( this.IntvlCheckState){
            clearInterval( this.IntvlCheckState);
            this.IntvlCheckState = null;
        }
        let intvlTime = getState( getPrae + "Timing.CheckIfConnected").val * 1000;
        if ( intvlTime < 5000){
            intvlTime = 5000;
            setState( setPrae + "Timing.CheckIfConnected", 5);
            console.log( "<CheckIfConnected> was lower 5s. Set now to 5s!")
        }
        this.IntvlCheckState = setInterval( this.checkStateAndPackage.bind(this), intvlTime);
    }

    checkStateAndPackage( calledFromInit = false){
        if(dbglog()) console.log( `Triggered checkStateAndPackage for <${this.name}> (${this.ip})`);
        // Prevent running multiple threads from this function...
        if ( this.checkIsRunning) {
            if(dbglog()) console.log( `Triggered checkStateAndPackage aborted for <${this.name}> (${this.ip}). Still running old thread!`);
            return Promise.resolve();
        }
        if ( !this.isInitialized) this.init()
        else if ( calledFromInit){
            this.checkIsRunning = true;
            return this.setPlayState()
                .then( ()=> this.setForegroundApp() )
                .catch( err => { if(dbglog()) console.log( err) })
                .finally( ()=> {
                    this.disconnect( "checkStateAndPackage");
                    setTimeout( ()=> this.checkIsRunning = false, 1000);
                })
        } else { /** If not called from Init, connect first... */
            this.checkIsRunning = true;
            return this.connect( true)
                .then( ()=> this.setPlayState() )
                .then( ()=> this.setForegroundApp() )
                .catch( err => { if(dbglog()) console.log( err) })
                .finally( ()=> {
                    this.disconnect( "checkStateAndPackage");
                    setTimeout( ()=> this.checkIsRunning = false, 1000);
                })
        }

    }

    async connect( ignoreError=false){
        let connected = false;
        try{
            if(dbglog()) console.log( `Trying to connect Device <${this.name}> (${this.ip}) ...`);
            this.id = await client.connect( this.ip);
            await sleep( 200);
            connected = await this.connectWork();
            if(dbglog()) console.log( `Actual connect state from Device <${this.name}> (${this.ip}): ${connected}`);
        }
        catch( err) {
            if( !ignoreError){
                console.warn( "CONNECTION_ERROR: " + err);
                console.warn( `Device <${this.name}> (${this.ip}) not connected! Powered Off? Not authorized?`);
            }
        }

        return new Promise((resolve, reject) => {
            // this.connected will be set from DeviceTracker
            if ( connected) resolve( this.id)
            else {
                this.connected = false;
                reject( `Device <${this.name}> (${this.ip}) not connected! Powered Off? Not authorized?`);
            }
        });
    }

    async connectWork(){
        let connected = false;
        let loops = 5;
        let error = "";
        try{
            do{
                if(dbglog()) console.log( `Device <${this.name}> (${this.ip}) looping to connect! Remaining loops: ${loops}`);
                let sleepTime = 500;
                let Devices = await client.listDevices();
                Devices.forEach( Device => {
                    if ( Device.id === this.id){
                        this.deviceTrackerState = Device.type;
                        if ( Device.type === "device") connected = true;
                        else {
                            if(dbglog()) console.log( `Device <${this.name}> (${this.ip}) not connected! Device state: ${Device.type}`);
                            console.log( `Device <${this.name}> (${this.ip}) not connected! Not authorized? Waiting 30s for authorization...`);
                            sleepTime = 30000;
                        }
                    }
                })
                if ( !connected) await sleep( sleepTime);
            } while( !connected && loops > 0)

        }
        catch ( err){
            error = err;
        }
        
        return new Promise((resolve, reject) => {
            if ( error !== "") reject( error);
            else resolve( true);
        });
    }

    clearDevice(){
        // clearDevice() called only from stop-script function discharge()
        return new Promise(( resolve, reject) => {
            this.connected = false;
            clearInterval( this.IntvlCheckState);
            this.States.unsubscribe();
            // disconnect bug in ADBKIT throws always error... therefore ignore error and resolve always
            client.disconnect( this.id).catch( err => Promise.resolve( this.id) );
        });
    }

    disconnect( caller=""){
        if(dbglog()) console.log( `Disconnect called from <${caller}> for <${this.name}> (${this.ip})`);
        return new Promise(( resolve, reject) => {
            // disconnect bug in ADBKIT throws always error... therefore ignore error and resolve always
            client.disconnect( this.id).catch( err => Promise.resolve( this.id) );
        });
    }

    shell( cmd){
        if(dbglog()) console.log( `Execute Shell_CMD <${this.name}> (${this.ip}): ${cmd}`);
        return new Promise((resolve, reject) => {
            client.shell( this.id, cmd)
                .then( adb.util.readAll)
                .then( bOut => {
                    if(dbglog()) console.log( `Result Shell_CMD <${this.name}> (${this.ip}): ${bOut.toString()}`);
                    resolve( bOut.toString() )
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
                console.warn( `Error by reading playing time from <${this.name}> (${this.ip})!`);
                console.warn( err)
            })
    }

    // Loop needed if App is started and needs time to be loaded (returns null at beginning)
    async setForegroundApp( attempts=2, waitAttempt=1000){
        let foreGroundApp = "";
        do{
            try{
                let sOut = await this.shell( "dumpsys window windows | grep -E 'mCurrentFocus' ");
                if ( !sOut.includes( "=null") ) foreGroundApp = sOut.split( " u0 ")[1].split("}")[0].split("/")[0];
                else {
                    attempts--;
                    if(dbglog()) console.log( `Running package on device <${this.name}> (${this.ip}) is Null! Remaining attempts = ${attempts}${ attempts > 0 ? `. Next attempt in ${waitAttempt/1000}s.` : `` }`);
                    if ( attempts > 0) await sleep( waitAttempt);
                }
            }
            catch( err) {
                attempts--;
                console.log( `Error by reading running package from device <${this.name}> (${this.ip})! Remaining attempts = ${attempts}${ attempts > 0 ? `. Next attempt in ${waitAttempt/1000}s.` : `` }`);
                console.log( err)
                if ( attempts > 0) await sleep( waitAttempt);
            }
        } while( foreGroundApp === "" && attempts > 0)

        return new Promise((resolve, reject) => {
            if ( foreGroundApp !== "") {
                this.States.write( "RunningPackage", foreGroundApp);
                resolve( foreGroundApp);
            }
            else reject( `Error by reading running package from device <${this.name}> (${this.ip})!`);
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

    sendKeyEvent( keyEvent){
        return this.shell( "input keyevent " + keyEvent)
    }

    startApp( packName){
        console.log( `Starting package <${packName}>`);
        if( this.Apps.hasOwnProperty( packName)){
            return this.shell( ` monkey --pct-syskeys 0 -p ${packName} 1`)
                        .then( () => sleep( 1000) )
                        .then( () => this.setForegroundApp() )
        }
        else return Promise.reject( "Package Name not found in predefined Apps!")
    }

    stopApp( packName){
        console.log( `Stopping package <${packName}>`);
        return this.shell( `am force-stop ${packName}`)
                        .then( () => sleep( 1000) )
                        .then( () => this.setForegroundApp() )
    }

    sleep(){
        console.log( `Put device <${this.name}> (${this.ip}) to sleep`);
        return this.sendKeyEvent( `KEYCODE_SLEEP`)
    }

    reboot(){
        console.log( `Rebooting device <${this.name}> (${this.ip})`);
        return this.shell( "reboot")
    }
}





let BasicStates = {
    CheckIfNotConnected: {
        id: setPrae + "Timing.CheckIfNotConnected",
        initial: 60,
        forceCreation: false,
        common: { role: "state", read: true, write: true, unit: "s", name: "Check for Connection", type: "number" },
        native: {}
    },
    CheckIfConnected: {
        id: setPrae + "Timing.CheckIfConnected",
        initial: 15,
        forceCreation: false,
        common: { role: "state", read: true, write: true, unit: "s", name: "Check for actual status", type: "number" },
        native: {}
    },
    Log_Debug: {
        id: setPrae + "Log_Debug",
        initial: false,
        forceCreation: false,
        common: { role: "state", read: true, write: true, name: "Acivate Debug Loglevel", type: "boolean" },
        native: {}
    },
    Update: {
        id: setPrae + "UpdateAvailable",
        initial: false,
        forceCreation: false,
        common: { role: "state", read: true, write: true, name: "Script Update Available", type: "boolean" },
        native: {}
    },
    Version: {
        id: setPrae + "Version",
        initial: thisVersion,
        forceCreation: true,
        common: { role: "state", read: true, write: true, name: "Script Version", type: "string" },
        native: {}
    },
    Devices: {
        id: setPrae + "Devices",
        initial: DefaultDevices,
        forceCreation: false,
        common: { role: "state", read: true, write: true, name: "Config your Devices", type: "string" },
        native: {}
    },
    ADB_Path: {
        id: setPrae + "ADB_Path",
        initial: DefaultAdbPath,
        forceCreation: false,
        common: { role: "state", read: true, write: true, name: "Config your Devices", type: "string" },
        native: {}
    },
    RestartScript: {
        id: setPrae + "RestartScript",
        initial: false,
        forceCreation: true,
        common: { role: "button", read: true, write: true, name: "Restart Script", type: "boolean"},
        native: {}
    }
};



function main() {

    let abortMain = false;
    let JsonDevices = {};

    // Validate JSON from devices
    let stateDevices = getState( getPrae + "Devices").val;
    if ( stateDevices === DefaultDevices ){
        console.warn( `Please configure state <${stateDevices}> with your own device(s). Script will restart automatically by change of state!`);
        abortMain = true;
    } else {
        try{
            JsonDevices = JSON.parse( stateDevices);
        } catch {
            console.error( `Error parsing state <${stateDevices}> to JSON. Please check JSON syntax. Script will restart automatically by change of state!`);
            abortMain = true;
        }
    }

    // Validate ADB path
    let adbPath = getState( getPrae + "ADB_Path").val;
    if ( adbPath === DefaultAdbPath){
        console.warn( `ADB path: <${getPrae + "ADB_Path"}> is set to default. Please configure ADB path. Script will restart automatically by change of state!`);
        abortMain = true;
    }

    if ( abortMain) return

    client = adb.createClient({ bin: adbPath });

    //deviceTracker();
    
    Object.keys( JsonDevices).forEach( device => {
        let ip = JsonDevices[ device];
        let name = device;
        console.log( `Creating new device <${name}> with IP ${ip} ...`)

        if ( validateIpAddress( ip) ) Devices.push( new FireTV( ip, name) )
        else {
            console.error( `Error creating new device ${name} with IP ${ip}! IP has not a valid syntax in state <${stateDevices}>. Script will restart automatically by change of state!`);
        }
    })
    
}

// Create basic states and call main function
pushStates( BasicStates, () => {

    MainSubscribtion = on({id: [ getPrae + "Devices", getPrae + "ADB_Path", getPrae + "RestartScript", getPrae + "Timing.CheckIfConnected", getPrae + "Timing.CheckIfNotConnected"], change: "ne", ack: false}, function (obj) {
        let triggeredState = obj.id.split(".").pop();
        console.log( "State changed: " + triggeredState + "; restarting Script...");
        // Reset State if button was pushed
        if ( triggeredState === "RestartScript") setState( setPrae + "RestartScript", false, true)
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
            .then( DevID => { if ( DevID !== "") console.log( `Device with ID <${DevID}> disconnected`) })
            .catch( err => console.error(err) )
    })
}

onStop( discharge);



