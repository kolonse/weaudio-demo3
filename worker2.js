
var g_sharbuffer = null;
var g_encodeSharedBufferState = null;
var g_encodeSharedBufferData = null;

var g_decodeSharedBufferState = null;
var g_decodeSharedBufferData = null;


function Read_Data() {
    let now = 0;
    for (;;) {
        now = new Date().getTime();
        Atomics.wait(g_decodeSharedBufferSig, 0, 0) ;
        let sig = Atomics.load(g_decodeSharedBufferSig, 0);
        // console.log(new Date().getTime() - now);

        Atomics.store(g_decodeSharedBufferSig, 0, 0);
    }
}

self.addEventListener('message', function (e) {
    var message = e.data;

    switch(message.command) {
        case "init" : {
            g_sharbuffer = message.data;
            g_decodeSharedBufferSig = new Int32Array(g_sharbuffer.outputSig);
            g_decodeSharedBufferSig[0] = 0;
            setTimeout(Read_Data, 5);
            break;
        }
    }
});

