const adb = require('adbkit')
const request = require("request");

/**
 * 
 * Script zur Steuerung von FireTV Sticks und zum Auslesen verschiedener Zustände
 * 
 */

let thisVersion = "v0.0.1"

let setPrae = `FireTV.`;
let getPrae = `javascript.${instance}.${setPrae}`;


let DefaultAdbPath = "/your/adb/path";
let DefaultDevices = '{ "Wohnzimmer": "192.168.0.0", "Schlafzimmer": "192.168.0.0"}';

let stoppingScript = false;

// Only one instance of adb client possible! Therefore not included in FireTV class (ADBKIT limitation!)
// PreDeclared as global object and later instanciated in main()
let client = null;

function checkUpdate(){
    let urlGithub = 'https://api.github.com/repos/gsicilia82/Timer_iobroker/git/refs/tags';

    request( { url: urlGithub, headers: { 'User-Agent': 'request'} }, (error, response, result) => {
        let latest = JSON.parse( result).pop().ref.split("/")[2];
        cl( latest);
        if ( latest > thisVersion) {
            console.log( "Update auf Version " + latest + " vorhanden!");
        } else {
            console.log( "Kein Script Update vorhanden.");
        }
    }).on("error", err => {console.warn( err) } );
}

function dbglog(){
    return getState( getPrae + "Log_Debug").val
}

function validateIpAddress( ip) {  
  if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test( ip)) {  
    return (true)  
  }
  return (false)  
} 

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
            RunningPackage: {
                id: this.set("Package.RunningPackage"),
                initial: "",
                forceCreation: true,
                common: { role: "state", read: true, write: false, name: "RunningPackage", type: "string"},
                native: {}
            },
            RunningPackage_Trigger: {
                id: this.set("Package.RunningPackage_Trigger"),
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: "RunningPackage_Trigger", type: "boolean"},
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
            StopPlayer: {
                id: this.set("StopPlayer"),
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `Stop Mediaplayer`, type: "boolean" },
                native: {}
            },
            Reboot: {
                id: this.set("Reboot"),
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `Reboot ${this.FireTV.name}`, type: "boolean" },
                native: {}
            },
            Shutdown: {
                id: this.set("Shutdown"),
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `Shutdown ${this.FireTV.name}`, type: "boolean" },
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
                case "Command":
                    this.FireTV.shell( value);
                    break;
                case "StartPackage":
                    this.write("StartPackage", "");
                    this.FireTV.startApp( value)
                        .then( () => sleep( 1000))
                        .then( () => this.write("RunningPackage_Trigger", true, false) ) // Trigger again to get actual running package
                        .catch( err => console.error( err) );
                    break;
                case "StopPackage":
                    this.write("StopPackage", "");
                    this.FireTV.stopApp( value)
                        .then( () => sleep( 1000))
                        .then( () => this.write("RunningPackage_Trigger", true, false) ) // Trigger again to get actual running package
                        .catch( err => console.error( err) );
                    break;
                case "ReadInstalledPackages":
                    this.write("ReadInstalledPackages", false);
                    this.FireTV.get3rdPartyPackages()
                        .catch( err => console.error( err) );
                    break;
                case "RunningPackage_Trigger":
                    this.write("RunningPackage_Trigger", false);
                    //this.write("RunningPackage", "");
                    this.FireTV.getForegroundApp()
                        .then( app => this.write("RunningPackage", app) )
                        .catch( err => console.error( err) );
                    break;
                case "Reboot":
                    this.write("Reboot", false);
                    this.FireTV.reboot()
                        .catch( err => console.error( err) );
                    break;
                case "Shutdown":
                    this.write("Shutdown", false);
                    this.FireTV.shutdown()
                        .catch( err => console.error( err) );
                    break;
                case "StopPlayer":
                    this.write("StopPlayer", false);
                    this.FireTV.sendKeyEvent( "KEYCODE_MEDIA_STOP")
                        .catch( err => console.error( err) );
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
        if (dbglog()) console.log(`Write state: ${this.StateDef[ jsKey].id} = ${value} (ack = ${ack})`);
        setState( this.StateDef[ jsKey].id, value, ack);
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
        this.lastPlayTime = 0;
        this._connected = false;
        this.SchedConnCheck = null;
        this.SchedIdleCheck = null;
        this.Apps = {};
        this.States = new States( this);
    }

    init(){
        if(dbglog()) console.log( `Init <${this.name}> (${this.ip})...`);
        this._connect()
            .then( () => this.get3rdPartyPackages() )
            .catch( err => {
                if(dbglog()) console.log( err)
                this.workDisconnected();
            })
    }

    set connected( status){
        if ( status !== this._connected){
            this._connected = status;
            this.States.write( "Connected", status);
            // Read running package if connection established now
            if ( status) {
                this.getForegroundApp().then( fApp => this.States.write( "RunningPackage", fApp))
                this.workConnected();
            } else {
                if( !stoppingScript) this.workDisconnected();
            }
        }
    }

    get connected(){ return this._connected }


    async _connect( attempts=1, ignoreError=true, waitAttempt=5000){
        do{
            try{
                this.id = await client.connect( this.ip);
                // Execute code below only if connected status was false and now changed to true 
                if ( !this.connected) {
                    console.log( `Device <${this.name}> (${this.ip}) connected!`);
                    await sleep( 500);
                    this.connected = true;
                }
            }
            catch( err) {
                attempts--;
                this.connected = false;
                if( !ignoreError){
                    console.warn( "CONNECTION_ERROR: " + err);
                    console.warn( `Device <${this.name}> (${this.ip}) not connected! Remaining attempts = ${attempts}${ attempts > 0 ? `. Next attempt in ${waitAttempt/1000}s.` : `` }`);
                }
                if ( attempts > 0) await sleep( waitAttempt);
            }
        } while( !this.connected && attempts > 0)

        return new Promise((resolve, reject) => {
            if ( this.connected) resolve( this.id)
            else reject( `Device <${this.name}> (${this.ip}) not connected!`);
        });
    }

    workDisconnected(){
        if( this.SchedConnCheck === null) { /** Set Schedule to try connecting device */
            this.SchedConnCheck = schedule( getState( getPrae + "Timing.CheckConnection").val, this.init.bind(this) );
            if(dbglog()) console.log( `Schedule "AutoConnect" set for <${this.name}> (${this.ip})`);
        }
        if( this.SchedIdleCheck !== null){ /** Clear Schedule to get idle state  */
            clearSchedule( this.SchedIdleCheck);
            this.SchedIdleCheck = null;
            if(dbglog()) console.log( `Schedule "Check Idle State" cleared for <${this.name}> (${this.ip})`);
        }
    }

    workConnected(){
        if( this.SchedConnCheck !== null){ /** Clear Schedule to connect */
            clearSchedule( this.SchedConnCheck);
            this.SchedConnCheck = null;
            if(dbglog()) console.log( `Schedule "AutoConnect" cleared for <${this.name}> (${this.ip})`);
        }
        if( this.SchedIdleCheck === null){ /** Set Schedule to get idle state */
            this.SchedConnCheck = schedule( getState( getPrae + "Timing.CheckState").val, this.setPlayState.bind(this) );
            if(dbglog()) console.log( `Schedule "Check Idle State" set for <${this.name}> (${this.ip})`);
        }
    }

    disconnect(){
        // disconnect bug in ADBKIT throws always error... therefore ignore error and resolve always
        // disconnect() called only from stop-script function discharge()
        return new Promise(( resolve, reject) => {
            this.connected = false;
            clearSchedule( this.SchedConnCheck);
            this.States.unsubscribe();
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

    async setPlayState(){
        try{
            await this._connect( 3, false);
            let sOut = await this.shell( "dumpsys media_session | grep -m 1 'state=PlaybackState' ");
            let myRe = /position=(-?\d+),\sbuffered/g; // Sometimes negative timestamps >>> "-?"
            let matches = myRe.exec( sOut);
            let actPlaytime = parseInt( matches[1] );
            if ( actPlaytime === 0){
                // Device is playing content
                this.States.write( "State", "idle");
            } else if ( actPlaytime === this.lastPlayTime){
                // Device is paused
                this.States.write( "State", "paused");
            } else if ( actPlaytime > this.lastPlayTime || actPlaytime < this.lastPlayTime){
                // Device is idle
                this.States.write( "State", "playing");
            }
            this.lastPlayTime = actPlaytime;
        }
        catch( err) {
            console.warn( `Error by reading playing time from <${this.name}> (${this.ip})!`);
            console.warn( err)
        }
        
    }

    sendKeyEvent( keyEvent){
        return this._connect( 3, false)
            .then( () => this.shell( "input keyevent " + keyEvent) )
    }

    // Loop needed if App is started and needs time to be loaded (returns null at beginning)
    async getForegroundApp( attempts=5, waitAttempt=1000){
        let foreGroundApp = "";
        do{
            try{
                await this._connect( 3, false);
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
            if ( foreGroundApp !== "") resolve( foreGroundApp)
            else reject( `Error by reading running package from device <${this.name}> (${this.ip})!`);
        });
    }

    get3rdPartyPackages(){
        return new Promise((resolve, reject) => {
            this._connect( 3, false)
                .then( () => this.shell( "pm list packages -3") )
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

    startApp( packName){
        console.log( `Starting package <${packName}>`);
        return this._connect( 3, false).then( () => {
            if( this.Apps.hasOwnProperty( packName)){
                this.shell( ` monkey --pct-syskeys 0 -p ${packName} 1`);
            }
            else Promise.reject( "Package Name not found in predefined Apps!")
        })
    }

    stopApp( packName){
        console.log( `Stopping package <${packName}>`);
        return this._connect( 3, false).then( () => this.shell( `am force-stop ${packName}`) )
    }

    shutdown(){
        console.log( `Shutdown device <${this.name}> (${this.ip})`);
        return this._connect( 3, false).then( () => this.shell( `reboot -p`) )
    }

    reboot(){
        console.log( `Rebooting device <${this.name}> (${this.ip})`);
        return this._connect( 3, false).then( id => client.reboot( id) )
    }
}





let BasicStates = {
    CheckConn: {
        id: setPrae + "Timing.CheckConnection",
        initial: "* * * * *",
        forceCreation: false,
        common: { role: "state", read: true, write: true, name: "Check Connection", type: "string" },
        native: {}
    },
    CheckIdle: {
        id: setPrae + "Timing.CheckState",
        initial: "*/15 * * * * *",
        forceCreation: false,
        common: { role: "state", read: true, write: true, name: "Check for Idle State", type: "string" },
        native: {}
    },
    Log_Debug: {
        id: setPrae + "Log_Debug",
        initial: true,
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



let Devices = [];
let MainSubscribtion = null;
function main() {

    MainSubscribtion = on({id: [ getPrae + "Devices", getPrae + "ADB_Path", getPrae + "RestartScript"], change: "ne", ack: false}, function (obj) {
        // Reset State if button was pushed
        if ( obj.id.split(".").pop() === "RestartScript") setState( setPrae + "RestartScript", false, true)
        discharge();
        setTimeout( () => {
            unsubscribe( MainSubscribtion);
            MainSubscribtion = null;
            Devices = [];
            main();
        }, 1000)
    });

    let stateDevices = getPrae + "Devices";

    if ( stateDevices === '{ "Wohnzimmer": "192.168.0.0", "Schlafzimmer": "192.168.0.0"}' ){
        console.warn( `Please configure state <${stateDevices}> with your own device(s). Script will restart automatically by change of state!`);
    }
    let JsonDevices = {};
    try{
        JsonDevices = JSON.parse( getState( stateDevices).val);
    } catch {
        console.error( `Error parsing state <${stateDevices}> to JSON. Please check JSON syntax. Script will restart automatically by change of state!`);
        return
    }

    let adbPath = getState( getPrae + "ADB_Path").val;

    if ( adbPath === "/your/adb/path"){
        console.warn( `Error: <${getPrae + "ADB_Path"}> is empty. Please configure ADB path. Script will restart automatically by change of state!`);
        return
    }

    client = adb.createClient({ bin: adbPath });
    
    Object.keys( JsonDevices).forEach( device => {
        let ip = JsonDevices[ device];
        let name = device;
        console.log( `Creating new device <${name}> with IP ${ip} ...`)

        if ( validateIpAddress( ip) ) Devices.push( new FireTV( ip, name) )
        else {
            console.error( `Error creating new device ${name} with IP ${ip}! IP has not a valid syntax in state <${stateDevices}>. Script will restart automatically by change of state!`);
        }
    })

    deviceTracker();
    
}
// Create basic states and call main function
pushStates( BasicStates, main);



let Tracker = null
async function deviceTracker(){

    function tracking(){
         // DevID example: {"id":"192.168.192.33:5555","type":"device"}
        Tracker.on('add', DevID => {
            if (dbglog()) console.log( "Device Tracker: added " + JSON.stringify(DevID) )
        })
        Tracker.on('remove', DevID => {
            if (dbglog()) console.log( "Device Tracker: removed " + JSON.stringify(DevID) )
            Devices.forEach( Device => {
                if ( Device.ip === DevID.id.split(":")[0] ) {
                    if (dbglog()) console.log( "Removed Device found in List" )
                    Device.connected = false;
                }
            })
        })
        Tracker.on('change', DevID => {
            if (dbglog()) console.log( "Device Tracker: changed " + JSON.stringify(DevID) )
        })
        Tracker.on('end', () => {
            if (dbglog()) console.log('Device Tracking stopped')
        })
    }
    Tracker = await client.trackDevices(); // Tracker Object needed to be stopped at "discharge()"
    tracking();
}


function discharge(){
    stoppingScript = true;
    Tracker && Tracker.end(); // Check if Tracker is set. Possible unset with wrong configuration!
    Devices.forEach( Device => {
        Device.disconnect()
            .then( DevID => { if ( DevID !== "") console.log( `Device with ID <${DevID}> disconnected`) })
            .catch( err => console.error(err) )
    })
}

onStop( discharge);



