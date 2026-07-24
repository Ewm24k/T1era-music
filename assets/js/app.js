import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase App Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDpVqwUVpM2c41y2RF5IlPQwKW71iyyhc8",
  authDomain: "t1era-musicv1.firebaseapp.com",
  projectId: "t1era-musicv1",
  storageBucket: "t1era-musicv1.firebasestorage.app",
  messagingSenderId: "878684058813",
  appId: "1:878684058813:web:58f21cf930740fa68bb3d4",
  measurementId: "G-XX6MGLBDE4"
};

// Initialize Firebase App gracefully
let app, auth, googleProvider;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
} catch (e) {
    console.error("Firebase SDK initialization error:", e);
}

// Track Auth State
let currentUserObj = null;
if (auth) {
    onAuthStateChanged(auth, (user) => {
        currentUserObj = user;
    });
}

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

// Maintenance Popups Controls
const maintenanceOverlay = document.getElementById("maintenance-overlay");
const maintenanceCloseBtn = document.getElementById("maintenance-close-btn");

// Services Hub Controls
const servicesOverlay = document.getElementById("services-overlay");

// Verification screen Controls
const verificationScreen = document.getElementById("verification-screen");
const verificationTerminal = document.getElementById("verification-terminal");

let isSignUpState = false;

// App Loading Logic
const textToType = "T1ERA Music Studio ...";
let charIndex = 0;

function triggerNativeFullscreen() {
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(err => console.log("Fullscreen request rejected", err));
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

    // Audio Play Safe-Fallback wrapper
    if (sound) {
        sound.play().catch(err => {
            console.warn("Background audio playback is restricted or file is missing:", err);
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
            v1.play().then(() => {
                landingScreen.classList.add("active");
            }).catch(e => {
                v1.muted = true;
                v1.play().then(() => {
                    landingScreen.classList.add("active");
                }).catch(err => {
                    console.error("Critical: Videos failed to auto-play.", err);
                    landingScreen.classList.add("active");
                });
            });
        }, 1500);
    }
}

overlay.addEventListener("click", launchFullscreenStudio);

// Video transition logic
v1.addEventListener('ended', () => {
    v2.play().then(() => {
        v2.style.opacity = "1";
        v1.style.opacity = "0";

        setTimeout(() => {
            enterBtn.classList.add("show");
        }, 4000);
    }).catch(err => {
        console.warn("Loop transition failed:", err);
    });
});

// Slide Menu
const menuToggle = document.getElementById('menu-toggle');
const sideMenu = document.getElementById('side-menu');
const menuOverlay = document.getElementById('menu-overlay');

function toggleMenu() {
    menuToggle.classList.toggle('active');
    sideMenu.classList.toggle('open');
    menuOverlay.classList.toggle('active');
}

menuToggle.addEventListener('click', toggleMenu);
menuOverlay.addEventListener('click', toggleMenu);

// Interactive Modal Action: Evaluates checks dynamically every time clicked
enterBtn.addEventListener("click", () => {
    enterBtn.classList.remove("show");
    runSessionVerification();
});

// Flip between login and registration layouts
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

// Intercept form submissions
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

// Handle Google Sign-In with robust configuration checks
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
            authErrorMsg.innerHTML = "<strong>Firebase Setup Required:</strong><br>Please enable the Google login provider inside your Firebase Console.";
        } else {
            authErrorMsg.textContent = "Google Login failed. Please try again.";
        }
        authErrorMsg.style.display = "block";
        enterBtn.classList.add("show");
        console.error("Firebase Auth Exception:", error);
    }
});

// Dismiss maintenance alert modal
maintenanceCloseBtn.addEventListener("click", () => {
    maintenanceOverlay.classList.remove("active");
    setTimeout(() => {
        authOverlay.classList.add("active");
    }, 400);
});

function formatAuthErrors(code) {
    switch (code) {
        case "auth/invalid-email": return "Invalid email formatting.";
        case "auth/wrong-password": return "Incorrect password details.";
        case "auth/user-not-found": return "No account matches this address.";
        default: return "Authentication failed. Try again.";
    }
}

// Dismiss auth forms on outside click
authOverlay.addEventListener("click", (e) => {
    if (e.target === authOverlay) {
        authOverlay.classList.remove("active");
        setTimeout(() => {
            enterBtn.classList.add("show");
        }, 500);
    }
});

// Dismiss Services overlay on outside click
servicesOverlay.addEventListener("click", (e) => {
    if (e.target === servicesOverlay) {
        servicesOverlay.classList.remove("active");
        setTimeout(() => {
            enterBtn.classList.add("show");
        }, 500);
    }
});

// Session Verification Logic
function runSessionVerification() {
    verificationScreen.classList.add("active");
    verificationTerminal.style.color = "#ffffff";
    verificationTerminal.style.textShadow = "0 0 10px #ffffff";
    
    verificationTerminal.textContent = "Verifying authorization sequence...";
    
    setTimeout(() => {
        verificationTerminal.textContent = "Querying live session credentials...";
        
        setTimeout(() => {
            // Read active user state directly from Firebase SDK
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
