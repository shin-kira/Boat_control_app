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

// --- 2. CONFIGURATION & GLOBALS ---
const CAMERA_IP = "192.168.43.235"; // Hardcoded as requested

document.addEventListener('DOMContentLoaded', () => {
    // Setup Throttle Sliders
    initSlider('sliderLeft', 'bubbleLeft', 'leftThrottle');
    initSlider('sliderRight', 'bubbleRight', 'rightThrottle');

    // Setup Relay Toggle
    initRelay();

    // Start listening for Boat Data (GPS, Weight)
    initStatusSync();

    // Auto-Connect Camera on Startup
    setTimeout(connectStream, 1000); 

    logEvent("SYSTEM: Dashboard Handshake Complete");
});

// --- 3. THROTTLE SLIDERS ---
function initSlider(id, bubbleId, dbKey) {
    const slider = document.getElementById(id);
    const bubble = document.getElementById(bubbleId);
    
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

// --- 5. CAMERA FEED (Hardcoded IP) ---
function connectStream() {
    const feed = document.getElementById('esp32-feed');
    logEvent(`CAMERA: Connecting to http://${CAMERA_IP}:81/stream...`);

    // Try Port 81 first (MJPEG Standard)
    feed.src = `http://${CAMERA_IP}:81/stream`;

    feed.onerror = () => {
        // Fallback to Port 80 if 81 fails
        if (feed.src.includes(":81")) {
            logEvent("CAMERA: Port 81 failed, trying Port 80...");
            feed.src = `http://${CAMERA_IP}/stream`;
        } else {
            logEvent("CAMERA: Connection error. Check ESP32-CAM power.");
        }
    };
}

// --- 6. REAL-TIME STATUS (GPS & WEIGHT) ---
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

            // Update Battery (optional placeholder)
            if (data.battery !== undefined) {
                updateStatUI('stat-batt', data.battery, "%");
            }
        }
    });
}

// --- 7. UTILITIES ---
function updateStatUI(id, value, unit = "") {
    const el = document.getElementById(id);
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
    const time = new Date().toLocaleTimeString().split(' ')[0];
    const div = document.createElement('div');
    div.innerHTML = `<span style="color:#64748b">[${time}]</span> ${msg}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}
