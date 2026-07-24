import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Firebase App Configuration (Configured from your credentials)
const firebaseConfig = {
  apiKey: "AIzaSyDpVqwUVpM2c41y2RF5IlPQwKW71iyyhc8",
  authDomain: "t1era-musicv1.firebaseapp.com",
  projectId: "t1era-musicv1",
  storageBucket: "t1era-musicv1.firebasestorage.app",
  messagingSenderId: "878684058813",
  appId: "1:878684058813:web:58f21cf930740fa68bb3d4",
  measurementId: "G-XX6MGLBDE4"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Track Auth State
let isAuthenticated = false;

onAuthStateChanged(auth, (user) => {
    if (user) {
        isAuthenticated = true;
    } else {
        isAuthenticated = false;
    }
});

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

    sound.play().catch(err => console.log("Audio playback restricted", err));

    loadingScreen.style.opacity = "1";
    
    v1.load();
    v2.load();

    setTimeout(typeEffect, 1200);
}

function typeEffect() {
    if (charIndex < textToType.length) {
        typewriterElement.textContent += textToType.charAt(charIndex);
        charIndex++;
        setTimeout(typeEffect, 150);
    } else {
        setTimeout(() => {
            sound.pause();
            loadingScreen.style.opacity = "0";

            v1.muted = false; 
            v1.play().then(() => {
                landingScreen.classList.add("active");
            }).catch(e => {
                v1.muted = true;
                v1.play().then(() => {
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
        console.log("Continuous loop transition error", err);
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

// Interactive Modal Action
enterBtn.addEventListener("click", () => {
    if (isAuthenticated) {
        runVerificationProcess();
    } else {
        enterBtn.classList.remove("show");
        authOverlay.classList.add("active");
    }
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
        // BLOCKED: For now, we block email/password creation with an upgrade pop-up
        authOverlay.classList.remove("active");
        maintenanceOverlay.classList.add("active");
    } else {
        // ALLOWED: Classic sign-in flow remains open if needed
        signInWithEmailAndPassword(auth, email, password)
            .then(() => {
                authOverlay.classList.remove("active");
                runVerificationProcess();
            })
            .catch((error) => {
                authErrorMsg.textContent = formatAuthErrors(error.code);
                authErrorMsg.style.display = "block";
            });
    }
});

// Handle Google Sign-In with popup (Runs for both login and signup state)
googleAuthBtn.addEventListener("click", () => {
    authErrorMsg.style.display = "none";
    signInWithPopup(auth, googleProvider)
        .then(() => {
            authOverlay.classList.remove("active");
            runVerificationProcess();
        })
        .catch((error) => {
            authErrorMsg.textContent = "Google Sign-In failed.";
            authErrorMsg.style.display = "block";
            console.log("Google error context:", error);
        });
});

// Dismiss maintenance alert modal
maintenanceCloseBtn.addEventListener("click", () => {
    maintenanceOverlay.classList.remove("active");
    // Bring user back to sign-in modal
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

// Authentication and Backend syncing timeline simulation
function runVerificationProcess() {
    verificationScreen.classList.add("active");
    
    const steps = [
        "Checking credentials...",
        "Authorizing network tokens...",
        "Retrieving studio environment assets...",
        "Syncing listening events from backend...",
        "Access Verified. Synchronizing audio core..."
    ];
    
    let currentStep = 0;
    
    function outputVerificationLine() {
        if (currentStep < steps.length) {
            verificationTerminal.textContent = steps[currentStep];
            currentStep++;
            setTimeout(outputVerificationLine, 1500);
        } else {
            verificationTerminal.style.color = "#00ff66";
            verificationTerminal.style.textShadow = "0 0 15px #00ff66";
            verificationTerminal.textContent = "Success!";
            
            setTimeout(() => {
                alert("Auth verified. Welcome to T1ERA Studio.");
                verificationScreen.classList.remove("active");
            }, 1000);
        }
    }
    
    outputVerificationLine();
}
