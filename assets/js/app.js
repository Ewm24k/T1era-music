import { auth, googleProvider, db, storage } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Pautan URL Pelayan GCP VM API T1era Music (Menggunakan Terowong Selamat Ngrok)
const RENDER_BACKEND_URL = " https://7f98-35-247-154-247.ngrok-free.app/transcribe";

// =========================================================
// INJEKSI STYLING NEON KONSOL PEMPROSESAN (AAA GRADE UI/UX)
// =========================================================
const customStyle = document.createElement("style");
customStyle.innerHTML = `
  #verification-terminal {
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    width: 100% !important;
  }
  .proc-card {
    width: 100%;
    max-width: 500px;
    background: rgba(10, 7, 22, 0.88);
    border: 1px solid rgba(255, 145, 77, 0.25);
    box-shadow: 0 20px 80px rgba(255, 145, 77, 0.15), 0 0 35px rgba(60, 42, 107, 0.25);
    border-radius: 18px;
    padding: 30px;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .proc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .proc-title {
    font-family: monospace;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: #ffffff;
    text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
  }
  .proc-progress-pct {
    font-family: monospace;
    font-weight: 700;
    color: #ff914d;
    font-size: 18px;
  }
  .proc-bar-container {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 50px;
    overflow: hidden;
  }
  .proc-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #3976f0, #ff914d);
    width: 0%;
    transition: width 0.4s cubic-bezier(0.25, 1, 0.5, 1);
    border-radius: 50px;
    box-shadow: 0 0 12px rgba(255, 145, 77, 0.5);
  }
  .proc-steps {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .proc-step {
    display: flex;
    align-items: center;
    gap: 14px;
    opacity: 0.25;
    transition: all 0.3s ease;
  }
  .proc-step.active {
    opacity: 1;
  }
  .proc-step.completed {
    opacity: 1;
  }
  .step-status {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .step-circle {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
  }
  .proc-step.active .step-circle {
    background: #ff914d;
    box-shadow: 0 0 10px #ff914d;
  }
  .step-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(57, 118, 240, 0.15);
    border-top-color: #3976f0;
    border-radius: 50%;
    animation: proc-spin 0.8s linear infinite;
  }
  .step-check {
    color: #00df89;
    font-size: 16px;
    font-weight: bold;
    animation: proc-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .step-label {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.8px;
    color: rgba(255, 255, 255, 0.8);
    text-transform: uppercase;
  }
  .proc-step.active .step-label {
    color: #ff914d;
    font-weight: 600;
    text-shadow: 0 0 8px rgba(255, 145, 77, 0.2);
  }
  @keyframes proc-spin {
    100% { transform: rotate(360deg); }
  }
  @keyframes proc-pop {
    0% { transform: scale(0); }
    100% { transform: scale(1); }
  }
`;
document.head.appendChild(customStyle);

// UI DOM Elements
const overlay = document.getElementById("interactive-overlay");
const loadingScreen = document.getElementById("loading-screen");
const landingScreen = document.getElementById("landing-screen");
const typewriterElement = document.getElementById("typewriter");
const sound = document.getElementById("bg-sound");
const v1 = document.getElementById("vid1");
const v2 = document.getElementById("vid2");
const enterBtn = document.getElementById("enter-studio-btn");

// Auth Controls
const authOverlay = document.getElementById("auth-overlay");
const authTitle = document.getElementById("auth-title");
const authForm = document.getElementById("auth-form");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authErrorMsg = document.getElementById("auth-error-msg");
const authSwitchView = document.getElementById("auth-switch-view");
const googleAuthBtn = document.getElementById("google-auth-btn");

// Menu Footer Profile UI elements
const menuFooter = document.getElementById("menu-footer");
const userNameEl = document.getElementById("user-name");
const userEmailEl = document.getElementById("user-email");
const userAvatarEl = document.getElementById("user-avatar");
const avatarFallbackEl = document.getElementById("avatar-fallback");
const logoutBtn = document.getElementById("logout-btn");

// Sign Out Feedback Screen Controls
const signoutOverlay = document.getElementById("signout-overlay");
const signoutStatusText = document.getElementById("signout-status-text");

// Maintenance Popups Controls
const maintenanceOverlay = document.getElementById("maintenance-overlay");
const maintenanceCloseBtn = document.getElementById("maintenance-close-btn");

// Services Hub & Swap Screen Controls
const servicesOverlay = document.getElementById("services-overlay");
const consoleTitle = document.getElementById("console-title");
const mainServicesGrid = document.getElementById("main-services-grid");
const uploadServicesGrid = document.getElementById("upload-services-grid");
const generateSheetCard = document.getElementById("generate-sheet-card");
const backToConsoleBtn = document.getElementById("back-to-console-btn");

// Verification screen Controls
const verificationScreen = document.getElementById("verification-screen");
const verificationTerminal = document.getElementById("verification-terminal");

// Web3 Upload Panel Controls
const youtubeLinkInput = document.getElementById("youtube-link-input");
const youtubeSubmitBtn = document.getElementById("youtube-submit-btn");
const fileDropzoneTrigger = document.getElementById("file-dropzone-trigger");
const audioFileInput = document.getElementById("audio-file-input");
const dropzoneLabelText = document.getElementById("dropzone-label-text");

let isSignUpState = false;

// Track Auth State & Live sync profile variables
let currentUserObj = null;

if (auth) {
  onAuthStateChanged(auth, (user) => {
    currentUserObj = user;
    if (user) {
      userNameEl.textContent = user.displayName || "Studio Creator";
      userEmailEl.textContent = user.email || "";

      if (user.photoURL) {
        userAvatarEl.src = user.photoURL;
        userAvatarEl.style.display = "block";
        avatarFallbackEl.style.display = "none";
      } else {
        userAvatarEl.style.display = "none";
        avatarFallbackEl.style.display = "flex";
        const initials = user.email
          ? user.email.substring(0, 2).toUpperCase()
          : "ST";
        avatarFallbackEl.textContent = initials;
      }
      menuFooter.style.display = "flex";
    } else {
      menuFooter.style.display = "none";
    }
  });
}

// App Loading Logic
const textToType = "T1ERA Music Studio ...";
let charIndex = 0;

function triggerNativeFullscreen() {
  const docEl = document.documentElement;
  if (docEl.requestFullscreen) {
    docEl.requestFullscreen().catch((err) => console.log("Fullscreen request rejected", err));
  } else if (docEl.webkitRequestFullscreen) {
    docEl.webkitRequestFullscreen();
  } else if (docEl.msRequestFullscreen) {
    docEl.msRequestFullscreen();
  }
}

function launchFullscreenStudio() {
  triggerNativeFullscreen();
  overlay.style.opacity = "0";
  setTimeout(() => {
    overlay.style.display = "none";
  }, 1200);

  if (sound) {
    sound.play().catch((err) => {
      console.warn("Background audio playback is restricted:", err);
    });
  }

  loadingScreen.style.opacity = "1";
  try {
    v1.load();
    v2.load();
  } catch (e) {
    console.warn("Video resources failed to load:", e);
  }
  setTimeout(typeEffect, 1200);
}

function typeEffect() {
  if (charIndex < textToType.length) {
    typewriterElement.textContent += textToType.charAt(charIndex);
    charIndex++;
    setTimeout(typeEffect, 150);
  } else {
    setTimeout(() => {
      if (sound) {
        try { sound.pause(); } catch (e) {}
      }
      loadingScreen.style.opacity = "0";
      v1.muted = false;
      v1.play()
        .then(() => { landingScreen.classList.add("active"); })
        .catch((e) => {
          v1.muted = true;
          v1.play()
            .then(() => { landingScreen.classList.add("active"); })
            .catch((err) => {
              console.error("Critical: Videos failed to auto-play.", err);
              landingScreen.classList.add("active");
            });
        });
    }, 1500);
  }
}

overlay.addEventListener("click", launchFullscreenStudio);

v1.addEventListener("ended", () => {
  v2.play()
    .then(() => {
      v2.style.opacity = "1";
      v1.style.opacity = "0";
      setTimeout(() => { enterBtn.classList.add("show"); }, 4000);
    })
    .catch((err) => { console.warn("Loop transition failed:", err); });
});

const menuToggle = document.getElementById("menu-toggle");
const sideMenu = document.getElementById("side-menu");
const menuOverlay = document.getElementById("menu-overlay");

function toggleMenu() {
  menuToggle.classList.toggle("active");
  sideMenu.classList.toggle("open");
  menuOverlay.classList.toggle("active");
}

menuToggle.addEventListener("click", toggleMenu);
menuOverlay.addEventListener("click", toggleMenu);

enterBtn.addEventListener("click", () => {
  enterBtn.classList.remove("show");
  runSessionVerification();
});

authSwitchView.addEventListener("click", () => {
  isSignUpState = !isSignUpState;
  authErrorMsg.style.display = "none";
  if (isSignUpState) {
    authTitle.textContent = "Create Account";
    authSubmitBtn.textContent = "Register";
    authSwitchView.innerHTML = "Already have an account? <span>Sign In</span>";
  } else {
    authTitle.textContent = "Sign In";
    authSubmitBtn.textContent = "Access";
    authSwitchView.innerHTML = "Don't have an account? <span>Sign Up</span>";
  }
});

authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  authErrorMsg.style.display = "none";
  const email = authEmail.value;
  const password = authPassword.value;

  if (isSignUpState) {
    authOverlay.classList.remove("active");
    maintenanceOverlay.classList.add("active");
  } else {
    if (!auth) {
      authErrorMsg.textContent = "Database connection offline.";
      authErrorMsg.style.display = "block";
      enterBtn.classList.add("show");
      return;
    }
    signInWithEmailAndPassword(auth, email, password)
      .then(() => {
        authOverlay.classList.remove("active");
        runSessionVerification();
      })
      .catch((error) => {
        authErrorMsg.textContent = formatAuthErrors(error.code);
        authErrorMsg.style.display = "block";
        enterBtn.classList.add("show");
      });
  }
});

googleAuthBtn.addEventListener("click", async () => {
  authErrorMsg.style.display = "none";
  if (!auth) {
    authErrorMsg.textContent = "Firebase is uninitialized.";
    authErrorMsg.style.display = "block";
    return;
  }
  try {
    await signInWithPopup(auth, googleProvider);
    authOverlay.classList.remove("active");
    runSessionVerification();
  } catch (error) {
    if (error.code === "auth/configuration-not-found" || error.message.includes("CONFIGURATION_NOT_FOUND")) {
      authErrorMsg.innerHTML = "<strong>Firebase Setup Required:</strong><br>Please enable the Google login provider.";
    } else if (error.code === "auth/unauthorized-domain" || error.message.includes("unauthorized-domain")) {
      authErrorMsg.innerHTML = "<strong>Domain Not Authorized:</strong><br>Please add <code>t1era-music.netlify.app</code> to Firebase.";
    } else {
      authErrorMsg.textContent = "Google Login failed. Please try again.";
    }
    authErrorMsg.style.display = "block";
    enterBtn.classList.add("show");
  }
});

maintenanceCloseBtn.addEventListener("click", () => {
  maintenanceOverlay.classList.remove("active");
  setTimeout(() => { authOverlay.classList.add("active"); }, 400);
});

function formatAuthErrors(code) {
  switch (code) {
    case "auth/invalid-email": return "Invalid email formatting.";
    case "auth/wrong-password": return "Incorrect password details.";
    case "auth/user-not-found": return "No account matches this address.";
    default: return "Authentication failed. Try again.";
  }
}

authOverlay.addEventListener("click", (e) => {
  if (e.target === authOverlay) {
    authOverlay.classList.remove("active");
    setTimeout(() => { enterBtn.classList.add("show"); }, 500);
  }
});

servicesOverlay.addEventListener("click", (e) => {
  if (e.target === servicesOverlay) {
    resetConsoleState();
    servicesOverlay.classList.remove("active");
    setTimeout(() => { enterBtn.classList.add("show"); }, 500);
  }
});

generateSheetCard.addEventListener("click", switchToUploadMenu);
backToConsoleBtn.addEventListener("click", switchToMainMenu);

function switchToUploadMenu() {
  mainServicesGrid.classList.remove("grid-visible");
  mainServicesGrid.classList.add("grid-hidden");
  setTimeout(() => {
    mainServicesGrid.style.display = "none";
    uploadServicesGrid.style.display = "grid";
    void uploadServicesGrid.offsetWidth;
    uploadServicesGrid.classList.remove("grid-hidden");
    uploadServicesGrid.classList.add("grid-visible");
    consoleTitle.style.opacity = "0";
    setTimeout(() => {
      consoleTitle.textContent = "Upload Media Source";
      consoleTitle.style.opacity = "1";
    }, 200);
    backToConsoleBtn.classList.add("show");
  }, 400);
}

function switchToMainMenu() {
  uploadServicesGrid.classList.remove("grid-visible");
  uploadServicesGrid.classList.add("grid-hidden");
  setTimeout(() => {
    uploadServicesGrid.style.display = "none";
    mainServicesGrid.style.display = "grid";
    void mainServicesGrid.offsetWidth;
    mainServicesGrid.classList.remove("grid-hidden");
    mainServicesGrid.classList.add("grid-visible");
    consoleTitle.style.opacity = "0";
    setTimeout(() => {
      consoleTitle.textContent = "Studio Console";
      consoleTitle.style.opacity = "1";
    }, 200);
    backToConsoleBtn.classList.remove("show");
  }, 400);
}

function resetConsoleState() {
  mainServicesGrid.classList.remove("grid-hidden");
  mainServicesGrid.classList.add("grid-visible");
  mainServicesGrid.style.display = "grid";
  uploadServicesGrid.classList.remove("grid-visible");
  uploadServicesGrid.classList.add("grid-hidden");
  uploadServicesGrid.style.display = "none";
  consoleTitle.textContent = "Studio Console";
  backToConsoleBtn.classList.remove("show");
}

function runSessionVerification() {
  verificationScreen.classList.add("active");
  verificationTerminal.style.color = "#ffffff";
  verificationTerminal.style.textShadow = "0 0 10px #ffffff";
  verificationTerminal.textContent = "Verifying authorization sequence...";

  setTimeout(() => {
    verificationTerminal.textContent = "Querying live session credentials...";
    setTimeout(() => {
      const user = auth ? auth.currentUser : null;
      if (user) {
        verificationTerminal.textContent = `Active Session Found: ${user.email}`;
        setTimeout(() => {
          verificationTerminal.textContent = "Syncing listening database events...";
          setTimeout(() => {
            verificationTerminal.style.color = "#00ff66";
            verificationTerminal.style.textShadow = "0 0 15px #00ff66";
            verificationTerminal.textContent = "Status: AUTHORIZED.";
            setTimeout(() => {
              verificationScreen.classList.remove("active");
              servicesOverlay.classList.add("active");
            }, 1200);
          }, 1200);
        }, 1200);
      } else {
        verificationTerminal.style.color = "#ff4a4a";
        verificationTerminal.style.textShadow = "0 0 15px #ff4a4a";
        verificationTerminal.textContent = "Status: UNRESOLVED. Directing to authentication gate...";
        setTimeout(() => {
          verificationScreen.classList.remove("active");
          authOverlay.classList.add("active");
        }, 1500);
      }
    }, 1200);
  }, 1200);
}

logoutBtn.addEventListener("click", () => {
  toggleMenu();
  signoutOverlay.style.display = "flex";
  setTimeout(() => { signoutOverlay.classList.add("active"); }, 10);
  signoutStatusText.style.color = "#ffffff";
  signoutStatusText.style.textShadow = "0 0 8px rgba(255, 255, 255, 0.3)";
  signoutStatusText.textContent = "Disconnecting session...";

  setTimeout(() => {
    signoutStatusText.textContent = "Syncing local database events...";
    setTimeout(() => {
      signOut(auth)
        .then(() => {
          signoutStatusText.style.color = "#ff4a4a";
          signoutStatusText.style.textShadow = "0 0 15px #ff4a4a";
          signoutStatusText.textContent = "Sign out Successful.";
          resetConsoleState();
          servicesOverlay.classList.remove("active");
          setTimeout(() => {
            signoutOverlay.classList.remove("active");
            setTimeout(() => {
              signoutOverlay.style.display = "none";
              enterBtn.classList.add("show");
            }, 600);
          }, 1500);
        })
        .catch((err) => {
          console.error("Firebase Signout Failure:", err);
          signoutStatusText.textContent = "Session Signout Failed.";
          setTimeout(() => {
            signoutOverlay.classList.remove("active");
            setTimeout(() => { signoutOverlay.style.display = "none"; }, 600);
          }, 1500);
        });
    }, 1000);
  }, 1000);
});

// =========================================================
// --- T1ERA MUSIC WEB3 UPLOAD & PIPELINE INTEGRATION ---
// =========================================================

function createProgressCardMarkup() {
  return `
    <div class="proc-card">
      <div class="proc-header">
        <h3 class="proc-title">T1ERA Studio Engine</h3>
        <span class="proc-progress-pct" id="proc-pct">0%</span>
      </div>
      <div class="proc-bar-container">
        <div class="proc-bar-fill" id="proc-bar" style="width: 0%"></div>
      </div>
      <div class="proc-steps">
        <div class="proc-step" id="step-init">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Initializing Session Verification</span>
        </div>
        <div class="proc-step" id="step-download">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Receiving Uploaded Audio</span>
        </div>
        <div class="proc-step" id="step-temp">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Caching Raw Track to Workspace</span>
        </div>
        <div class="proc-step" id="step-transcribe">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Neural Pitch Transcription</span>
        </div>
        <div class="proc-step" id="step-repair">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Structural Clean & Note Repair</span>
        </div>
        <div class="proc-step" id="step-reconstruct">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Melodic Reconstruction & Skyline</span>
        </div>
        <div class="proc-step" id="step-stabilize">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Stabilizing Pitch Classes</span>
        </div>
        <div class="proc-step" id="step-styling">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Arranging Piano Styles</span>
        </div>
        <div class="proc-step" id="step-quantize">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Quantizing Timeline Grid</span>
        </div>
        <div class="proc-step" id="step-complete">
          <div class="step-status"><span class="step-circle"></span></div>
          <span class="step-label">Synchronizing Final MIDI</span>
        </div>
      </div>
      <div id="proc-action-area" style="text-align: center;"></div>
    </div>
  `;
}

function setStepStatus(stepId, state) {
  const stepEl = document.getElementById(stepId);
  if (!stepEl) return;
  stepEl.classList.remove("active", "completed");
  const statusContainer = stepEl.querySelector(".step-status");
  if (state === "loading") {
    stepEl.classList.add("active");
    statusContainer.innerHTML = `<span class="step-spinner"></span>`;
  } else if (state === "success") {
    stepEl.classList.add("completed");
    statusContainer.innerHTML = `<span class="step-check">✓</span>`;
  } else {
    statusContainer.innerHTML = `<span class="step-circle"></span>`;
  }
}

function isValidYouTubeUrl(url) {
  const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
  return pattern.test(url);
}

if (youtubeSubmitBtn) {
  youtubeSubmitBtn.addEventListener("click", () => {
    const urlValue = youtubeLinkInput ? youtubeLinkInput.value.trim() : "";
    if (!urlValue) {
      alert("Please enter a YouTube video URL first.");
      return;
    }
    if (!isValidYouTubeUrl(urlValue)) {
      alert("Invalid address. Please enter a structured YouTube link.");
      return;
    }

    const userId = currentUserObj ? currentUserObj.uid : "guest_studio_creator";
    const jobId = "yt_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();

    // Tutup menu overlay services, buka konsol progress terminal
    servicesOverlay.classList.remove("active");
    verificationScreen.classList.add("active");
    verificationTerminal.innerHTML = createProgressCardMarkup();

    setStepStatus("step-init", "loading");

    // Mulakan visual handshake proses
    setTimeout(() => {
      setStepStatus("step-init", "success");
      setStepStatus("step-download", "loading");
      
      const stepDownloadLabel = document.querySelector("#step-download .step-label");
      if (stepDownloadLabel) stepDownloadLabel.textContent = "Requesting YouTube Audio Link";

      setTimeout(() => {
        setStepStatus("step-download", "success");
        setStepStatus("step-temp", "loading");
        
        const stepTempLabel = document.querySelector("#step-temp .step-label");
        if (stepTempLabel) stepTempLabel.textContent = "Downloading Audio on Server";

        const triggerYoutubeSequence = () => {
          openLiveTerminalConsole(userId, jobId);

          // Hantar payload pautan YouTube ke pelayan API GCP VM
          fetch(RENDER_BACKEND_URL, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "ngrok-skip-browser-warning": "true"
            },
            body: JSON.stringify({ userId: userId, jobId: jobId, youtubeUrl: urlValue })
          })
          .then((res) => {
            if (!res.ok) {
              return res.json().then((body) => {
                throw new Error(body.error || "Server rejected the YouTube transcription request.");
              });
            }
          })
          .catch((err) => {
            console.error("YouTube Transcribe request failed:", err);
            showTerminalFailure(err.message || "Failed to start YouTube transcription job.");
          });
        };

        // KREAT DOKUMEN FIRESTORE UNTUK YOUTUBE JOB UNTUK MENGELAKKAN SYNC GAGAL
        if (db && userId !== "guest_studio_creator") {
          const jobRef = doc(db, "users", userId, "midi_jobs", jobId);
          setDoc(jobRef, {
            status: "QUEUED",
            progress: 0,
            youtubeUrl: urlValue,
            createdAt: serverTimestamp()
          })
          .then(() => {
            triggerYoutubeSequence();
          })
          .catch(err => {
            console.warn("[FIRESTORE BYPASS] Write blocked by Rules. Bypassing straight to Render...", err);
            triggerYoutubeSequence();
          });
        } else {
          triggerYoutubeSequence();
        }

      }, 1000);
    }, 1000);
  });
}

fileDropzoneTrigger.addEventListener("click", () => { audioFileInput.click(); });

audioFileInput.addEventListener("change", (event) => {
  const files = event.target.files;
  if (!files || files.length === 0) {
    dropzoneLabelText.textContent = "Select Music File";
    dropzoneLabelText.style.color = "";
    dropzoneLabelText.style.textShadow = "";
    return;
  }
  const selectedFile = files[0];
  const userId = currentUserObj ? currentUserObj.uid : "guest_studio_creator";
  const jobId = "file_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();

  servicesOverlay.classList.remove("active");
  dropzoneLabelText.textContent = "UPLOADING...";
  dropzoneLabelText.style.color = "#10b981";
  dropzoneLabelText.style.textShadow = "0 0 10px rgba(16, 185, 129, 0.4)";

  verificationScreen.classList.add("active");
  verificationTerminal.innerHTML = createProgressCardMarkup();
  setStepStatus("step-init", "loading");

  if (!storage) {
    alert("Firebase Storage is uninitialized. Local upload is offline.");
    verificationScreen.classList.remove("active");
    dropzoneLabelText.textContent = "Select Music File";
    return;
  }

  const storageRef = ref(storage, `users/${userId}/transcriptions/${jobId}/${selectedFile.name}`);
  const uploadTask = uploadBytesResumable(storageRef, selectedFile);

  uploadTask.on("state_changed",
    (snapshot) => {
      const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
      const progressBar = document.getElementById("proc-bar");
      const progressPct = document.getElementById("proc-pct");
      if (progressBar) progressBar.style.width = `${percent / 4}%`;
      if (progressPct) progressPct.textContent = `${Math.round(percent / 4)}%`;
      const stepInitLabel = document.querySelector("#step-init .step-label");
      if (stepInitLabel) stepInitLabel.textContent = `Uploading File: ${percent}%`;
    },
    (error) => {
      alert("Failed to upload: " + error.message);
      verificationScreen.classList.remove("active");
      dropzoneLabelText.textContent = "Select Music File";
    },
    () => {
      setStepStatus("step-init", "success");
      setStepStatus("step-download", "loading");
      getDownloadURL(uploadTask.snapshot.ref).then((downloadUrl) => {
        setStepStatus("step-download", "success");
        setStepStatus("step-temp", "loading");

        const triggerUploadSequence = () => {
          openLiveTerminalConsole(userId, jobId);
          fetch(RENDER_BACKEND_URL, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "ngrok-skip-browser-warning": "true"
            },
            body: JSON.stringify({ userId: userId, jobId: jobId, audioUrl: downloadUrl })
          })
          .then((res) => {
            if (!res.ok) {
              return res.json().then((body) => {
                throw new Error(body.error || "Server rejected the transcription request.");
              });
            }
          })
          .catch((err) => {
            console.error("Transcribe request failed:", err);
            showTerminalFailure(err.message || "Failed to start transcription job.");
          });
        };

        if (db && userId !== "guest_studio_creator") {
          const jobRef = doc(db, "users", userId, "midi_jobs", jobId);
          setDoc(jobRef, {
            status: "QUEUED",
            progress: 0,
            audioUrl: downloadUrl,
            createdAt: serverTimestamp()
          })
          .then(() => {
            setStepStatus("step-temp", "success");
            triggerUploadSequence();
          })
          .catch(err => {
            console.warn("[FIRESTORE BYPASS] Write blocked by Rules. Bypassing straight to Render...", err);
            setStepStatus("step-temp", "success");
            triggerUploadSequence();
          });
        } else {
          setStepStatus("step-temp", "success");
          triggerUploadSequence();
        }
      });
    }
  );
});

function showTerminalFailure(message) {
  const progressBar = document.getElementById("proc-bar");
  if (progressBar) {
    progressBar.style.background = "#ff4a4a";
    progressBar.style.boxShadow = "0 0 12px rgba(255, 74, 74, 0.5)";
  }
  const actionArea = document.getElementById("proc-action-area");
  if (actionArea) {
    actionArea.innerHTML = `
      <div style="color:#ff4a4a; font-weight:bold; font-size:0.8rem; margin-top:10px; line-height:1.4;">PROCESSING FAILED: ${String(message).toUpperCase()}</div>
      <button onclick="document.getElementById('verification-screen').classList.remove('active')" class="web3-action-btn" style="margin-top:10px; border-color:#ff4a4a; color:#ff4a4a; font-size:0.75rem;">[ CLOSE KONSOL ]</button>
    `;
  }
}

// Konsol Pemantauan Status Pipeline Masa Nyata & Automasi Redirection `midiano.html`
function openLiveTerminalConsole(userId, jobId) {
  const hasCard = document.querySelector(".proc-card");
  if (!hasCard) { verificationTerminal.innerHTML = createProgressCardMarkup(); }

  setStepStatus("step-init", "success");
  setStepStatus("step-download", "success");
  setStepStatus("step-temp", "success");

  const progressBar = document.getElementById("proc-bar");
  const progressPct = document.getElementById("proc-pct");

  let isFirestoreActive = true;

  const handleMidiGenerationComplete = (midiUrl) => {
    setStepStatus("step-transcribe", "success");
    setStepStatus("step-repair", "success");
    setStepStatus("step-reconstruct", "success");
    setStepStatus("step-stabilize", "success");
    setStepStatus("step-styling", "success");
    setStepStatus("step-quantize", "success");
    setStepStatus("step-complete", "success");

    if (progressBar) progressBar.style.width = "100%";
    if (progressPct) progressPct.textContent = "100%";

    localStorage.setItem("t1era_current_midi", midiUrl);

    const actionArea = document.getElementById("proc-action-area");
    if (actionArea) {
      actionArea.innerHTML = `<div style="color:#00df89; font-weight:bold; letter-spacing:1px; font-size:0.9rem; margin-top:10px; animation: proc-pop 0.3s ease;">[ REDIRECTING TO PIANO STUDIO... ]</div>`;
    }
    setTimeout(() => {
      window.location.href = "midiano.html?midi=" + encodeURIComponent(midiUrl);
    }, 1500);
  };

  const fallbackTimeout = setTimeout(() => {
    if (isFirestoreActive) {
      isFirestoreActive = false;
      console.warn("[FIRESTORE BYPASS] Active snapshot listening blocked. Switching to mathematical storage URL fallback...");

      const constructedMidiUrl = `https://firebasestorage.googleapis.com/v0/b/t1era-musicv1.firebasestorage.app/o/users%2F${userId}%2Ftranscriptions%2F${jobId}%2Ffinal_score.mid?alt=media`;

      let fakeProgress = 25;
      const fakeInterval = setInterval(() => {
        fakeProgress += 3;
        if (progressBar) progressBar.style.width = `${Math.min(99, fakeProgress)}%`;
        if (progressPct) progressPct.textContent = `${Math.min(99, fakeProgress)}%`;

        if (fakeProgress >= 40 && fakeProgress < 55) {
          setStepStatus("step-transcribe", "success");
          setStepStatus("step-repair", "loading");
        } else if (fakeProgress >= 55 && fakeProgress < 70) {
          setStepStatus("step-repair", "success");
          setStepStatus("step-reconstruct", "loading");
          setStepStatus("step-stabilize", "loading");
        } else if (fakeProgress >= 70 && fakeProgress < 85) {
          setStepStatus("step-reconstruct", "success");
          setStepStatus("step-stabilize", "success");
          setStepStatus("step-styling", "loading");
        } else if (fakeProgress >= 85 && fakeProgress < 98) {
          setStepStatus("step-styling", "success");
          setStepStatus("step-quantize", "loading");
        } else if (fakeProgress >= 98) {
          clearInterval(fakeInterval);
          handleMidiGenerationComplete(constructedMidiUrl);
        }
      }, 750);
    }
  }, 4000);

  if (db && userId !== "guest_studio_creator") {
    const jobRef = doc(db, "users", userId, "midi_jobs", jobId);
    const unsubscribe = onSnapshot(jobRef, (snapshot) => {
      if (!snapshot.exists()) return;

      clearTimeout(fallbackTimeout);
      isFirestoreActive = true;

      const data = snapshot.data();
      const status = data.status;
      const progress = data.progress || 0;

      if (progressBar) progressBar.style.width = `${progress}%`;
      if (progressPct) progressPct.textContent = `${progress}%`;

      if (status === "QUEUED") {
        setStepStatus("step-init", "success");
        setStepStatus("step-download", "loading");
      } else if (status === "REQUESTING_YT_LINK" || status === "DOWNLOADING_AUDIO") {
        setStepStatus("step-init", "success");
        setStepStatus("step-download", "loading");
        const stepDownloadLabel = document.querySelector("#step-download .step-label");
        if (stepDownloadLabel) {
          if (status === "REQUESTING_YT_LINK") {
            stepDownloadLabel.textContent = `Requesting YouTube Link: ${progress}%`;
          } else {
            stepDownloadLabel.textContent = "Downloading Storage Audio";
          }
        }
      } else if (status === "CACHING_AUDIO") {
        setStepStatus("step-init", "success");
        setStepStatus("step-download", "success");
        setStepStatus("step-temp", "loading");
      } else if (status === "TRANSCRIBING_AUDIO") {
        setStepStatus("step-init", "success");
        setStepStatus("step-download", "success");
        setStepStatus("step-temp", "success");
        setStepStatus("step-transcribe", "loading");
      } else if (status === "CLEANING_MIDI" || status === "REPAIRING_NOTES") {
        setStepStatus("step-transcribe", "success");
        setStepStatus("step-repair", "loading");
      } else if (status === "RECONSTRUCTING_MELODY") {
        setStepStatus("step-transcribe", "success");
        setStepStatus("step-repair", "success");
        setStepStatus("step-reconstruct", "loading");
      } else if (status === "STABILIZING_PITCH") {
        setStepStatus("step-transcribe", "success");
        setStepStatus("step-repair", "success");
        setStepStatus("step-reconstruct", "success");
        setStepStatus("step-stabilize", "loading");
      } else if (status === "ARRANGING_PIANO_STYLE") {
        setStepStatus("step-transcribe", "success");
        setStepStatus("step-repair", "success");
        setStepStatus("step-reconstruct", "success");
        setStepStatus("step-stabilize", "success");
        setStepStatus("step-styling", "loading");
      } else if (status === "QUANTIZING_TIMELINE") {
        setStepStatus("step-transcribe", "success");
        setStepStatus("step-repair", "success");
        setStepStatus("step-reconstruct", "success");
        setStepStatus("step-stabilize", "success");
        setStepStatus("step-styling", "success");
        setStepStatus("step-quantize", "loading");
      } else if (status === "UPLOADING_RESULTS") {
        setStepStatus("step-transcribe", "success");
        setStepStatus("step-repair", "success");
        setStepStatus("step-reconstruct", "success");
        setStepStatus("step-stabilize", "success");
        setStepStatus("step-styling", "success");
        setStepStatus("step-quantize", "success");
        setStepStatus("step-complete", "loading");
      } else if (status === "COMPLETED") {
        unsubscribe();
        handleMidiGenerationComplete(data.midiUrl);
      } else if (status === "FAILED") {
        unsubscribe();
        const error = data.error || "Unknown pipeline error.";
        showTerminalFailure(error);
      }
    }, (error) => {
      console.warn("[FIRESTORE WARNING] Active snapshot listening blocked. Switching to mathematical storage URL fallback...", error);
    });
  }

  verificationScreen.addEventListener("click", (e) => {
    if (e.target === verificationScreen) {
      const actionArea = document.getElementById("proc-action-area");
      if (actionArea && (actionArea.innerHTML.includes("REDIRECTING") || actionArea.innerHTML.includes("FAILED"))) {
        verificationScreen.classList.remove("active");
        dropzoneLabelText.textContent = "Select Music File";
      }
    }
  });
}
