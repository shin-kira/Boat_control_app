// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE", 
    databaseURL: "https://boatnile-9430f-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "boatnile-9430f",
    appId: "YOUR_APP_ID_HERE"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// --- 2. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initSlider('sliderLeft', 'bubbleLeft', 'leftThrottle');
    initSlider('sliderRight', 'bubbleRight', 'rightThrottle');
    initRelay();
    initRev();
    initStatusSync();
    initVideoStream();
    initClassificationDisplay();
    logEvent("SYSTEM: AI Interface Handshake Complete");
});

// --- VIDEO STREAM HANDLER ---
function initVideoStream() {
    const img = document.getElementById('esp32-feed');
    if (!img) return;
    
    // Set the MJPEG stream directly - most browsers handle this natively
    img.src = '/video_feed';
    
    // Add error handling
    img.onerror = function() {
        console.error('Stream connection failed');
        logEvent("⚠️ STREAM: Connection failed - check ESP32");
    };
    
    img.onload = function() {
        console.log('Stream started successfully');
        logEvent("✓ STREAM: Connected and streaming");
    };
}

// --- CLASSIFICATION DISPLAY ---
function initClassificationDisplay() {
    // Fetch classification every 500ms
    setInterval(() => {
        fetch('/get_classification')
            .then(res => res.json())
            .then(data => {
                const classDisplay = document.getElementById('classification-display');
                if (classDisplay && data.class >= 0) {
                    classDisplay.innerText = `Class: ${data.class} (${(data.confidence * 100).toFixed(1)}%)`;
                    classDisplay.style.color = '#10b981';
                }
            })
            .catch(err => console.error('Classification fetch error:', err));
    }, 500);
}

// --- SET CAMERA IP ---
function setCameraIP() {
    const ipInput = document.getElementById('camIp');
    const ip = ipInput.value.trim();
    
    if (!ip) {
        logEvent("⚠️ CAMERA: Invalid IP address");
        return;
    }
    
    logEvent(`🔄 CAMERA: Connecting to ${ip}...`);
    
    fetch('/set_camera', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: ip })
    })
    .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    })
    .then(data => {
        if (data.success) {
            logEvent(`✓ CAMERA: Connected to ${ip}`);
            // Refresh the stream
            const img = document.getElementById('esp32-feed');
            img.src = '/video_feed?' + Date.now();
        } else {
            logEvent(`✗ CAMERA: ${data.error}`);
        }
    })
    .catch(err => {
        console.error('Camera error:', err);
        logEvent(`✗ CAMERA: ${err.message}`);
    });
}

function initSlider(id, bubbleId, dbKey) {
    const slider = document.getElementById(id);
    const bubble = document.getElementById(bubbleId);
    if (!slider || !bubble) return;
    slider.addEventListener('input', () => {
        const val = slider.value;
        bubble.innerText = val;
        db.ref('controls/' + dbKey).set(parseInt(val));
    });
}

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
        const currentState = txt.innerText === "Drive" ? 1 : 0;
        const nextState = currentState === 1 ? 0 : 1;
        db.ref('controls/Drive').set(nextState);
    });
}

function initStatusSync() {
    db.ref('/').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            document.getElementById('db-status').innerText = "Connected";
            if (data.lat !== undefined && data.lon !== undefined) {
                updateStatUI('stat-gps', `${parseFloat(data.lat).toFixed(5)}, ${parseFloat(data.lon).toFixed(5)}`);
            }
            if (data.weight !== undefined) updateStatUI('stat-mass', data.weight, " KG");
            if (data.battery !== undefined) updateStatUI('stat-batt', data.battery, "%");
        }
    });
}

function updateStatUI(id, value, unit = "") {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = (value !== null) ? value + unit : "PENDING";
    el.style.color = (value !== null) ? "#38bdf8" : "#f59e0b";
}

function logEvent(msg) {
    const log = document.getElementById('LOG');
    if (!log) return;
    const time = new Date().toLocaleTimeString().split(' ')[0];
    const div = document.createElement('div');
    div.innerHTML = `<span style="color:#64748b">[${time}]</span> ${msg}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}