# T1era-music

FILE 2: System Architecture & Technical Specifications for AI Agents
This document contains deep-dive system engineering details for AI agents assisting with the T1ERA Music project.
1. System Environment & Infrastructure
Hosting Provider: Google Cloud Platform (GCP) Compute Engine.
Virtual Machine Name: t1era-music-server
Zone: asia-southeast1-c (Singapore / Southeast Asia metadata region).
Hardware Profile: Typically configured as an e2-medium (2 vCPUs, 4 GB RAM). This profile provides the physical memory boundaries required to execute deep learning models without triggering Out-Of-Memory (OOM) kernels.
Base Operating System: Ubuntu minimal build.
System Python Default: Python 3.14.x.
Active Runtime Environment: Python 3.12.x managed inside an isolated Conda environment to ensure compatibility with pre-compiled wheels for numerical libraries like NumPy, SciPy, and Scikit-learn.
External Network Access: Port 5000 is exposed to the public internet via the custom GCP VPC firewall rule allow-t1era-music (bound to source IP ranges 0.0.0.0/0).
2. Environment Paths & Structure
Default System User: tengkufiboking
User Home Directory: /home/tengkufiboking
Project Path: /home/tengkufiboking/T1era-music
Virtual Environment Path: /home/tengkufiboking/miniconda/envs/t1era
Python 3.12 Interpreter Binary: /home/tengkufiboking/miniconda/envs/t1era/bin/python3.12
Gunicorn Binary: /home/tengkufiboking/miniconda/envs/t1era/bin/gunicorn
Firebase Credentials Path: /home/tengkufiboking/T1era-music/firebase-key.json
Server Logs (Local Redirections):
Access Logs: /home/tengkufiboking/T1era-music/access.log
Error Logs: /home/tengkufiboking/T1era-music/error.log
3. Server Process Management & WSGI Architecture
The application runs as a background system daemon managed by Systemd (/etc/systemd/system/t1era-music.service).
Gunicorn Configuration Details
The service is run using the following operational flags:
code
Bash
gunicorn --bind 0.0.0.0:5000 --workers 1 --threads 4 --timeout 600 --access-logfile access.log --error-logfile error.log main:app
--workers 1 and --threads 4 (The gthread Worker Engine): The standard Gunicorn sync worker class is strictly single-threaded and expects synchronous, fast-resolving HTTP requests. If a standard sync worker spawns a long-running background thread (like the transcription pipeline), the parent Gunicorn process suspends or terminates the worker process. Using the gthread worker class ensures background threads are allocated CPU slices properly and do not freeze.
--timeout 600: Because neural network pitch predictions are highly CPU-intensive, a 3-minute song can take several minutes to process. Setting this value to 10 minutes prevents Gunicorn's master process from timing out and forcefully killing active workers mid-transcription.
4. The Transcription Pipeline & Deep-Learning Constraints
Stage 0: Subprocess Isolation (Bypassing the TensorFlow Deadlock)
The core transcription of the raw audio file into a raw MIDI skeleton is handled in Stage 0 (input_file_0.py) using Spotify's basic-pitch library.
The Deadlock Problem: Importing TensorFlow in Gunicorn's parent thread and then attempting to run TensorFlow inference (predict()) inside a child worker thread causes a silent C++ deadlock. TensorFlow's internal thread pool fails to map system resources cleanly under process-forking conditions.
The Solution: main.py does not import input_file_0.py directly. Instead, Stage 0 is launched as an completely isolated operating system subprocess:
code
Python
cmd = [sys.executable, "input_file_0.py", str(input_audio_path), str(stage0_raw_mid)]
result = subprocess.run(cmd, capture_output=True, text=True)
This launches a clean, separate Python instance where TensorFlow handles inference on its own main thread, avoiding deadlocks.
TensorFlow Lite (TFLite) & ONNX Optimization
Because the VM has strict memory limits, running full TensorFlow is avoided.
The requirements.txt installs onnxruntime and basic-pitch.
At the very top of input_file_0.py, the import of the heavy TensorFlow engine is mocked out to force fallback behavior:
code
Python
import sys
sys.modules['tensorflow'] = None
This forces basic-pitch to bypass loading TensorFlow entirely and load the lightweight ONNX Runtime instead, reducing memory allocation from over 1.2 GB down to under 100 MB.
Sequential Processing (Stages 1 to 6)
Once Stage 0 outputs the raw MIDI, the pipeline runs synchronously within the worker thread:
Stage 1 (input_file_1): Basic cleaning of note lengths, filtering noise.
Stage 2 (input_file_2): Note-re-gluing pipeline, resolving disjointed note offsets.
Stage 3 (input_file_3): Melodic skyline logic (isolating the prominent melody line).
Stage 4 (input_file_4): Quantization of moving frequencies into fixed pitch classes.
Stage 5 (input_file_5): PopPiano arrangement modeling and styling.
Stage 6 (input_file_6): Adaptive grid timeline snapping.
5. Cloud Integration & Defensive Self-Healing
Lazy-Loading the Firebase SDK
Initializing Firebase Admin SDK (which relies on gRPC sockets and persistent background threads) at Gunicorn's startup leads to corrupted socket states after Gunicorn forks workers. To prevent this, the Firebase client is lazy-loaded when a job begins inside the active worker process:
code
Python
def _ensure_firebase(self):
    if not self.firebase_active and FIREBASE_AVAILABLE:
        self._init_firebase()
Dynamic Bucket Name Resolution
If the Firebase bucket name differs from the hardcoded configurations, the system self-heals by parsing the incoming audioUrl provided by the frontend:
code
Python
if "firebasestorage.googleapis.com" in audio_url:
    parsed_url = urlparse(audio_url)
    path = parsed_url.path
    if "/v0/b/" in path and "/o/" in path:
        b_start = path.find("/v0/b/") + 6
        b_end = path.find("/o/")
        bucket_name = path[b_start:b_end] # Dynamic bucket extraction
This extracted bucket name is used dynamically for both file downloads and uploading the final processed MIDI file, neutralizing hardcoded configuration errors.
6. Frontend to Backend Communication Topology
Secure File Upload: The client browser (app.js) uploads the raw audio file directly to Firebase Storage using uploadBytesResumable().
API Handshake: The browser sends an asynchronous POST request to the VM's secure proxy URL (https://...ngrok-free.app/transcribe).
Cross-Origin Resource Sharing (CORS): The Flask application relies on flask-cors to explicitly permit incoming cross-origin requests from https://t1era-music.netlify.app.
Asynchronous Threading: Flask instantly responds with an HTTP 202 QUEUED payload to keep the browser responsive, while launching the transcription pipeline in a background worker thread.
Status Sync: The backend updates progress metrics from 15% to 100% directly inside the Firebase Cloud Firestore document: users/{userId}/midi_jobs/{jobId}.
Browser Listening & Fallback: The frontend uses an active onSnapshot() listener on Firestore to progress the visual neon steps. If Firestore permissions or rules ever block the direct connection, app.js falls back to a mathematical string parser that safely calculates the target Firebase download link using:
https://firebasestorage.googleapis.com/v0/b/t1era-musicv1.firebasestorage.app/o/users%2F${userId}%2Ftranscriptions%2F${jobId}%2Ffinal_score.mid?alt=media
This design ensures complete separation of concerns between client storage and the specialized processing resources of your virtual machine.
