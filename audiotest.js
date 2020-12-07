let logDom = document.getElementById("log");

function log(str) {
    logDom.textContent = str;
}

let RTC_PACKET_MAX_SIZE = 200;
class AudioTest {
    constructor(inputDeviceId, outputDeviceId, opt) {
        this.audioContext       = null;//new AudioContext();
        this.audioStreamNode    = null;
        this.audioStream        = null;
        this.inputDeviceId      = inputDeviceId;
        this.outputDeviceId     = outputDeviceId;
        this.sampleRate         = 16000;
        this.audioWorkletNode   = null;
        this.opt                = {
            useUDP : opt.useUDP ? true : false,
            url : opt.url || "https://10.100.50.80:9000/udp"
        } ;

        this.sendSAB = new SABRingBuffer(sendSharedBuffer.state, sendSharedBuffer.buffer, RTC_PACKET_MAX_SIZE / 4);
        this.receSAB = new SABRingBuffer(receiveSharedBuffer.state, receiveSharedBuffer.buffer, RTC_PACKET_MAX_SIZE / 4);
        this.network = null;

        this.Encode_data = new Float32Array(RTC_PACKET_MAX_SIZE / 4);
        this.Encode_data_8 = new Uint8Array(this.Encode_data.buffer);

        this.Decode_data = new Float32Array(RTC_PACKET_MAX_SIZE / 4);
        this.Decode_data_8 = new Uint8Array(this.Decode_data.buffer);

        this.sendSeq = 0;
        this.recvSeq = 0;
        this.lastRecvSeq = 0;
        this.stableCount = 0;
        this.maxStableCount = 200;

        this.check_timer_interval = null;
    }

    start() {
        navigator.mediaDevices.getUserMedia( {audio : {deviceId: this.inputDeviceId, autoGainControl: true,noiseSuppression:true,echoCancellation:true }} )
            .then(this.createAudioContext.bind(this))
            .then(this.createWorkletNode.bind(this))
            .then(this.connectWorkletNode.bind(this))
            .then(this.startNetwork.bind(this))
            .catch(console.error);
    }

    stop() {
        if (this.audioContext) this.audioContext.close();

        if (this.audioStreamNode) {
            this.audioStreamNode.disconnect();
            this.audioStreamNode = null;
        }


        if (this.audioWorkletNode) {
            this.audioWorkletNode.disconnect();
            this.audioWorkletNode = null;
        }

        if (this.audioDomNode){
            this.audioDomNode.srcObject = null;
            // this.audioDomNode.stop();
            this.audioDomNode = null;
        }

        if (this.audioStream) {
            const tracks = this.audioStream.getAudioTracks();
            tracks.forEach((track) => {
                track.stop()
            });

            this.audioStream = null;
        }
    }

    startNetwork() {
        if (this.opt.useUDP) {
            this.network = new WuSocket(this.opt.url);
            this.network.onopen = ()=>{
                log("udp is testing!!!!");
                this.check_timer_interval = setInterval( this.Check_timer.bind(this), 100);
            }
            this.network.onmessage = this.Recv_Pck.bind(this);
        } else {
            setInterval( this.Send_timer.bind(this), 10);
        }
    }

    Send_timer() {
        if (!this.sendSAB) return ;

        let data = null;
        while( (data = this.sendSAB.read() ) !== null) {
            this.Encode_data.set(data);
            let len = this.Encode_data_8[0];
            let buff = this.Encode_data_8.subarray(1, 1 + len);
            let sendData = new Uint8Array(len);
            sendData.set(buff);

            this.Send_Pck(sendData);
            break;
        }

        // this.network.send("check ==>" + this.sendSeq );
        // this.sendSeq ++;
    }

    Send_Pck(data) {
        if (this.opt.useUDP) {
            this.network.send(data.buffer);
        } else {
            this.receSAB.write(data);
        }
    }

    Check_timer() {
        this.network.send("check ==>" + this.sendSeq );
        this.sendSeq ++;
        if (this.sendSeq > this.maxStableCount) {
            clearInterval(this.check_timer_interval);
            setInterval( this.Send_timer.bind(this), 10);
            log("udp is working!!!!");
        }
    }

    Recv_Pck(evt) {
        let data = evt.data;
        if (typeof(data) === "string") {
            console.log(data, typeof(data));
        } else {
            // let buff = new Float32Array(data);
            // this.receSAB.write(buff);
            let buff = new Uint8Array(data);
            this.Decode_data_8[0] = buff.length;
            this.Decode_data_8.set(buff, 1);

            this.receSAB.write(this.Decode_data);
        }
    }

    createAudioContext(stream) {
        this.audioContext = new AudioContext({
            sampleRate : this.sampleRate,
            latencyHint: 0.02
        });
        this.audioStream = stream;
        this.audioStreamNode = this.audioContext.createMediaStreamSource(stream);
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
        this.audioStreamNode.connect(this.audioWorkletNode);
        
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
}