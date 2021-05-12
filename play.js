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
    constructor(outputDeviceId, sampleRate, peerCodec) {
        this.audioContext       = null;
        this.outputDeviceId     = outputDeviceId;
        this.sampleRate         = sampleRate;

        this.isRunning          = false;
        this.peerCodec          = peerCodec;
    }

    async start() {
        if (this.isRunning) return ;
        this.isRunning = true;
        await this.createAudioContext();
        await this.createBufferSource();
        await this.connectStream();
    }

    stop() {
        if (this.bufferSourceNode) {
            this.bufferSourceNode.disconnect();
            this.bufferSourceNode = null;
        }
        if (this.audioContext) this.audioContext.close();

        if (this.audioDomNode){
            this.audioDomNode.srcObject = null;
            this.audioDomNode = null;
        }
    }

    async createAudioContext() {
        if (this.sampleRate) {
            this.audioContext = new AudioContext({
                sampleRate : this.sampleRate,
                latencyHint: 0.02
            });
        } else {
            this.audioContext = new AudioContext({
                latencyHint: 0.02
            });
        }
        return new Promise((resolve) =>{resolve();});
    }


    uint16ToFloat32(input, output) {
        for (var i = 0; i < input.length; i++) {
            var int = input[i];
            // If the high bit is on, then it is a negative number, and actually counts backwards.
            var float = (int >= 0x8000) ? -(0x10000 - int) / 0x8000 : int / 0x7FFF;
            output[i] = float;
        }
        return output;
    }

    async createBufferSource() {
        if (this.audioContext) {
            let response = await fetch("./audio_16000_16_1.pcm");
            let blob = await response.blob();
            this.fileBuffer = await blob.arrayBuffer();
            this.fileBufferAs16 = new Uint16Array(this.fileBuffer);
            this.audioBuffer = this.audioContext.createBuffer(2, this.fileBufferAs16.length, 16000);
            this.bufferSourceNode = this.audioContext.createBufferSource();
            // this.bufferSourceNode.buffer = buffer;
            let channelBuffer = this.audioBuffer.getChannelData(0);
            this.uint16ToFloat32(this.fileBufferAs16, channelBuffer);
            this.audioBuffer.copyToChannel(channelBuffer, 1);

            this.bufferSourceNode.buffer = this.audioBuffer;
            console.log(this.bufferSourceNode);
        }
        return new Promise((resolve) =>{resolve();});
    }

    async connectStream() {
        if (isFirefox()) {
            this.bufferSourceNode.connect(this.audioContext.destination);
            this.bufferSourceNode.loop = true;
            this.bufferSourceNode.start();
            return;
        }
        let dest = this.audioContext.createMediaStreamDestination();
        this.bufferSourceNode.connect(dest);
        
        if (!this.audioDomNode) {
            this.audioDomNode = new Audio();
        }

        let peerPair = new PeerPair();
        this.audioDomNode.srcObject = await peerPair.ConnectsWithCodec([dest.stream], this.peerCodec);

        this.bufferSourceNode.loop = true;
        this.bufferSourceNode.start();
        this.audioDomNode.play();

        
        this.audioDomNode.setSinkId(this.outputDeviceId).catch(err =>{
            console.error(err);
        });
    }
}