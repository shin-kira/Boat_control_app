// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE", 
    databaseURL: "https://boatnile-9430f-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "boatnile-9430f",
    appId: "YOUR_APP_ID_HERE"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- 2. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Setup Throttle Sliders
    initSlider('sliderLeft', 'bubbleLeft', 'leftThrottle');
    initSlider('sliderRight', 'bubbleRight', 'rightThrottle');

    // Setup Relay Toggle
    initRelay();

    // Setup Reverse Button
    initRev();

    // Start listening for Boat Data (GPS, Weight, Battery)
    initStatusSync();

    // Connect to camera using the default value in the input box after 1 second
    setTimeout(connectStream, 1000); 

    logEvent("SYSTEM: Dashboard Handshake Complete");
});

// --- 3. THROTTLE SLIDERS ---
function initSlider(id, bubbleId, dbKey) {
    const slider = document.getElementById(id);
    const bubble = document.getElementById(bubbleId);
    
    if (!slider || !bubble) return;

    slider.addEventListener('input', () => {
        const val = slider.value;
        bubble.innerText = val;
        
        // Push to Firebase: controls/leftThrottle or controls/rightThrottle
        db.ref('controls/' + dbKey).set(parseInt(val));
    });
}

// --- 4. RELAY CONTROL ---
function initRelay() {
    const btn = document.getElementById('relayBtn');
    const txt = document.getElementById('rel_mode');

    if (!btn || !txt) return;

    db.ref('controls/relay').on('value', (snapshot) => {
        const val = snapshot.val();
        const isOn = (val === 1);
        
        btn.className = isOn ? "relay-button active" : "relay-button";
        txt.innerText = isOn ? "ON" : "OFF";
    });

    btn.addEventListener('click', () => {
        const nextState = txt.innerText === "ON" ? 0 : 1;
        db.ref('controls/relay').set(nextState);
    });
}

// --- 5. DIRECTION (REVERSE) CONTROL ---
function initRev() {
    const btn = document.getElementById('revBtn');
    const txt = document.getElementById('rev_mode');
    
    if (!btn || !txt) return;

    db.ref('controls/Drive').on('value', (snapshot) => {
        const val = snapshot.val();
        const isDrive = (val === 1);
        
        btn.className = isDrive ? "relv-button active" : "relv-button";
        txt.innerText = isDrive ? "Drive" : "Reverse";
    });

    btn.addEventListener('click', () => {
        // Toggle: if "Drive" (1), set to 0. If "Reverse" (0), set to 1.
        const currentState = txt.innerText === "Drive" ? 1 : 0;
        const nextState = currentState === 1 ? 0 : 1;
        db.ref('controls/Drive').set(nextState);
    });
}

// --- 6. CAMERA FEED (DIRECT ESP32-CAM) ---
function connectStream() {
    const feed = document.getElementById('esp32-feed');
    const ipInput = document.getElementById('camIp').value.trim();

    if (!ipInput) {
        logEvent("✗ CAMERA: No IP address detected.");
        return;
    }

    logEvent(`CAMERA: Connecting to ESP32 at http://${ipInput}:81/stream`);

    /**
     * NOTE: Most ESP32-CAM firmware (Arduino Example) 
     * serves the MJPEG stream on Port 81 at /stream.
     * If yours is different, change ":81/stream" below.
     */
    const videoFeedUrl = `http://${ipInput}:81/stream`;
    
    feed.src = videoFeedUrl;

    feed.onload = () => {
        logEvent("✓ CAMERA: Stream connected successfully!");
    };

    feed.onerror = () => {
        logEvent(`✗ CAMERA: Failed to connect to ${ipInput}.`);
        logEvent("TIP: Ensure ESP32 is on and check port (81 or 80).");
    };
}

// --- 7. REAL-TIME STATUS SYNC ---
function initStatusSync() {
    db.ref('/').on('value', (snapshot) => {
        const data = snapshot.val();
        
        if (data) {
            document.getElementById('db-status').innerText = "Connected";
            document.getElementById('db-status').style.color = "#10b981";

            // Update GPS
            if (data.lat !== undefined && data.lon !== undefined) {
                const gpsLocation = `${parseFloat(data.lat).toFixed(5)}, ${parseFloat(data.lon).toFixed(5)}`;
                updateStatUI('stat-gps', gpsLocation);
            }

            // Update Weight
            if (data.weight !== undefined) {
                updateStatUI('stat-mass', data.weight, " KG");
            }

            // Update Battery
            if (data.battery !== undefined) {
                updateStatUI('stat-batt', data.battery, "%");
            }
        }
    }, (error) => {
        logEvent("✗ FIREBASE: " + error.message);
    });
}

// --- 8. UTILITIES ---
function updateStatUI(id, value, unit = "") {
    const el = document.getElementById(id);
    if (!el) return;

    if (value !== null && value !== undefined && value !== "") {
        el.innerText = value + unit;
        el.style.color = "#38bdf8";
    } else {
        el.innerText = "PENDING";
        el.style.color = "#f59e0b";
    }
}

function logEvent(msg) {
    const log = document.getElementById('LOG');
    if (!log) return;
    
    const time = new Date().toLocaleTimeString().split(' ')[0];
    const div = document.createElement('div');
    div.style.marginBottom = "2px";
    div.innerHTML = `<span style="color:#64748b">[${time}]</span> ${msg}`;
    
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}
