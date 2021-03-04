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

    close() { console.error("close not implement"); }

    send() { console.error("send not implement"); }

    on_message() { console.error("on_message not implement");}
}

class WebsocketTransport extends Transport {
    constructor(url) {
        super();
        this.url = url || "ws://127.0.0.1:8801";
        this.socket = null;
        this.timer = null;
    }

    open() {
        if (this.socket) return;
        this.socket = new WebSocket(this.url);
        this.socket.onerror = this.onerror.bind(this);
        this.socket.onclose = this.onclose.bind(this);
        this.socket.onopen = this.onopen.bind(this);
    }

    close() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    send(pck) {
        if (this.socket && this.socket.readyState === 1) {
            this.socket.send(pck);
        }
    }

    onopen() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    onerror () {
        // console.log("onerror");
        // this.socket.close();
        // this.socket = null;

        // if (!this.timer) this.timer = setTimeout(this.open.bind(this), 5000);
    }

    onclose() {
        this.socket = null;
        this.timer = setTimeout(this.open.bind(this), 5000);
    }
}

class Netlog {
    constructor(proto, url) {
        this.proto = proto || "websocket";
        this.url = url;

        this.transport = null;
        if (this.proto === "websocket") {
            this.transport = new WebsocketTransport(this.url);
        } else {
            this.transport = new Transport(this.url);
        }
    }

    open() {
        if (this.transport) this.transport.open();
    }

    close() {
        if (this.transport) this.transport.close();
    }

    send(fname, data) {
        if (!this.transport) return;

        let pck = new Package();
        pck.addUint8array(fname);
        pck.addUint8array(data);
        this.transport.send(pck.format());
    }
};