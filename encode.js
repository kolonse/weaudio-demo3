importScripts("audiolib.js")
importScripts("netlog.js")

var audio_param_set;
var audio_init;
var audio_encode;
var audio_decode;
var get_mixed_data;
var audio_uninit;

var audio_context;

var local_data_ ;
var local_data_ptr_ ;

let audio_sample_rate = 16000 ;
let frame_size_10ms = audio_sample_rate / 100;
let RTC_PACKET_MAX_SIZE = 1500;

Module["onRuntimeInitialized"] = () => {
	audio_init = Module.cwrap('Audio_Init', 'number', ['number']);
    audio_uninit = Module.cwrap('Audio_UnInit', 'number', ['number']);
    audio_encode = Module.cwrap('Audio_Encode', 'number', ['number', 'number', 'number', 'number']);
    audio_decode = Module.cwrap('Audio_Decode', 'number', ['number', 'number', 'number']);
    get_mixed_data = Module.cwrap('Get_Mixed_Audio', 'number', ['number', 'number', 'number']);

    local_data_ptr_ = Module._malloc(frame_size_10ms * 4);
    local_data_ = Module.HEAPF32.subarray(local_data_ptr_/4, local_data_ptr_/4 + frame_size_10ms);  
    
    postMessage({
        event: 0
    })
}

let encodeSAB = null;
let sendSAB = null;
let sendSharedBuffer = null;
let g_sharbuffer = null;

let process_timer_interval = null;
function OnMessage(e) {
    switch( e.data.event ) {
        case "sharedBuffer":{
            g_sharbuffer = e.data.sharedBuffer;
            sendSharedBuffer = e.data.sendSharedBuffer;
            sendSAB = new SABRingBuffer(sendSharedBuffer.state, sendSharedBuffer.buffer, RTC_PACKET_MAX_SIZE / 4);
            sendSAB.clear();
            encodeSAB = new SABRingBuffer(g_sharbuffer.inputState, g_sharbuffer.inputBuffer, frame_size_10ms);
            encodeSAB.clear();
            console.log("encode worker receive shared buffer");
        }
        break;

        case "start": {
            audio_context = audio_init(1);
            if (!audio_context) {
                console.error("encoder init fail");
            } else {
                console.log("encoder init success");
            }
            if (process_timer_interval) clearInterval(process_timer_interval);
            process_timer_interval = setInterval(Encode_Timer, 20);
        }
        break;

        case "stop": {
            if (process_timer_interval) clearInterval(process_timer_interval);
            audio_uninit(audio_context);
            audio_context = null;
            break;
        }
    }
}

let Audio_RTP_Frame = new Uint8Array(RTC_PACKET_MAX_SIZE);
let Audio_RTP_Frame_32 = new Float32Array(Audio_RTP_Frame.buffer);
let Audio_RTP_Frame_i32 = new Uint32Array(Audio_RTP_Frame.buffer);

function audio_encode_frame_callback(a, b) {
    var ar = Module.HEAP8.subarray(a + 0, a + b);
    Audio_RTP_Frame_i32[0] = b;
    Audio_RTP_Frame.set(ar, 4);

    sendSAB.write(Audio_RTP_Frame_32);
}

function Encode_Timer() {
    if (!encodeSAB || !local_data_ptr_) return ;

    let data = null;
    while( (data = encodeSAB.read() ) !== null) {
        // sendSAB.write(data);
        local_data_.set(data);
        audio_encode(audio_context, local_data_ptr_, audio_sample_rate / 100, audio_sample_rate);
    }
}

// setInterval(Encode_Timer, 20);

class SABRingBuffer{
    constructor(sabState, sabBuffer, PER_FRAME_LENGTH) {

        this.STATE_READ_READY = 0;
        this.STATE_READ_INDEX = 1;
        this.STATE_WRITE_READY = 2;
        this.STATE_WRITE_INDEX = 3;
        this.STATE_DATA_COUNT = 4;

        this.STATY_READY_NO = 0;
        this.STATY_READY_YES = 1;
        

        this.sabState = new Uint32Array(sabState);
        this.sabBuffer = new Float32Array(sabBuffer);

        this.perFrameLength = PER_FRAME_LENGTH;
        this.bufferLen = this.sabBuffer.length;
        this.supportSpecialOptimization = ((this.bufferLen % PER_FRAME_LENGTH) === 0) ;
        this.bufferIndex = null;
        if (this.supportSpecialOptimization) {
            let bufferIndexLen = this.bufferLen / PER_FRAME_LENGTH ;
            this.bufferIndex = [];
            for (let i = 0;i < bufferIndexLen; i ++) {
                this.bufferIndex.push(this.sabBuffer.subarray(i * PER_FRAME_LENGTH, i * PER_FRAME_LENGTH + PER_FRAME_LENGTH));
            }
        }
    }

    clear() {
        if (this.sabState) {
            this.sabState[this.STATE_READ_READY] = 0;
            this.sabState[this.STATE_READ_INDEX] = 0;
            this.sabState[this.STATE_WRITE_READY] = 0;
            this.sabState[this.STATE_WRITE_INDEX] = 0;
            this.sabState[this.STATE_DATA_COUNT] = 0;
        }
    }

    setWriteReady() {
        this.sabState[this.STATE_WRITE_READY] = this.STATY_READY_YES;
    }

    isReady() {
        return this.sabState[this.STATE_WRITE_READY] && this.sabState[this.STATE_READ_READY];
    }

    getDataCount() {
        return Atomics.load(this.sabState, this.STATE_DATA_COUNT);
    }

    write(buffer){
        if (buffer.length !== this.perFrameLength) return ;

        let readReady = this.sabState[this.STATE_READ_READY];
        let writeReady = this.sabState[this.STATE_WRITE_READY];
        if (!writeReady) {
            this.sabState[this.STATE_WRITE_READY] = this.STATY_READY_YES;
            this.sabState[this.STATE_WRITE_INDEX] = 0;
        }

        if (!readReady) return ;

        return this.supportSpecialOptimization ? this.writeSpecial(buffer) : this.writeNormal(buffer);
    }

    writeNormal(buffer) {
        let writeIndex = this.sabState[this.STATE_WRITE_INDEX];
        if (this.bufferLen - writeIndex >= this.perFrameLength) {
            this.sabBuffer.set(buffer, writeIndex);     
        } else {
            let buff1 = buffer.subarray(0, this.bufferLen - writeIndex);
            let buff2 = buffer.subarray(this.bufferLen - writeIndex);
            this.sabBuffer.set(buff1, writeIndex);
            this.sabBuffer.set(buff2);
        }

        writeIndex += this.perFrameLength;
        if (writeIndex >= this.perFrameLength) {
            writeIndex -= this.perFrameLength;
        }

        this.sabState[this.STATE_WRITE_INDEX] = writeIndex;
        Atomics.add(this.sabState, this.STATE_DATA_COUNT, this.perFrameLength);
    }

    writeSpecial(buffer) {
        let writeIndex = this.sabState[this.STATE_WRITE_INDEX];
        this.bufferIndex[writeIndex].set(buffer);
        writeIndex = (writeIndex + 1) % this.bufferIndex.length;
        this.sabState[this.STATE_WRITE_INDEX] = writeIndex;
        Atomics.add(this.sabState, this.STATE_DATA_COUNT, this.perFrameLength);
    }

    read() {
        let readReady = this.sabState[this.STATE_READ_READY];
        let writeReady = this.sabState[this.STATE_WRITE_READY];
        if (!readReady) {
            this.sabState[this.STATE_READ_READY] = this.STATY_READY_YES;
            this.sabState[this.STATE_READ_INDEX] = 0;
        }
        
        if (!writeReady) return null;
        return this.supportSpecialOptimization ? this.readSpecial() : this.readNormal();
    }

    readNormal() {
        let readIndex = this.sabState[this.STATE_READ_INDEX];
        let dataCount = Atomics.load(this.sabState, this.STATE_DATA_COUNT);
        if (dataCount < this.perFrameLength) return null;
        if (dataCount > this.bufferLen) {
            let needLostCount = Math.ceil((dataCount - this.bufferLen) / this.perFrameLength) + 1;
            readIndex = (needLostCount * this.perFrameLength + readIndex) % this.bufferLen ;
            Atomics.sub(this.sabState, this.STATE_DATA_COUNT, needLostCount * this.perFrameLength) ;
        }

        let buff = null;
        if (this.bufferLen - readIndex >= this.perFrameLength) {
            buff = this.sabBuffer.subarray(readIndex, readIndex + this.perFrameLength);
        } else {
            let buff1 = this.sabBuffer.subarray(readIndex);
            let buff2 = this.sabBuffer.subarray(0, this.perFrameLength + readIndex - this.bufferLen);
            let buff = new Float32Array(this.perFrameLength);
            buff.set(buff1);
            buff.set(buff2, this.perFrameLength - readIndex);
        }

        readIndex = (readIndex + this.perFrameLength) % this.bufferLen;
        this.sabState[this.STATE_READ_INDEX] = readIndex;
        Atomics.sub(this.sabState, this.STATE_DATA_COUNT, this.perFrameLength) ;
        return buff;
    }

    readSpecial() {
        let readIndex = this.sabState[this.STATE_READ_INDEX];
        let dataCount = Atomics.load(this.sabState, this.STATE_DATA_COUNT);
        if (dataCount < this.perFrameLength) return null;
        if (dataCount > this.bufferLen) {
            let needLostCount = Math.ceil((dataCount - this.bufferLen) / this.perFrameLength) + 1;
            readIndex = (needLostCount + readIndex) % this.bufferIndex.length ;
            Atomics.sub(this.sabState, this.STATE_DATA_COUNT, needLostCount * this.perFrameLength) ;
        }

        let buffer = this.bufferIndex[readIndex];
        readIndex = (readIndex + 1) % this.bufferIndex.length ;
        this.sabState[this.STATE_READ_INDEX] = readIndex;
        Atomics.sub(this.sabState, this.STATE_DATA_COUNT, this.perFrameLength) ;
        return buffer ;
    }
}

self.addEventListener("message", OnMessage);

let LogClient = new Netlog();
LogClient.open();

function LOG_OUT_WEBRTC(filename,filenameLen, buff, buffLen) {
    let fname = Module.HEAP8.subarray(filename, filename + filenameLen);
    let data = Module.HEAP8.subarray(buff, buff + buffLen);
    
    LogClient.send(fname, data);
}

function LOG_OUT() {
    
}