class myworklet extends AudioWorkletProcessor {
    constructor() {
        // The super constructor call is required.
        super();
        this.port.onmessage = this.handleMessage.bind(this);
        this.g_sharedbuffer = null;
        this.encodeSAB = null;
        this.decodeSAB = null;
    }

    handleMessage(e) {
        switch( e.data.event ) {
            case "sharedBuffer":
                {
                    this.g_sharedbuffer = e.data.sharedBuffer;
                    if (this.g_sharedbuffer) {
                        this.encodeSAB = new SABRingBuffer(this.g_sharedbuffer.inputState, this.g_sharedbuffer.inputBuffer, 128);
                        this.decodeSAB = new SABRingBuffer(this.g_sharedbuffer.outputState, this.g_sharedbuffer.outputBuffer, 128);
                        console.log("worklet receive shared buffer");
                    }
                }
                break;
        }
    }

    inputData(inputs) {
        if (!this.encodeSAB || !inputs[0] || !inputs[0][0]) return true;
        this.encodeSAB.write(inputs[0][0]);
    }

    outputData(outputs) {
        if (!this.decodeSAB) return true;
        let buffer = this.decodeSAB.read();
        if (buffer === null) {
            // console.error(ERROR_WRITE_NO_DATA);
            return true;
        }
        for (let i = 0;i < outputs.length;i ++) {
            for (let j = 0;j < outputs[i].length;j ++) {
                outputs[i][j].set(buffer);
            }
        }
    }

    process(inputs, outputs, parameters) {
        if (!this.g_sharedbuffer) return true;

        this.inputData(inputs);
        this.outputData(outputs);
        return true;
    }
}

registerProcessor('myworklet', myworklet);

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