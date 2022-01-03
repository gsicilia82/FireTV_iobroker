const adb = require('adbkit')
const request = require("request");

/**
 * 
 * Script zur Steuerung von FireTV Sticks und zum Auslesen verschiedener Zustände
 * https://github.com/gsicilia82/FireTV_iobroker
 * 
 * Bitte nichts unterhalb von diesem Kommentar verändern. Jegliche Konfiguration erfolgt innerhalb der erstellten States
 * Hauptpfad ist: "javascript.X.FireTV" (X = Instanz, beliebig)
 * 
 */


let thisVersion = "v0.0.9"

let praefixStates = `javascript.${instance}.FireTV.`;

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
        let latest = JSON.parse( result).pop().ref.split("/")[2];
        console.log( "Checking for Script Update...");
        if ( latest > thisVersion) {
            console.log( "Script Update available to version: " + latest);
            setState( praefixStates + "UpdateAvailable", true);
        } else {
            console.log( "No Script Update available.");
            setState( praefixStates + "UpdateAvailable", false);
        }
    }).on("error", err => {
        console.warn( "Error on checking for updates:");
        console.warn( err) 
    });
}
let SchedUpdate = schedule("0 16 * * *", checkUpdate);


function pushStates( JsStates, cb) {
    let actStateName, State;
    let create = () => {
        createState( State.id, State.common, State.native, () => {
            setTimeout( ()=>{ 
                if ( getState( State.id).val === null) setState( State.id, State.initial, true);
                delete ownJsStates[ actStateName];
                pushStates( ownJsStates, cb);
            }, 200)
        });
    }
    let ownJsStates = JSON.parse( JSON.stringify( JsStates));
    if ( Object.keys( ownJsStates).length === 0){
        cb();
    } else {
        let ArrStateNames = Object.keys( ownJsStates);
        actStateName = ArrStateNames[0]
        State = ownJsStates[ actStateName];
        let exists = existsState( State.id);
        // Workaround needed if REDIS is used! createState() with initial value not possible!
        if ( exists && State.forceCreation){
            deleteState( State.id, ()=>{
                create();
            });
        } else {
            create();
        }
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
        this.praefixStates = `${praefixStates}${this.devPart}.`;
        this.StateDef;  // Includes whole state definitions
        this.StateSubs = []; // Includes each single state for Subscribtion
        this.Subscribtion = null;
        this._init();
    }

    _init(){

        this.StateDef = {
            /* id's will be filled to complete id including instance inside loop below */
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
                forceCreation: true,
                common: { role: "state", read: true, write: true, name: `StartPackage ${this.FireTV.name}`, type: "string", states: {} },
                native: {}
            },
            StopPackage: {
                id: "Package.StopPackage",
                initial: "",
                forceCreation: true,
                common: { role: "state", read: true, write: true, name: `StopPackage ${this.FireTV.name}`, type: "string", states: {}},
                native: {}
            },
            StopForegroundPackage: {
                id: "Package.StopForegroundPackage",
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `StopForegroundPackage ${this.FireTV.name}`, type: "boolean"},
                native: {}
            },
            RunningPackage: {
                id: "Package.RunningPackage",
                initial: "",
                forceCreation: true,
                common: { role: "state", read: true, write: false, name: `RunningPackage ${this.FireTV.name}`, type: "string"},
                native: {}
            },
            ReadInstalledPackages: {
                id: "Package.ReadInstalledPackages",
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `ReadInstalledPackages ${this.FireTV.name}`, type: "boolean"},
                native: {}
            },
            State: {
                id: "State",
                initial: "",
                forceCreation: true,
                common: { role: "state", read: true, write: false, name: `Device State ${this.FireTV.name}`, type: "string"},
                native: {}
            },
            State_Trigger: {
                id: "State_Trigger",
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `State_Trigger ${this.FireTV.name}`, type: "boolean"},
                native: {}
            },
            PlayerStop: {
                id: "PlayerStop",
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `Stop Mediaplayer ${this.FireTV.name}`, type: "boolean" },
                native: {}
            },
            PlayerPause: {
                id: "PlayerPause",
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `Pause/Play Mediaplayer ${this.FireTV.name}`, type: "boolean" },
                native: {}
            },
            Reboot: {
                id: "Reboot",
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `Reboot ${this.FireTV.name}`, type: "boolean" },
                native: {}
            },
            Sleep: {
                id: "Sleep",
                initial: false,
                forceCreation: true,
                common: { role: "button", read: true, write: true, name: `Sleep ${this.FireTV.name}`, type: "boolean" },
                native: {}
            },
            Connected: {
                id: "Connected",
                initial: false,
                forceCreation: true,
                common: { role: "state", read: true, write: false, name: `Connection state ${this.FireTV.name}`, type: "boolean" },
                native: {}
            }
        };

        Object.keys( this.StateDef).forEach( ele => {
            let completeID = `${this.praefixStates}${ this.StateDef[ ele].id}`;
            this.StateDef[ ele].id = completeID;
            this.StateSubs.push( completeID);
        });

        pushStates( this.StateDef, () => {
            if (dbglog()) console.log(`States created for device <${this.FireTV.name}> (${this.FireTV.ip})`);
            this.subscribe();
            this.FireTV.init();
        });

    }

    subscribe(){
        this.Subscribtion = on({id: this.StateSubs, change: "ne", ack: false}, ( obj) => {
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
                    this.FireTV.connect()
                        .then( () => this.FireTV.startApp( value) )
                        .catch( err => console.error( err) )
                        .finally( ()=> {
                            this.FireTV.disconnect( "StartPackage");
                            this.write("StartPackage", "");
                        })
                    break;
                case "StopPackage":
                    this.FireTV.connect()
                        .then( () => this.FireTV.stopApp( value) )
                        .catch( err => console.error( err) )
                        .finally( ()=> {
                            this.FireTV.disconnect( "StopPackage");
                            this.write("StopPackage", "");
                        })
                    break;
                case "StopForegroundPackage":
                    this.FireTV.connect()
                        .then( () => this.FireTV.setForegroundApp() )
                        .then( () => this.FireTV.stopApp( this.read( "RunningPackage")) )
                        .catch( err => console.error( err) )
                        .finally( ()=> {
                            this.FireTV.disconnect( "StopPackage");
                            this.write("StopForegroundPackage", false);
                        })
                    break;
                case "ReadInstalledPackages":
                    this.FireTV.connect()
                        .then( () => this.FireTV.get3rdPartyPackages() )
                        .catch( err => console.error( err) )
                        .finally( ()=> {
                            this.FireTV.disconnect( "ReadInstalledPackages");
                            this.write("ReadInstalledPackages", false);
                        })
                    break;
                case "State_Trigger":
                    this.FireTV.connect()
                        .then( () => this.FireTV.checkStateAndPackage() ) // disconnect included in checkStateAndPackage()
                        .catch( err => console.error( err) )
                        .finally( ()=> this.write("State_Trigger", false) )
                    break;
                case "Reboot":
                    this.FireTV.connect()
                        .then( () => this.FireTV.reboot() )
                        .catch( err => console.error( err) )
                        .finally( ()=> {
                            this.FireTV.disconnect( "Reboot");
                            this.write("Reboot", false);
                        })
                    break;
                case "Sleep":
                    this.FireTV.connect()
                        .then( () => this.FireTV.sleep() )
                        .catch( err => console.error( err) )
                        .finally( ()=> {
                            this.FireTV.disconnect( "Sleep");
                            this.write("Sleep", false);
                        })
                    break;
                case "PlayerStop":
                    this.FireTV.connect()
                        .then( () => this.FireTV.sendKeyEvent( "KEYCODE_MEDIA_STOP") )
                        .catch( err => console.error( err) )
                        .finally( ()=> {
                            this.FireTV.disconnect( "PlayerStop");
                            this.write("PlayerStop", false);
                        })
                    break;
                case "PlayerPause":
                    this.FireTV.connect()
                        .then( () => this.FireTV.sendKeyEvent( "KEYCODE_MEDIA_PLAY_PAUSE") )
                        .catch( err => console.error( err) )
                        .finally( ()=> {
                            this.FireTV.disconnect( "PlayerPause");
                            this.write("PlayerPause", false);
                        })
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
        let intvlTime = getState( praefixStates + "Timing.CheckIfNotConnected").val * 1000;
        if ( intvlTime < 5000){
            intvlTime = 5000;
            setState( praefixStates + "Timing.CheckIfNotConnected", 5);
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
        let intvlTime = getState( praefixStates + "Timing.CheckIfConnected").val * 1000;
        if ( intvlTime < 5000){
            intvlTime = 5000;
            setState( praefixStates + "Timing.CheckIfConnected", 5);
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
        forceCreation: true,
        common: { role: "state", read: true, write: true, name: "Script Update Available", type: "boolean" },
        native: {}
    },
    Version: {
        id: praefixStates + "Version",
        initial: thisVersion,
        forceCreation: true,
        common: { role: "state", read: true, write: true, name: "Script Version", type: "string" },
        native: {}
    },
    Devices: {
        id: praefixStates + "Devices",
        initial: DefaultDevices,
        forceCreation: false,
        common: { role: "state", read: true, write: true, name: "Config your Devices", type: "string" },
        native: {}
    },
    ADB_Path: {
        id: praefixStates + "ADB_Path",
        initial: DefaultAdbPath,
        forceCreation: false,
        common: { role: "state", read: true, write: true, name: "Config your Devices", type: "string" },
        native: {}
    },
    RestartScript: {
        id: praefixStates + "RestartScript",
        initial: false,
        forceCreation: true,
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
    let adbPath = getState( praefixStates + "ADB_Path").val;
    if ( adbPath === DefaultAdbPath){
        console.warn( `ADB path in state <${praefixStates + "ADB_Path"}> is set to default. Please configure ADB path. Script will restart automatically by change of state!`);
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

    MainSubscribtion = on({id: [ praefixStates + "Devices", praefixStates + "ADB_Path", praefixStates + "RestartScript", praefixStates + "Timing.CheckIfConnected", praefixStates + "Timing.CheckIfNotConnected"], change: "ne", ack: false}, function (obj) {
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
            .then( DevID => { if ( DevID !== "") console.log( `Device with ID <${DevID}> disconnected`) })
            .catch( err => console.error(err) )
    })
}

onStop( discharge);



