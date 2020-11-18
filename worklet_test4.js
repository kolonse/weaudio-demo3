class myworklet extends AudioWorkletProcessor {
    constructor() {
        // The super constructor call is required.
        super();
        this.port.onmessage = this.handleMessage.bind(this);
    }

    handleMessage(event) {
    }

    process(inputs, outputs, parameters) {
		for(let i = 0;i < outputs.length; i ++) {
            for (let j = 0;j < outputs[i].length; j ++) {
                outputs[i][j].set(inputs[i][j]);
            }
        }
        return true;
    }
}

registerProcessor('myworklet', myworklet);