from flask import Flask, Response, send_from_directory, request, jsonify
import cv2
import torch
import numpy as np
from PIL import Image
from torchvision import models, transforms
import time

app = Flask(__name__, template_folder='.', static_folder='.')

# --- CONFIGURATION ---
CAMERA_IP = "192.168.1.8"  # Default IP
WEIGHTS_PATH = "Vit_model.pth"
LATEST_CLASSIFICATION = {"class": -1, "confidence": 0.0, "timestamp": None}  # Track latest prediction

# CLASS LABELS - Edit these to match your model's classes
CLASS_LABELS = {
    0: "Class 0",
    1: "Class 1",
    2: "Class 2",
    3: "Class 3",
    4: "Class 4"
}  # Map class index to readable name

# 1. Initialize Backbone
model = models.vit_b_16(weights=None)

# Adapt model to match saved weights structure
# Weights expect: heads.head.1 (768->16) and heads.head.3 (16->num_classes)
model.heads.head = torch.nn.Sequential(
    torch.nn.Identity(),  # Layer 0 (placeholder)
    torch.nn.Linear(768, 16),  # Layer 1
    torch.nn.ReLU(),  # Layer 2
    torch.nn.Linear(16, 5)  # Layer 3 - adjust num_classes (5) as needed
)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# 2. Load Weights
try:
    model.load_state_dict(torch.load(WEIGHTS_PATH, map_location=device))
    print(f"✓ AI MODEL: Weights loaded successfully on {device}")
except Exception as e:
    print(f"✗ AI MODEL ERROR: {e}")

model.to(device)
model.eval()

# 3. Preprocessing
preprocess = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

def gen_frames():
    global CAMERA_IP, LATEST_CLASSIFICATION
    ESP32_URL = f"http://{CAMERA_IP}:81/stream"
    
    # Adding CAP_FFMPEG often solves the "black screen" issue for network streams
    cap = cv2.VideoCapture(ESP32_URL, cv2.CAP_FFMPEG)
    
    # Set connection timeout (in milliseconds)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    
    max_retries = 3
    retry_count = 0
    
    if not cap.isOpened():
        print(f"✗ STREAM ERROR: Could not connect to {ESP32_URL}")
        # Yield error frame
        error_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        cv2.putText(error_frame, "❌ ESP32 STREAM UNAVAILABLE", (50, 240), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        ret, buffer = cv2.imencode('.jpg', error_frame)
        if ret:
            yield (b'--boundary\r\n'
                   b'Content-Type: image/jpeg\r\n'
                   b'Content-length: ' + str(len(buffer)).encode() + b'\r\n\r\n' + 
                   buffer.tobytes() + b'\r\n')
        return

    while True:
        success, frame = cap.read()
        if not success:
            retry_count += 1
            if retry_count > max_retries:
                print(f"✗ STREAM ERROR: Max retries exceeded. Stopping stream.")
                cap.release()
                break
            print(f"✗ STREAM ERROR: Dropped frame. Reconnecting... (Attempt {retry_count}/{max_retries})")
            cap.release()
            time.sleep(1)
            cap = cv2.VideoCapture(ESP32_URL, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            continue
        
        retry_count = 0  # Reset on success
        
        try:
            # AI Processing
            img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_img = Image.fromarray(img_rgb)
            input_tensor = preprocess(pil_img).unsqueeze(0).to(device)
            
            with torch.no_grad():
                output = model(input_tensor)
                probabilities = torch.nn.functional.softmax(output, dim=1)
                confidence = probabilities.max().item()
                prediction = output.argmax(1).item()
                class_label = CLASS_LABELS.get(prediction, f"Unknown ({prediction})")
                
                # Store classification
                LATEST_CLASSIFICATION = {
                    "class": prediction,
                    "label": class_label,
                    "confidence": round(confidence, 4),
                    "timestamp": time.time()
                }
            
            # Draw Label
            cv2.putText(frame, f"AI: {class_label} ({confidence:.2%})", (20, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        except Exception as e:
            print(f"✗ INFERENCE ERROR: {e}")

        # Encode for Web
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            continue
        
        # Proper MJPEG frame format
        frame_data = buffer.tobytes()
        yield (b'--boundary\r\n'
               b'Content-Type: image/jpeg\r\n'
               b'Content-length: ' + str(len(frame_data)).encode() + b'\r\n\r\n' + 
               frame_data + b'\r\n')

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/health', methods=['GET'])
def health():
    global CAMERA_IP
    return jsonify({'status': 'ok', 'camera_ip': CAMERA_IP}), 200

@app.route('/get_classification', methods=['GET'])
def get_classification():
    global LATEST_CLASSIFICATION
    return jsonify(LATEST_CLASSIFICATION), 200

@app.route('/set_camera', methods=['POST'])
def set_camera():
    global CAMERA_IP
    try:
        data = request.get_json()
        ip = data.get('ip', '').strip()
        if not ip:
            return jsonify({'success': False, 'error': 'Invalid IP'}), 400
        CAMERA_IP = ip
        print(f"✓ CAMERA: IP updated to {CAMERA_IP}")
        return jsonify({'success': True, 'ip': CAMERA_IP}), 200
    except Exception as e:
        print(f"✗ CAMERA ERROR: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/video_feed')
def video_feed():
    return Response(gen_frames(), mimetype='multipart/x-mixed-replace; boundary=boundary')

@app.route('/<path:path>', methods=['GET'])
def send_static(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    # Using 0.0.0.0 allows other devices on your network to see the site
    app.run(host='0.0.0.0', port=8000, threaded=True)