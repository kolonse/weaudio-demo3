class wokletNode extends AudioWorkletNode {
    constructor(context, str="myworklet") {
        super(context, str);
        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
    }
}

class Workers {
    constructor() {
        this.workers = {};
    }

    start(name, path, cb, isModule = false) {
        if (this.workers[name]) return ;
        let worker = new Worker(path, isModule ? {type:"module", name:name} : {name:name});
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

class PeerPair {
    constructor() {
        this.srcStream = null;
        this.dstStream = null;
        this.peerSrc = null;
        this.peerDst = null;
    }
    Close() {
        if (this.peerSrc) {
            this.peerSrc.close();
            this.peerSrc = null;
        }

        if (this.peerDst) {
            this.peerDst.close();
            this.peerDst = null;
        }

        if (this.dstStream) {
            const tracks = this.dstStream.getAudioTracks();
            tracks.forEach((track) => {
                track.stop()
            });

            this.dstStream = null;
        }
    }
    async Connect(stream) {
        this.srcStream = stream;

        if (this.peerSrc || this.peerDst) {
            return null;
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
        rtcConnection.addStream(this.srcStream); // this stream would be the processed stream coming out of Web Audio API destination node
        offer = await rtcConnection.createOffer(offerOptions);
        // offer.sdp = offer.sdp.replace('SAVPF 111', 'SAVPF 10 111');
        // offer.sdp = offer.sdp.replace('a=rtpmap:111 opus/48000/2', 'a=rtpmap:10 L16/16000\na=rtpmap:111 opus/48000/2');
        await  rtcConnection.setLocalDescription(offer);
        await  rtcLoopbackConnection.setRemoteDescription(offer);
        answer = await  rtcLoopbackConnection.createAnswer();
        // answer.sdp = answer.sdp.replace('SAVPF 111', 'SAVPF 10 111');
        // answer.sdp = answer.sdp.replace('a=rtpmap:111 opus/48000/2', 'a=rtpmap:10 L16/16000\na=rtpmap:111 opus/48000/2');
        await  rtcLoopbackConnection.setLocalDescription(answer);
        await  rtcConnection.setRemoteDescription(answer);
        //end rtcloopbackhack.js
        this.peerSrc = rtcConnection;
        this.peerDst = rtcLoopbackConnection;
        this.dstStream = loopbackStream;
        return this.dstStream;
    }

    async Connects(streams) {
        this.srcStream = streams;

        if (this.peerSrc || this.peerDst) {
            return null;
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
                console.log("loopback stream =>",track)
                loopbackStream.addTrack(track);
            });
        };

        // setup the loopback
        for (let i = 0;i < streams.length;i ++) {
            rtcConnection.addStream(streams[i]);
        }
        // rtcConnection.addStream(this.srcStream); // this stream would be the processed stream coming out of Web Audio API destination node
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
        this.peerSrc = rtcConnection;
        this.peerDst = rtcLoopbackConnection;
        this.dstStream = loopbackStream;
        // setTimeout(async () => {
        //     let stats = await rtcLoopbackConnection.getStats();
        //     stats.forEach(v => {
        //         console.log(v);
        //     })
        //     // console.log(stats);
        // }, 5000);
        return this.dstStream;
    }

    async ConnectsWithCodec(streams, codec) {
        this.srcStream = streams;

        if (this.peerSrc || this.peerDst) {
            return null;
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
                console.log("loopback stream =>",track)
                loopbackStream.addTrack(track);
            });
        };

        // setup the loopback
        for (let i = 0;i < streams.length;i ++) {
            rtcConnection.addStream(streams[i]);
        }
        // rtcConnection.addStream(this.srcStream); // this stream would be the processed stream coming out of Web Audio API destination node
        offer = await rtcConnection.createOffer(offerOptions);
        
        let modifySDP = function(sdp, cc) {
            if (cc != "default") {
                let ccIndex = 111;
                if (cc.includes("L16")) {
                    ccIndex = 10;
                }

                sdp = sdp.replace('SAVPF 111', 'SAVPF ' + ccIndex + " 111");
                sdp = sdp.replace('a=rtpmap:111 opus/48000/2', 'a=rtpmap:' + ccIndex + ' ' + cc + '\na=rtpmap:111 opus/48000/2');
            }

            return sdp;
        }
        offer.sdp = modifySDP(offer.sdp, codec);
        console.log(offer.sdp);

        await  rtcConnection.setLocalDescription(offer);
        await  rtcLoopbackConnection.setRemoteDescription(offer);
        answer = await  rtcLoopbackConnection.createAnswer();
        answer.sdp = modifySDP(answer.sdp, codec);
        console.log(answer.sdp);
        await  rtcLoopbackConnection.setLocalDescription(answer);
        await  rtcConnection.setRemoteDescription(answer);
        //end rtcloopbackhack.js
        this.peerSrc = rtcConnection;
        this.peerDst = rtcLoopbackConnection;
        this.dstStream = loopbackStream;
        return this.dstStream;
    }
}

let sharedBuffer = {
    inputState: new SharedArrayBuffer(5 * 4),
    inputBuffer: new SharedArrayBuffer(640 * 4 * 4),

    outputState: new SharedArrayBuffer(5 * 4),
    outputBuffer: new SharedArrayBuffer(640 * 4 * 4),

    shareAudioState : new SharedArrayBuffer(5 * 4),
    shareAudioBuffer : new SharedArrayBuffer(10 * 48 * 128 * 4 * 4),

    aecMicState: new SharedArrayBuffer(5 * 4),
    aecMicBuffer: new SharedArrayBuffer(640 * 4 * 4),

    aecShareState: new SharedArrayBuffer(5 * 4),
    aecShareBuffer: new SharedArrayBuffer(640 * 4 * 4),
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


let EVENT_TYPE = {
    start_share_audio : 1,
    stop_share_audio : 2,
    
    // start_share_audio_res:3,
    // stop_share_audio_res:4
};

class CommunicationWithMainAndSubHTML {
    constructor(MeWindow, OtherWindow, MeHtml, OtherHtml) {
        this.MeWindow       = MeWindow;
        this.OtherWindow    = OtherWindow;

        this.MeHtml         = MeHtml;
        this.OtherHtml      = OtherHtml;

        this.listenEventList = {};

        this.MeWindow.addEventListener('message',(event) =>{
            let type = event.data.type;
            let data = event.data.data;
            
            if (this.listenEventList[type] && this.listenEventList[type] instanceof Function) {
                this.listenEventList[type](data);
            }
        }, false);
    }

    postMessage(type, data, callback) {
        if (!EVENT_TYPE[type]) {
            console.error("not support post type : ", type);
            return ;
        }

        if (callback instanceof Function) {
            this.listenEventList[EVENT_TYPE[type]] = callback;
        }

        this.OtherWindow.postMessage({type: EVENT_TYPE[type], data : data}, this.OtherHtml);
    }

    on (type, callback) {
        if (!EVENT_TYPE[type]) {
            console.error("not support listen type : ", type);
            return ;
        }

        if (!callback instanceof Function) {
            console.error("should have a callback function");
            return ;
        }

        this.listenEventList[EVENT_TYPE[type]] = callback;
    }
}