importScripts("audiolib.js")

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

    audio_context = audio_init(0);
    if (!audio_context) {
        console.error("decoder init fail");
    } else {
        console.log("decoder init success");
    }

    local_data_ptr_ = Module._malloc(RTC_PACKET_MAX_SIZE );
    local_data_ = Module.HEAP8.subarray(local_data_ptr_, local_data_ptr_ + RTC_PACKET_MAX_SIZE);
    postMessage({
        event: 0
    })
}

let decodeSAB = null;
let receSAB = null;
let receiveSharedBuffer = null;
let g_sharbuffer = null;

let process_timer_interval = null;
function OnMessage(e) {
    switch( e.data.event ) {
        case "sharedBuffer":{
            g_sharbuffer = e.data.sharedBuffer;
            receiveSharedBuffer = e.data.receiveSharedBuffer;
            receSAB = new SABRingBuffer(receiveSharedBuffer.state, receiveSharedBuffer.buffer, RTC_PACKET_MAX_SIZE / 4);
            receSAB.clear();
            decodeSAB = new SABRingBuffer(g_sharbuffer.outputState, g_sharbuffer.outputBuffer, frame_size_10ms);
            decodeSAB.clear();
            console.log("decode worker receive shared buffer");
        }
        break;
        case "start": {
            if (process_timer_interval) clearInterval(process_timer_interval);
            process_timer_interval = setInterval(Decode_Timer, 15);
        }
        break;
    }
}

let Audio_RTP_Frame = new Uint8Array(RTC_PACKET_MAX_SIZE);
let Audio_RTP_Frame_32 = new Float32Array(Audio_RTP_Frame.buffer);
let Frame_callback_Data = null;

function frame_callback(a, b) {
    if (Frame_callback_Data === null) {
        Frame_callback_Data = Module.HEAPF32.subarray(a / 4, a / 4 + b);
    }
    decodeSAB.write(Frame_callback_Data);
}

function Decode_Timer() {
    if (!decodeSAB || !audio_context) return ;

    let data = null;
    while( (data = receSAB.read() ) !== null) {
        // decodeSAB.write(data);
        Audio_RTP_Frame_32.set(data);
        let len = Audio_RTP_Frame[0];

        let buff = Audio_RTP_Frame.subarray(1, 1 + len);
        local_data_.set(buff);
        audio_decode(audio_context, local_data_ptr_, len);
    }

    while (decodeSAB.getDataCount() < 6 * 128) {
        get_mixed_data(audio_context, audio_sample_rate / 100, audio_sample_rate);
    }
}

// setInterval(Decode_Timer, 15);

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

function LOG_OUT(filename,filenameLen, buff, buffLen) {
    let fname = Module.HEAP8.subarray(filename, filename + filenameLen);

    
    // console.log(fname);
}