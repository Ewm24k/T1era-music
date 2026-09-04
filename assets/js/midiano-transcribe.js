document.addEventListener("DOMContentLoaded", () => {
    const btnTranscribe = document.getElementById("btn-transcribe");
    const btnCloseTranscribe = document.getElementById("btn-close-transcribe");
    const transcribeModal = document.getElementById("transcribe-modal");
    const modelCards = document.querySelectorAll("#transcribe-modal .model-card");
    const inputMethodsWrapper = document.getElementById("transcribe-input-methods-wrapper");
    const youtubeSubmitBtn = document.getElementById("transcribe-youtube-submit-btn");
    const youtubeLinkInput = document.getElementById("transcribe-youtube-link-input");
    const fileDropzoneTrigger = document.getElementById("transcribe-file-dropzone-trigger");
    const midiUploadCard = document.getElementById("transcribe-midi-upload-card");

    let selectedTranscribeModel = null;

    // Open Transcribe Modal
    btnTranscribe.addEventListener("click", () => {
        transcribeModal.style.display = "flex";
    });

    // Close Transcribe Modal
    btnCloseTranscribe.addEventListener("click", () => {
        transcribeModal.style.display = "none";
        resetTranscribeModal();
    });

    // Close on Background Click
    transcribeModal.addEventListener("click", (e) => {
        if (e.target === transcribeModal) {
            transcribeModal.style.display = "none";
            resetTranscribeModal();
        }
    });

    // Model Picker Selection
    modelCards.forEach((card) => {
        card.addEventListener("click", () => {
            selectedTranscribeModel = card.dataset.model;
            modelCards.forEach((c) => c.classList.remove("active"));
            card.classList.add("active");
            inputMethodsWrapper.classList.remove("selection-locked");
        });
    });

    // Reset Model Selection
    function resetTranscribeModal() {
        selectedTranscribeModel = null;
        modelCards.forEach((c) => c.classList.remove("active"));
        inputMethodsWrapper.classList.add("selection-locked");
        if (youtubeLinkInput) youtubeLinkInput.value = "";
    }

    // Submit YouTube Stream Link -> Redirection to Main Portal with query parameters
    youtubeSubmitBtn.addEventListener("click", () => {
        if (!selectedTranscribeModel) {
            alert("Please select an AI Neural Transcriber Engine first (Step 1).");
            return;
        }
        const urlValue = youtubeLinkInput ? youtubeLinkInput.value.trim() : "";
        if (!urlValue) {
            alert("Please enter a YouTube video URL first.");
            return;
        }
        // Redirect to portal page to execute upload/transcribe logic
        window.location.href = `index.html?action=transcribe&model=${selectedTranscribeModel}&youtube=${encodeURIComponent(urlValue)}`;
    });

    // Submit Local Audio File -> Redirection to Main Portal upload dropzone
    fileDropzoneTrigger.addEventListener("click", () => {
        if (!selectedTranscribeModel) {
            alert("Please select an AI Neural Transcriber Engine first (Step 1).");
            return;
        }
        // Redirect directly to upload console step on the portal page
        window.location.href = `index.html?action=transcribe&model=${selectedTranscribeModel}`;
    });

    // Upload MIDI File -> Closes modal and triggers original local file selector inside midiano
    midiUploadCard.addEventListener("click", () => {
        transcribeModal.style.display = "none";
        resetTranscribeModal();
        const mainFileInput = document.getElementById("midi-file");
        if (mainFileInput) {
            mainFileInput.click();
        }
    });
});
