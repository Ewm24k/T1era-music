// --- NEW WEB3 UPLOAD FUNCTIONALITIES ---

// DOM References
const youtubeLinkInput = document.getElementById("youtube-link-input");
const youtubeSubmitBtn = document.getElementById("youtube-submit-btn");
const fileDropzoneTrigger = document.getElementById("file-dropzone-trigger");
const audioFileInput = document.getElementById("audio-file-input");
const dropzoneLabelText = document.getElementById("dropzone-label-text");

// 1. YouTube Action validation handling
youtubeSubmitBtn.addEventListener("click", () => {
  const urlValue = youtubeLinkInput.value.trim();
  
  if (!urlValue) {
    alert("Please enter a YouTube video URL first.");
    return;
  }
  
  // Basic Regex checks to ensure link structure
  const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/./;
  if (!ytRegex.test(urlValue)) {
    alert("Invalid address. Please enter a structured YouTube link.");
    return;
  }

  alert(`Design State Verified: YouTube stream queued for generation:\n${urlValue}`);
});

// 2. Trigger native device folder selection on click
fileDropzoneTrigger.addEventListener("click", () => {
  audioFileInput.click();
});

// 3. Update Dropzone UI text automatically when file selection changes
audioFileInput.addEventListener("change", (event) => {
  const files = event.target.files;
  if (files && files.length > 0) {
    const selectedFile = files[0];
    
    // Update the visual text label to confirm file selection state
    dropzoneLabelText.textContent = selectedFile.name;
    dropzoneLabelText.style.color = "#10b981"; // Emerald confirmation green
    dropzoneLabelText.style.textShadow = "0 0 10px rgba(16, 185, 129, 0.4)";
    
    console.log("Device file select verified:", selectedFile);
  } else {
    // Revert state if no file was chosen
    dropzoneLabelText.textContent = "Select Music File";
    dropzoneLabelText.style.color = "";
    dropzoneLabelText.style.textShadow = "";
  }
});

// 4. Drag & Drop Visual Handlers for the Dropzone UI
fileDropzoneTrigger.addEventListener("dragover", (e) => {
  e.preventDefault();
  fileDropzoneTrigger.style.borderColor = "rgba(16, 185, 129, 1)";
  fileDropzoneTrigger.style.background = "rgba(16, 185, 129, 0.15)";
});

fileDropzoneTrigger.addEventListener("dragleave", () => {
  fileDropzoneTrigger.style.borderColor = "";
  fileDropzoneTrigger.style.background = "";
});

fileDropzoneTrigger.addEventListener("drop", (e) => {
  e.preventDefault();
  fileDropzoneTrigger.style.borderColor = "";
  fileDropzoneTrigger.style.background = "";

  const files = e.dataTransfer.files;
  if (files && files.length > 0) {
    audioFileInput.files = files; // Sync drag-dropped files with native input element
    
    // Trigger custom select event manually
    audioFileInput.dispatchEvent(new Event('change'));
  }
});
