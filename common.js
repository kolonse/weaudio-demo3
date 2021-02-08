class wokletNode extends AudioWorkletNode {
    constructor(context) {
        super(context, 'myworklet');
        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
    }
}

class Workers {
    constructor() {
        this.workers = {};
    }

    start(name, path, cb) {
        if (this.workers[name]) return ;
        let worker = new Worker(path);
        this.workers[name] = worker;
        let that = this;
        worker.onmessage = cb || function() {
            that.onmessage.call(that, name, ...arguments)
        }
    }

    postMessage(name, ...args) {
        let worker = this.workers[name];
        if (!worker) return ;

        worker.postMessage.apply(worker, args);
    }

    onmessage(name, ...args) {

    }
}

let sharedBuffer = {
    inputState: new SharedArrayBuffer(5 * 4),
    inputBuffer: new SharedArrayBuffer(640 * 4 * 4),

    outputState: new SharedArrayBuffer(5 * 4),
    outputBuffer: new SharedArrayBuffer(640 * 4 * 4),
}

let sendSharedBuffer = {
    state : new SharedArrayBuffer(5 * 4),
    buffer : new SharedArrayBuffer(100 * 1500 * 4 * 4)
}

let receiveSharedBuffer = {
    state : new SharedArrayBuffer(5 * 4),
    buffer : new SharedArrayBuffer(100 * 1500 * 4 * 4)
}

let logDom = document.getElementById("log");
function log(str) {
    if (logDom.textContent === "") {
        logDom.textContent = str;
    } else {
        logDom.textContent = logDom.textContent + "\n" + str;
    } 
    logDom.scrollTop = logDom.scrollHeight; 
}