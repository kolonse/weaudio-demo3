let RTC_PACKET_MAX_SIZE = 1500;
class AudioTest {
    constructor(outputDeviceId, file) {
        this.audioContext       = null;
        this.outputDeviceId     = outputDeviceId;
        this.sampleRate         = 16000;
        this.audioWorkletNode   = null;

        this.file               = file;
        this.fileReader         = new FileReader();
        this.fileData           = null;
        this.offset             = 0;

        this.receSAB = new SABRingBuffer(receiveSharedBuffer.state, receiveSharedBuffer.buffer, RTC_PACKET_MAX_SIZE / 4);

        this.Decode_data = new Float32Array(RTC_PACKET_MAX_SIZE / 4);
        this.Decode_data_8 = new Uint8Array(this.Decode_data.buffer);
        this.Decode_data_32 = new Uint32Array(this.Decode_data.buffer);

        this.readTimer          = null;
    }

    start() {
        this.fileReader.readAsArrayBuffer(this.file);
        this.fileReader.onloadend = () => {
            console.log(arguments);
            
            if (!this.fileReader.result || this.fileReader.result.byteLength < 1024) {
                log("package too low or not exist!!!")
                return ;
            }

            this.fileData = new Uint8Array(this.fileReader.result);
            this.createAudioContext()
                .then(this.createWorkletNode.bind(this))
                .then(this.connectWorkletNode.bind(this))
                .then(this.startWorkers.bind(this))
                .catch(console.error);
        }

    }

    stop() {
        this.offset = 0;

        if (this.audioContext) this.audioContext.close();

        if (this.audioWorkletNode) {
            this.audioWorkletNode.disconnect();
            this.audioWorkletNode = null;
        }

        if (this.audioDomNode){
            this.audioDomNode.srcObject = null;
            // this.audioDomNode.stop();
            this.audioDomNode = null;
        }

        if (this.readTimer) {
            clearInterval(this.readTimer);
            this.readTimer = null;
        }
    }

    createAudioContext() {
        this.audioContext = new AudioContext({
            sampleRate : this.sampleRate,
            latencyHint: 0.02
        });
        return new Promise((resolve) =>{resolve();});
    }

    createWorkletNode () {
        let that = this;
        return this.audioContext.audioWorklet.addModule("worklet_test4.js")
            .then(()=>{
                that.audioWorkletNode = new wokletNode(that.audioContext);
                that.audioWorkletNode.port.postMessage({
                    event : "sharedBuffer",
                    sharedBuffer : sharedBuffer
                });
                return new Promise((resolve) =>{resolve();});
            });
    }

    connectWorkletNode() {
        let dest = this.audioContext.createMediaStreamDestination();
        this.audioWorkletNode.connect(dest);

        if (!this.audioDomNode) {
            this.audioDomNode = new Audio();
        }
        this.audioDomNode.srcObject = dest.stream;
        this.audioDomNode.play();

        this.audioDomNode.setSinkId(this.outputDeviceId).catch(err =>{
            console.error(err);
        });
    }

    startWorkers () {
        workers.postMessage("decode", {
            event : "start"
        });

        let int32 = new Uint32Array(1);
        let int8 = new Uint8Array(int32.buffer);

        this.readTimer = setInterval(()=>{
            // console.log("this.offset --> ", this.offset);

            if (this.fileData.length - 12 < this.offset) {
                log("play complete");
                clearInterval(this.readTimer);
                this.readTimer = null;
                return ;
            }
            
            let timestamp = this.fileData.subarray(this.offset, this.offset + 4);
            let level = this.fileData.subarray(this.offset + 4, this.offset + 8);
            let lenBuff = this.fileData.subarray(this.offset + 8, this.offset + 12);
            // console.log(lenBuff);
            int8.set(lenBuff);
            // console.log(int32);
            let len = int32[0];
            // console.log("result -->",len);

            // if (len > 255) {
            //     console.error("package is too large!!!!", len);
            //     clearInterval(this.readTimer);
            //     this.readTimer = null;
            //     log("play error!!!");
            //     return;
            // }

            let rtpData = this.fileData.subarray(this.offset + 12, this.offset + 12 + len);
            this.offset = this.offset + 12 + len ;

            this.Decode_data_32[0] = len;
            this.Decode_data_8.set(rtpData, 4);
            this.receSAB.write(this.Decode_data);
        }, 20);
    }
}