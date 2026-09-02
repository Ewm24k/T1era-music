import { auth, db, storage } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    onSnapshot,
    doc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    ref as sRef, 
    getMetadata 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Local hardcoded mock tracks arrays mimicking the reference layout
const popularTracksData = [
    {
        id: 1,
        title: "Golden Days",
        artist: "Felix Carter",
        duration: "3:12",
        art: "https://picsum.photos/id/65/300/300"
    },
    {
        id: 2,
        title: "Fading Horizon",
        artist: "Ella Hunt",
        duration: "4:05",
        art: "https://picsum.photos/id/1025/300/300"
    },
    {
        id: 3,
        title: "Waves of Time",
        artist: "Lana Rivers",
        duration: "2:54",
        art: "https://picsum.photos/id/322/300/300"
    },
    {
        id: 4,
        title: "Electric Dreams",
        artist: "Mia Lowell",
        duration: "3:40",
        art: "https://picsum.photos/id/338/300/300"
    },
    {
        id: 5,
        title: "Shadows & Light",
        artist: "Ryan Miles",
        duration: "3:22",
        art: "https://picsum.photos/id/352/300/300"
    },
    {
        id: 6,
        title: "Echoes of Midnight",
        artist: "Jon Hickman",
        duration: "3:58",
        art: "https://picsum.photos/id/322/300/300"
    }
];

// Document Selectors
const popularGrid = document.getElementById("popular-tracks-grid");
const categoriesRow = document.getElementById("categories-row");

// Player details selectors
const playerAlbumArt = document.getElementById("player-album-art");
const playerTrackTitle = document.getElementById("player-track-title");
const playerTrackArtist = document.getElementById("player-track-artist");
const trackLength = document.getElementById("track-length");
const currentTime = document.getElementById("current-time");

const playPauseBtn = document.getElementById("player-play-btn");
const playPauseIcon = document.getElementById("play-pause-icon");

// Timeline trackers
const timelineTrack = document.getElementById("timeline-track");
const timelineFill = document.getElementById("timeline-fill");
const timelineThumb = document.getElementById("timeline-thumb");

// Volume trackers
const volumeTrack = document.getElementById("volume-track");
const volumeFill = document.getElementById("volume-fill");
const volumeThumb = document.getElementById("volume-thumb");

// MENEGAKKAN NAVIGASI TAB BAHARU (Home View vs Transcriptions View)
const navHome = document.getElementById("nav-home");
const navTranscriptions = document.getElementById("nav-transcriptions");
const homeView = document.getElementById("home-view");
const transcriptionsView = document.getElementById("transcriptions-view");
const transcriptionsList = document.getElementById("transcriptions-list");

let isPlaying = false;
let activeTrack = popularTracksData[5]; 
let tickerInterval = null;
let currentSeconds = 53; 

// Mengurus Pertukaran Tab Menu Sisi (Sidebar Navigation)
if (navHome && navTranscriptions) {
    navHome.addEventListener("click", (e) => {
        e.preventDefault();
        setActiveTab(navHome, homeView);
    });

    navTranscriptions.addEventListener("click", (e) => {
        e.preventDefault();
        setActiveTab(navTranscriptions, transcriptionsView);
        // Muat turun senarai transkripsi masa nyata dari Firestore
        loadUserTranscriptions();
    });
}

function setActiveTab(activeNavItem, activeViewElement) {
    // Kemaskini status butang navigasi bar sisi
    document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
    activeNavItem.classList.add("active");

    // Tukar paparan content utama
    homeView.style.display = "none";
    transcriptionsView.style.display = "none";
    activeViewElement.style.display = "block";
}

// Monitor Auth State and secure the dashboard page
let currentUser = null;

if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      const profileName = document.getElementById("profile-name");
      const profileAvatar = document.getElementById("profile-avatar");
      
      if (profileName) {
        profileName.textContent = user.displayName || "Studio Creator";
      }
      
      if (profileAvatar) {
        if (user.photoURL) {
          profileAvatar.innerHTML = `<img src="${user.photoURL}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
          const initials = user.email ? user.email.substring(0, 2).toUpperCase() : "ST";
          profileAvatar.textContent = initials;
          profileAvatar.style.fontSize = "0.85rem";
          profileAvatar.style.fontWeight = "bold";
          profileAvatar.style.color = "rgba(255,255,255,0.7)";
        }
      }
    } else {
      window.location.href = "index.html";
    }
  });
}

// ------------------------------------------------------------------
// MUAT TURUN SENARAI TRANSKRIPSI NYATA DARI FIRESTORE (My Transcriptions)
// ------------------------------------------------------------------
function loadUserTranscriptions() {
    if (!currentUser || !db) {
        // Paparkan demo olok-olok berkualiti tinggi jika tiada kredensial sedia ada (Fallback)
        renderTranscriptionsList(getMockTranscriptions());
        return;
    }

    transcriptionsList.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.4); font-size:0.9rem; padding:40px 0;">Loading transcriptions database...</div>`;

    // Ambil semua dokumen tugasan di bawah Firestore pengguna yang berstatus "COMPLETED"
    const jobsRef = collection(db, "users", currentUser.uid, "midi_jobs");
    const q = query(jobsRef, where("status", "==", "COMPLETED"));

    // Real-Time snapshot listener (Kini menggunakan .data() berbanding .to_dict() yang ralat)
    onSnapshot(q, async (snapshot) => {
        const rawJobs = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            rawJobs.push({
                id: doc.id,
                title: data.youtubeUrl ? extractYouTubeTitle(data.youtubeUrl) : "Local Uploaded Track",
                source: data.youtubeUrl ? "YOUTUBE" : "UPLOAD",
                midiUrl: data.midiUrl, // Pautan fail MIDI akhir (Stage 6) dari Firebase Storage
                originalMidiUrl: data.originalMidiUrl || null, // Pautan fail MIDI asal (Stage 0) dari Firebase Storage
                completedAt: data.completedAt || null,
                date: data.completedAt ? new Date(data.completedAt.seconds * 1000).toLocaleDateString() : "Just Now"
            });
        });

        // Pengesahan fizikal kewujudan fail MIDI dalam Firebase Storage secara asynchronous (Self-Healing)
        if (storage && rawJobs.length > 0) {
            const validationPromises = rawJobs.map(async (job) => {
                if (!job.midiUrl) return null;
                
                try {
                    // Cuba dapatkan metadata fail MIDI dalam Storage
                    const fileRef = sRef(storage, job.midiUrl);
                    await getMetadata(fileRef);
                    return job; // Fail wujud, lulus pengesahan
                } catch (error) {
                    // Jika ralat adalah fail tidak ditemui (Telah dipadam dari Storage secara manual)
                    if (error.code === 'storage/object-not-found' || error.message.includes('not found')) {
                        console.warn(`[DATA SELF-HEAL] Fail MIDI bagi Job ${job.id} telah dipadam di Storage. Memulakan pembersihan Firestore...`);
                        try {
                            // Padam dokumen metadata yatim piatu di Firestore secara automatik
                            await deleteDoc(doc(db, "users", currentUser.uid, "midi_jobs", job.id));
                            console.log(`[DATA SELF-HEAL SUCCESS] Metadata bagi Job ${job.id} berjaya dibersihkan.`);
                        } catch (fs_err) {
                            console.error("[DATA SELF-HEAL ERROR] Gagal membersihkan dokumen:", fs_err);
                        }
                    }
                    return null; // Gagal pengesahan kewujudan fizikal
                }
            });

            const results = await Promise.all(validationPromises);
            const validatedJobs = results.filter(job => job !== null);

            if (validatedJobs.length === 0) {
                renderTranscriptionsList(getMockTranscriptions());
            } else {
                // Urutkan secara tempatan mengikut masa siap (Newest / Last Generated first)
                validatedJobs.sort((a, b) => {
                    const timeA = a.completedAt ? a.completedAt.seconds : 0;
                    const timeB = b.completedAt ? b.completedAt.seconds : 0;
                    return timeB - timeA; // Tertib menurun (descending)
                });
                renderTranscriptionsList(validatedJobs);
            }
        } else {
            if (rawJobs.length === 0) {
                renderTranscriptionsList(getMockTranscriptions());
            } else {
                rawJobs.sort((a, b) => {
                    const timeA = a.completedAt ? a.completedAt.seconds : 0;
                    const timeB = b.completedAt ? b.completedAt.seconds : 0;
                    return timeB - timeA;
                });
                renderTranscriptionsList(rawJobs);
            }
        }
    }, (error) => {
        console.error("Firestore read failure:", error);
        renderTranscriptionsList(getMockTranscriptions());
    });
}

// Penterjemah Nama fail dari Pautan YouTube
function extractYouTubeTitle(url) {
    try {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
            return `YouTube Stream Audio (${match[2]})`;
        }
    } catch (e) {}
    return "YouTube Track Asset";
}

// Rekabentuk visual senarai lagu MIDI ala e-dagang/media player
function renderTranscriptionsList(list) {
    transcriptionsList.innerHTML = "";
    
    list.forEach((track, index) => {
        const indexStr = (index + 1).toString().padStart(2, "0");
        const row = document.createElement("div");
        row.className = "trans-row";
        
        const isYT = track.source === "YOUTUBE";
        const artClass = isYT ? "youtube" : "upload";
        const artIcon = isYT ? "📺" : "📁";
        const badgeLabel = isYT ? "YouTube" : "Upload";
        const badgeClass = isYT ? "youtube" : "upload";

        row.innerHTML = `
            <div class="trans-row__left">
                <span class="trans-row__index">${indexStr}</span>
                <div class="trans-row__art-wrap ${artClass}">${artIcon}</div>
                <div class="trans-row__meta">
                    <span class="trans-row__title">${track.title}</span>
                    <span class="trans-row__artist">${track.date || 'T1ERA Studio'}</span>
                </div>
            </div>
            <div class="trans-row__right">
                <span class="trans-badge ${badgeClass}">${badgeLabel}</span>
                <button class="trans-row__action" type="button">
                    <span>🎹</span> Open Studio
                </button>
            </div>
        `;

        // Integrasi klik tindakan pautan ke midiano.html
        row.addEventListener("click", () => {
            openStudioWithMidi(track.midiUrl);
        });

        transcriptionsList.appendChild(row);
    });
}

function openStudioWithMidi(midiUrl) {
    // Simpan fail ke storan tempatan dan lakukan pusingan navigasi automatik
    localStorage.setItem("t1era_current_midi", midiUrl);
    window.location.href = "midiano.html?midi=" + encodeURIComponent(midiUrl);
}

// Senarai Demo Fallback jika pangkalan data kosong
function getMockTranscriptions() {
    return [
        {
            id: "mock_1",
            title: "Scorpions - Still Loving You (Piano Arr.)",
            source: "YOUTUBE",
            midiUrl: "https://example.com/demo1.mid",
            date: "2026-08-30"
        },
        {
            id: "mock_2",
            title: "Custom Golden Days Session.wav",
            source: "UPLOAD",
            midiUrl: "https://example.com/demo2.mid",
            date: "2026-08-28"
        }
    ];
}

// ------------------------------------------------------------------
// PEMAIN POPULAR SONGS (Sedia Ada - Tidak Disentuh)
// ------------------------------------------------------------------
function renderPopularTracks() {
    popularGrid.innerHTML = "";
    popularTracksData.forEach(track => {
        const card = document.createElement("div");
        card.className = "track-card";
        card.innerHTML = `
            <img src="${track.art}" class="track-card-art" alt="Art">
            <div class="track-card-meta">
                <span class="track-card-title">${track.title}</span>
                <span class="track-card-artist">${track.artist}</span>
            </div>
        `;
        
        card.addEventListener("click", () => {
            selectAndPlayTrack(track);
        });
        popularGrid.appendChild(card);
    });
}

function selectAndPlayTrack(track) {
    activeTrack = track;
    playerAlbumArt.src = track.art;
    playerTrackTitle.textContent = track.title;
    playerTrackArtist.textContent = track.artist;
    trackLength.textContent = track.duration;
    
    currentSeconds = 0;
    currentTime.textContent = "0:00";
    timelineFill.style.width = "0%";
    timelineThumb.style.left = "0%";
    
    startPlaybackState();
}

playPauseBtn.addEventListener("click", () => {
    if (isPlaying) {
        pausePlaybackState();
    } else {
        startPlaybackState();
    }
});

function startPlaybackState() {
    isPlaying = true;
    playPauseIcon.textContent = "⏸";
    playPauseBtn.style.transform = "scale(1.1)";
    
    if (tickerInterval) clearInterval(tickerInterval);
    tickerInterval = setInterval(updatePlayerTick, 1000);
}

function pausePlaybackState() {
    isPlaying = false;
    playPauseIcon.textContent = "▶";
    playPauseBtn.style.transform = "";
    if (tickerInterval) clearInterval(tickerInterval);
}

function updatePlayerTick() {
    currentSeconds++;
    
    const lengthParts = activeTrack.duration.split(":");
    const totalDurationSeconds = parseInt(lengthParts[0]) * 60 + parseInt(lengthParts[1]);

    if (currentSeconds >= totalDurationSeconds) {
        currentSeconds = 0;
        pausePlaybackState();
    }

    const minutes = Math.floor(currentSeconds / 60);
    const seconds = (currentSeconds % 60).toString().padStart(2, "0");
    currentTime.textContent = `${minutes}:${seconds}`;

    const percentage = (currentSeconds / totalDurationSeconds) * 100;
    timelineFill.style.width = `${percentage}%`;
    timelineThumb.style.left = `${percentage}%`;
}

volumeTrack.addEventListener("click", (e) => {
    const rect = volumeTrack.getBoundingClientRect();
    const percent = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * 100;
    volumeFill.style.width = `${percent}%`;
    volumeThumb.style.left = `${percent}%`;
});

categoriesRow.addEventListener("click", (e) => {
    if (e.target.classList.contains("capsule")) {
        document.querySelectorAll(".capsule").forEach(c => c.classList.remove("active"));
        e.target.classList.add("active");
    }
});

// Logout Action
document.getElementById("dashboard-logout-btn").addEventListener("click", () => {
    if (confirm("Disconnect session?")) {
        if (auth) {
          signOut(auth)
            .then(() => {
                // Padam status pengesahan di dalam storan tempatan bagi mengelakkan ralat kitaran lintasan intro di index.html
                localStorage.removeItem("t1era_logged_in");
                window.location.href = "index.html";
            })
            .catch((err) => {
                console.error("Logout failed:", err);
                alert("Session disconnect failed. Try again.");
            });
        } else {
          localStorage.removeItem("t1era_logged_in");
          window.location.href = "index.html";
        }
    }
});

// Initial load
renderPopularTracks();
