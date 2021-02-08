class Package {
    constructor() {
        this.pckcontent = [];
    }

    addInt8(intv) {
        let int32Array = new Int32Array([intv]);
        let int8Array = new Int8Array(int32Array.buffer);

        this.pckcontent.push(int8Array);
    }

    addUint8array (uint8array) {
        this.pckcontent.push(uint8array);
    }

    format() {
        //// prop type :
        ////    |32 int, all package len| data len |data| .....
        let len = this.getDataLength();

        let int32 = new Int32Array(1);
        let int8 = new Int8Array(int32.buffer);

        let pckLen = 4 + len;
        let buff = new Int8Array(pckLen);
        int32[0] = len;
        buff.set(int8);

        let offset = 4; 
        this.pckcontent.forEach( data => {
            int32[0] = data.length;
            buff.set(int8, offset);
            buff.set(data, offset + 4);
            offset += 4 + data.length;
        });

        return buff;
    }

    getDataLength() {
        let len = 0;
        this.pckcontent.forEach( data => {
            len += data.length + 4;
        });

        return len;
    }
}

class Transport {
    constructor() {

    }

    open() { console.error("open not implement"); }

    send() { console.error("send not implement"); }

    on_message() { console.error("on_message not implement");}
}

class WebsocketTransport {
    constructor(url) {
        this.url = url || "ws://127.0.0.1:8801";
    }

    open() {

    }

    send() {

    }

    on_message() {

    }
}

class Netlog {
    constructor(proto, url) {

    }
};