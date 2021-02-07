let logDom = document.getElementById("log");

function log(str) {
    logDom.textContent = str;
}

let RTC_PACKET_MAX_SIZE = 1500;
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
            useWebsocket : opt.useWebsocket,
            useAPM : opt.useAPM,
            usePeer : opt.usePeer,
            dropPackage : opt.dropPackage || 0
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

    shouldDropPackage() {
        return Math.floor(Math.random() * 100) < this.opt.dropPackage;
    }

    start() {
        navigator.mediaDevices.getUserMedia( {audio : {deviceId: this.inputDeviceId, autoGainControl: this.opt.useAPM,noiseSuppression:this.opt.useAPM,echoCancellation:this.opt.useAPM }} )
            .then(this.createAudioContext.bind(this))
            .then(this.createWorkletNode.bind(this))
            .then(this.connectWorkletNode.bind(this))
            .then(this.startNetwork.bind(this))
            .then(this.startWorkers.bind(this))
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
            let url = window.location.protocol + "//" + window.location.host + "/udp";
            //let url = "http://127.0.0.1:9555"
            this.network = new WuSocket(url);
            this.network.onopen = ()=>{
                log("udp is testing!!!!");
                this.check_timer_interval = setInterval( this.Check_timer.bind(this), 100);
            }
            this.network.onmessage = this.Recv_Pck.bind(this);
        } else if (this.opt.useWebsocket){
            let proto = window.location.protocol.indexOf("https") === -1 ? "ws://" : "wss://"
            let url = proto + window.location.host + "/websocket";
            this.network = new WebSocket(url);
            this.network.binaryType = "arraybuffer";
            this.network.onopen = () =>{
                log("websocket running");
                setInterval( () =>{
                    if (this.network.readyState === 1) {
                        this.Send_timer();
                    }
                }, 10);
            }
            this.network.onclose = () =>{
                log("websocket closed");
            }

            this.network.onerror = (err) =>{
                console.error(err);
            }
            this.network.onmessage = this.Recv_Pck.bind(this);
        } else {
            setInterval( () =>{
                if (!this.sendSAB) return ;

                let data = null;
                while( (data = this.sendSAB.read() ) !== null) {
                    this.Encode_data.set(data);
                    this.Send_Pck(this.Encode_data);
                    break;
                }
            }, 10);
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
        if (this.shouldDropPackage()) {
            return ;
        }

        if (this.opt.useUDP) {
            this.network.send(data.buffer);
        } else if (this.opt.useWebsocket) {
            this.network.send(data.buffer);
        }else {
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
        } else if (data instanceof Blob) {
            data.arrayBuffer().then((d) => {
                let buff = new Uint8Array(d);
                this.Decode_data_8[0] = buff.length;
                this.Decode_data_8.set(buff, 1);
    
                this.receSAB.write(this.Decode_data);
            });
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

    async connectWorkletNode() {
        this.audioStreamNode.connect(this.audioWorkletNode);
        
        let dest = this.audioContext.createMediaStreamDestination();
        this.audioWorkletNode.connect(dest);

        if (!this.audioDomNode) {
            this.audioDomNode = new Audio();
            
        }
        this.audioDomNode.srcObject = await this.chromeAecWorkAround(dest.stream);
        this.audioDomNode.play();

        this.audioDomNode.setSinkId(this.outputDeviceId).catch(err =>{
            console.error(err);
        });
    }

    async chromeAecWorkAround(sourcestream) {
        if (!this.opt.usePeer) {
            return sourcestream;
        }
        if (this.rtcConnectionA || this.rtcConnectionB) {
            return false;
        }
        let rtcConnection = null;
        let rtcLoopbackConnection = null;
        let loopbackStream = new MediaStream(); // this is the stream you will read from for actual audio output

        const offerOptions = {
            offerVideo: true,
            offerAudio: true,
            offerToReceiveAudio: false,
            offerToReceiveVideo: false,
        };

        let offer, answer;

        rtcConnection = new RTCPeerConnection();
        rtcLoopbackConnection = new RTCPeerConnection();

        rtcConnection.onicecandidate = e =>
            e.candidate && rtcLoopbackConnection.addIceCandidate(new RTCIceCandidate(e.candidate));
        rtcLoopbackConnection.onicecandidate = e =>
            e.candidate && rtcConnection.addIceCandidate(new RTCIceCandidate(e.candidate));

        rtcLoopbackConnection.ontrack = (e) => {
            e.streams[0].getTracks().forEach((track) => {
                loopbackStream.addTrack(track);
            });
        };

        // setup the loopback
        rtcConnection.addStream(sourcestream); // this stream would be the processed stream coming out of Web Audio API destination node
        offer = await rtcConnection.createOffer(offerOptions);
        offer.sdp = offer.sdp.replace('SAVPF 111', 'SAVPF 10 111');
        offer.sdp = offer.sdp.replace('a=rtpmap:111 opus/48000/2', 'a=rtpmap:10 L16/16000\na=rtpmap:111 opus/48000/2');
        await  rtcConnection.setLocalDescription(offer);
        await  rtcLoopbackConnection.setRemoteDescription(offer);
        answer = await  rtcLoopbackConnection.createAnswer();
        answer.sdp = answer.sdp.replace('SAVPF 111', 'SAVPF 10 111');
        answer.sdp = answer.sdp.replace('a=rtpmap:111 opus/48000/2', 'a=rtpmap:10 L16/16000\na=rtpmap:111 opus/48000/2');
        await  rtcLoopbackConnection.setLocalDescription(answer);
        await  rtcConnection.setRemoteDescription(answer);
        //end rtcloopbackhack.js
        this.rtcConnectionA = rtcConnection;
        this.rtcConnectionB = rtcLoopbackConnection;
        return loopbackStream;
    }

    startWorkers () {
        workers.postMessage("encode", {
            event : "start"
        });

        workers.postMessage("decode", {
            event : "start"
        });        
    }
}