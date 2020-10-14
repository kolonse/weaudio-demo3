var g_sharbuffer = null;
var g_encodeSharedBufferState = null;
var g_encodeSharedBufferData = null;

var g_decodeSharedBufferState = null;
var g_decodeSharedBufferData = null;
var g_decodeSharedBufferSig = null;

let now = 0, last = 0;
class myworklet extends AudioWorkletProcessor {
    constructor() {
        // The super constructor call is required.
        super();
        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
        var data = event.data;
        switch (data.status) {
            case "sharedBuffer":{
                const sharebuf = data.data;
                g_sharbuffer = sharebuf;
                g_decodeSharedBufferSig = new Int32Array(g_sharbuffer.outputSig);
                console.log("AudioWorkletProcessor", g_sharbuffer);
                break;
            }
        }
    }



    process(inputs, outputs, parameters) {
        now = new Date().getTime();
        if (last != 0) {
            console.log( "worklet: ", now - last) ;
        }
        last = now;

        if (inputs.length === 0 || inputs[0].length === 0) return true;
        if (!g_sharbuffer) return true;

        Atomics.store(g_decodeSharedBufferSig, 0, 1);
        Atomics.notify(g_decodeSharedBufferSig, 0, 1);
        return true;
    }
}

registerProcessor('myworklet', myworklet);