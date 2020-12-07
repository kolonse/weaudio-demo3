let inputsDom = document.getElementById("inputs");
let outputsDom = document.getElementById("outputs");
let conditionDom = document.getElementById("conditions");

navigator.mediaDevices.getUserMedia({audio:true}).then(stream =>{
    stream.getAudioTracks().forEach(track =>{
        track.stop();
    });

    navigator.mediaDevices.enumerateDevices()
    .then(function(devices) {
        devices.forEach(function(device) {
            console.log(device.kind + ": " + device.label +
            " id = " + device.deviceId);
            if (device.kind === "audioinput") {
                var input = document.createElement("input");
                var label = document.createElement("label");

                input.type="radio";
                input.id=device.deviceId;
                input.name="inputs";
                input.value=device.label;

                label.for=device.label;
                label.textContent=device.label;

                inputsDom.appendChild(input);
                inputsDom.appendChild(label);

                var br = document.createElement("br");
                inputsDom.appendChild(br);

                if (device.deviceId === "default") {
                    input.checked = true;
                }
            } else if (device.kind === "audiooutput") {
                var input = document.createElement("input");
                var label = document.createElement("label");

                input.type="radio";
                input.id=device.deviceId;
                input.name="outputs";
                input.value=device.label;

                label.for=device.label;
                label.textContent=device.label;

                outputsDom.appendChild(input);
                outputsDom.appendChild(label);

                var br = document.createElement("br");
                outputsDom.appendChild(br);

                if (device.deviceId === "default") {
                    input.checked = true;
                }
            }
        });
    })
    .catch(function(err) {
      console.log(err.name + ": " + err.message);
    });
}).catch(console.error);