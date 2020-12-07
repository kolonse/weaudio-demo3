
class RTCPeerConnectionUtil {

    constructor() {
        this.rtcPeerConnection = null;
        this.dataChannel = null;
        /**
         * indicate this is video dataChannel or audio dataChannel
         * @type {null}
         */
        this.dataChannelLabel = null;
        this.messageListener = null;
        this.rtcPeerConnectionCreatedListener = null;
        this.reconnectCount = 0;
        this.reconnectMax = 10;
        this.reconnectCountBetweenCloseAndOpenAndSetTo0WhenDCOpen = 0;
        this.connectionID  = null;
        this.pubSubTokenList = [];
        this.isForceClosed = false;
        this.SEND_VIDEO_PUB_SUB_EVENT = "RTCPeerConnectionUtil.VIDEO.SENDDATA";
        this.reconnectRTCPeerConnectionThrottle = throttle(() => {
            this.reconnectRTCPeerConnection();
        }, 2000);
        this.timeoutThenCloseInterval = null;
        this.userid = null;
        this.connectionType = null;
    }

    setUserid(userid) {
        this.userid = userid;
    }
    setConnectionType(connectionType) {
        this.connectionType = connectionType;
    }

    async initConnection(connectionID, dataChannelLabel = 'ZoomWebclientVideoDataChannel') {
        if (!this.isSupportDataChannel()) {
            return;
        }
        this.dataChannelLabel = dataChannelLabel;
        this.connectionID = connectionID;

        this.rtcPeerConnection = new RTCPeerConnection({
            iceCandidatePoolSize: 1
        });
        this.rtcPeerConnection.addEventListener("close", ev => {
            console.log("rtcPeerConnection.onclose", ev);
            this.clear();
            this.close();
            this.reconnectRTCPeerConnectionThrottle();
        });
        this.rtcPeerConnection.addEventListener("icecandidate", (ev) => {
            console.log("onicecandidate", ev)
        });
        this.rtcPeerConnection.addEventListener("iceconnectionstatechange", (ev) => {
            let rtc = this.rtcPeerConnection;
            if (rtc.iceConnectionState === "failed" ||
                rtc.iceConnectionState === "disconnected" ||
                rtc.iceConnectionState === "closed") {

                console.log(`${this.dataChannelLabel} iceconnectionstatechange`, rtc.iceConnectionState);
                rtc.close();
            }
        });


        this.createDataChannel();
        // this.addDataChannelSpeedMonitor();

        await this.rtcPeerConnection.createOffer().then(async offer => {
            console.log('original offer', JSON.stringify(offer));
            offer.sdp = offer.sdp.replace(/a=ice-ufrag:.+/g, `a=ice-ufrag:${connectionID}`);
            console.log('modified offer', offer);
            return this.rtcPeerConnection.setLocalDescription(offer);
        }).then(() => {
            this.rtcPeerConnectionCreatedListener.call(null, this.rtcPeerConnection);
        });
    }

    close() {
        try{
            try {
                this.dataChannel.close();
            } catch(ex) {
                console.log(ex);
            }
            this.rtcPeerConnection.close();
        } catch(ex) {
            console.log(ex)
        } finally {
            this.dataChannel = null;
            this.rtcPeerConnection = null;
        }
    }

    forceClose() {
        console.log("forceClose : " + this.dataChannelLabel);
        this.isForceClosed = true;
        this.clear();
        this.close();
    }

    clear() {
        clearInterval(this.timeoutThenCloseInterval);
        this.messageListener = null;
        this.pubSubTokenList.forEach(token => {
            PubSub.unsubscribe(token);
        });
        this.pubSubTokenList = [];
    }

    onConnectionCreated(fn) {
        this.rtcPeerConnectionCreatedListener = fn;
    }

    reconnectRTCPeerConnection() {
        if (this.isForceClosed) return;

        if (this.reconnectCount < this.reconnectMax && this.reconnectCountBetweenCloseAndOpenAndSetTo0WhenDCOpen < this.reconnectMax) {
            console.log(`${this.dataChannelLabel} reconnect reconnectTotalCount  : ${this.reconnectCount}; reconnectCountBetweenCloseAndOpenAndSetTo0WhenDCOpen : ${this.reconnectCountBetweenCloseAndOpenAndSetTo0WhenDCOpen}, reconnectMax : ${this.reconnectMax}`);
            this.reconnectCount += 1;
            this.reconnectCountBetweenCloseAndOpenAndSetTo0WhenDCOpen += 1;
            // reconnect sleep seconds 2s,4s,8s,16s,32s,64s...
            setTimeout(() => {
                this.initConnection(this.connectionID, this.dataChannelLabel);
            }, Math.pow(2, this.reconnectCountBetweenCloseAndOpenAndSetTo0WhenDCOpen) * 1000)
        }
    }

    createDataChannel() {
        if (this.dataChannel) {
            try {
                this.dataChannel.close();
            } catch (e) {
                console.log("close before createDataChannel error", e)
            }
        }

        /**
         * MDN Docs here : https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel
         * ordered : Indicates whether or not messages sent on the RTCDataChannel are required to arrive at their destination in the same order in which they were sent (true), or if they're allowed to arrive out-of-order (false). Default: true.
         * maxRetransmits : The maximum number of times the user agent should attempt to retransmit a message which fails the first time in unreliable mode. While this value is a16-bit unsigned number, each user agent may clamp it to whatever maximum it deems appropriate. Default: null
         */
        let dataChannel = this.rtcPeerConnection.createDataChannel(this.dataChannelLabel, {
            ordered: false,
            maxRetransmits: 5,
            reliable: false,
        });
        dataChannel.binaryType = 'arraybuffer';
        dataChannel.addEventListener("open", ev => {
            this.reconnectCountBetweenCloseAndOpenAndSetTo0WhenDCOpen = 0;
            clearInterval(this.timeoutThenCloseInterval);
            this.oneSingleLineconsole.log(`${MONITOR_LOG_DASHBOARD_DATACHANNEL_PARSE_SEPARATOR},${this.userid},${this.connectionType},DCOPEN,${MONITOR_LOG_DASHBOARD_DATACHANNEL_PARSE_SEPARATOR}`);
            console.log("dataChannel.onopen", ev);
        });
        dataChannel.addEventListener("close", ev => {
            clearInterval(this.timeoutThenCloseInterval);
            console.log("dataChannel.onclose", ev);
            this.oneSingleLineconsole.log(`${MONITOR_LOG_DASHBOARD_DATACHANNEL_PARSE_SEPARATOR},${this.userid},${this.connectionType},DCCLOSE,${MONITOR_LOG_DASHBOARD_DATACHANNEL_PARSE_SEPARATOR}`);
            this.clear();
            this.close();
            this.reconnectRTCPeerConnectionThrottle();
        });
        dataChannel.addEventListener("error", ev => {
            clearInterval(this.timeoutThenCloseInterval);
            console.log("dataChannel.onerror", ev)
        });
        dataChannel.addEventListener("message", ev => {
            if (this.messageListener) {
                this.messageListener.call(null, ev.data);
            }
        });
        this.dataChannel = dataChannel;
    }


    /**
     * only support one message listener, because message will be transfered ownership to worker
     * @param fn
     */
    onMessage(fn) {
        this.messageListener = fn;
    }

    waitForAnswerFromRWG(pubSubEvent) {
        return new Promise((resolve, reject) => {
            let token = PubSub.on(pubSubEvent, (msg, data) => {
                resolve(data);
            });
            this.pubSubTokenList.push(token);
        })
    }

    setRemoteDescription(answer) {
        // answer.sdp = answer.sdp.replace(/a=candidate:.+[\\r\\n]/, "");
        console.log("setRemoteDescription", answer);
        this.rtcPeerConnection.setRemoteDescription(new RTCSessionDescription({
            type: "answer",
            sdp: answer.sdp
        }));
    }

    closeIfTimeout() {
        clearInterval(this.timeoutThenCloseInterval);

        this.timeoutThenCloseInterval = setTimeout(() => {
            console.log("closeIfTimeout");
            this.close();
        }, 10 * 1000);
    }

    addIceCandidate(candidate) {
        this.rtcPeerConnection.addIceCandidate(new RTCIceCandidate({
            candidate,
            sdpMLineIndex: 0,
            sdpMid: "0"
        }));
    }

    sendAudioData(data) {
        try {
            this.dataChannel.send(data);
        } catch(ex) {
            console.error("sendVideoData", ex);
        }
    }
}