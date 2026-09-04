// Initialize global setting states
window.showSplashParticles = true;
window.showKeyLabels = false;

document.addEventListener("DOMContentLoaded", () => {
    const btnSettings = document.getElementById("btn-settings");
    const btnCloseSettings = document.getElementById("btn-close-settings");
    const settingsModal = document.getElementById("settings-modal");
    const chkToggleSplash = document.getElementById("chk-toggle-splash");
    
    // Target Key Labels Selector Node
    const chkToggleLabels = document.getElementById("chk-toggle-labels");
    const pianoKeyboard = document.getElementById("piano-keyboard");

    // Open Settings Modal
    btnSettings.addEventListener("click", () => {
        settingsModal.style.display = "flex";
    });

    // Close Settings Modal
    btnCloseSettings.addEventListener("click", () => {
        settingsModal.style.display = "none";
    });

    // Close modal when clicking outside content area
    settingsModal.addEventListener("click", (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = "none";
        }
    });

    // Toggle Splash Particles Event Handler
    chkToggleSplash.addEventListener("change", (e) => {
        window.showSplashParticles = e.target.checked;
        if (!window.showSplashParticles) {
            // Instantly flush current array to prevent visual bugs / stuck frames
            if (typeof particles !== 'undefined') {
                particles.length = 0; 
            }
        }
    });

    // Toggle Keyboard Key Note Labels Event Handler
    chkToggleLabels.addEventListener("change", (e) => {
        window.showKeyLabels = e.target.checked;
        if (window.showKeyLabels) {
            pianoKeyboard.classList.add("show-labels");
        } else {
            pianoKeyboard.classList.remove("show-labels");
        }
    });
});
