let RTC_PACKET_MAX_SIZE = 1500;

class RtpPacket {
    constructor() {
        this.timestamp = 0;
        this.level = 0;
        this.len = 0;
        this.data = null;
    }
};

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
        this.receSAB            = new SABRingBuffer(receiveSharedBuffer.state, receiveSharedBuffer.buffer, RTC_PACKET_MAX_SIZE / 4);

        this.Decode_data        = new Float32Array(RTC_PACKET_MAX_SIZE / 4);
        this.Decode_data_8      = new Uint8Array(this.Decode_data.buffer);
        this.Decode_data_32     = new Uint32Array(this.Decode_data.buffer);

        this.readTimer          = null;
        this.rtpPckArray        = [];
        this.isRunning          = false;

        this.onplayend          = null;
        this.onplaystart        = null;
    }

    passRtp() {
        log("passing audio, please wait a later!!!");
        return new Promise((resolve) => {
            let int32 = new Uint32Array(1);
            let int8 = new Uint8Array(int32.buffer);  

            setTimeout(()=>{
                for (let offset = 0; offset  + 12 < this.fileData.length;) {
                    let packet = new RtpPacket();
                
                    let timestamp = this.fileData.subarray(offset, offset + 4);
                    let level = this.fileData.subarray(offset + 4, offset + 8);
                    let lenBuff = this.fileData.subarray(offset + 8, offset + 12);
                    
                    int8.set(timestamp);
                    packet.timestamp = int32[0];
    
                    int8.set(level);
                    packet.level = int32[0];
    
                    int8.set(lenBuff);
                    packet.len = int32[0];
    
                    packet.data = this.fileData.subarray(offset + 12, offset + 12 + packet.len);
                    offset = offset + 12 + packet.len ;

                    this.rtpPckArray.push(packet);
                }

                log("passing audio complete!!!");
                resolve();
            }, 1);
        });
    }

    start() {
        if (this.isRunning) return ;
        this.fileReader.readAsArrayBuffer(this.file);
        this.fileReader.onloadend = () => {
            console.log(arguments);
            
            if (!this.fileReader.result || this.fileReader.result.byteLength < 1024) {
                log("package too low or not exist!!!")
                return ;
            }

            log("file read complete!!!")
            this.fileData = new Uint8Array(this.fileReader.result);
            
            this.passRtp()
                .then(this.createAudioContext.bind(this))
                .then(this.createWorkletNode.bind(this))
                .then(this.connectWorkletNode.bind(this))
                .then(this.startWorkers.bind(this))
                .catch(console.error);
        }

        this.isRunning = true;
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
        if (this.onplaystart) this.onplaystart();

        let timeStep = 0;
        let timeBegin = 0;
        let timeEnd = 0;
        this.readTimer = setInterval(()=>{
            if (this.offset >= this.rtpPckArray.length) {
                clearInterval(this.readTimer);
                this.readTimer = null;
                if (this.onplayend) this.onplayend();
                return ;
            }
            
            let packet = this.rtpPckArray[this.offset];

            if (timeStep === 0) {
                timeStep = packet.timestamp;
            }

            if (timeBegin === 0) {
                timeBegin = new Date().getTime();
            }

            if (packet.timestamp <= timeStep) {
                let rtpData = packet.data;
                this.offset += 1;
    
                this.Decode_data_32[0] = packet.len;
                this.Decode_data_8.set(rtpData, 4);
                this.receSAB.write(this.Decode_data);
            } else {
                timeEnd = new Date().getTime();
                timeStep += timeEnd - timeBegin;
                timeBegin = timeEnd;
            }
        }, 5);
    }
}