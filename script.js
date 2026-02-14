// 1. Connection Config
const supabaseUrl = "https://vmwspfmgbwxvcbdgarll.supabase.co";
const supabaseKey = "sb_publishable_CNMCRrlx8l0jiZTeGMcEXw_tHIW_0Re";
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

// 2. SVGs & UI Elements
const sunSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
const moonSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

const qrInput = document.getElementById("qr-input");
const tableBody = document.getElementById("table-body");
const statsContainer = document.getElementById("stats-container");
const specSelect = document.getElementById("filter-spec");

let html5QrCode;
let isProcessing = false;
let showingDeleted = false;
let currentUserProfile = null;
let isGuestMode = true; // Start in guest mode by default

// 3. Sound Effects
function playSuccessSound() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.frequency.value = 800;
  oscillator.type = "sine";
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.01,
    audioContext.currentTime + 0.5,
  );
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}

function playErrorSound() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.frequency.value = 200;
  oscillator.type = "sawtooth";
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.01,
    audioContext.currentTime + 0.3,
  );
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.3);
}

// --- AUTHENTICATION LOGIC ---
async function handleLogin() {
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  if (!email || !password) return alert("Enter email and password");

  const { data, error } = await _supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) return alert("Login failed: " + error.message);

  const { data: profile } = await _supabase
    .from("profiles")
    .select("role, full_name, assigned_class")
    .eq("id", data.user.id)
    .single();
  if (profile) {
    isGuestMode = false; // Exit guest mode when logging in
    showApp(profile);
  }
}

function showApp(profile) {
  currentUserProfile = profile;
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main-app").classList.remove("hidden");

  const greetingEl = document.getElementById("user-greeting");
  if (greetingEl) {
    const nameToDisplay = profile.full_name || profile.role.toUpperCase();
    greetingEl.innerText = `Welcome, ${nameToDisplay}`;
  }

  // In guest mode, treat as admin for UI purposes (show specialty filter)
  const isAdmin = profile.role === "admin" || isGuestMode;
  const specFilter = document.getElementById("filter-spec");
  if (specFilter) specFilter.style.display = isAdmin ? "" : "none";

  // Only show "View Deleted" button for actual admin users who are NOT in guest mode
  const delBtn = document.getElementById("btn-view-deleted");
  if (delBtn) {
    if (profile.role === "admin" && !isGuestMode) {
      delBtn.classList.remove("hidden");
    } else {
      delBtn.classList.add("hidden");
    }
  }

  // Update logout button text based on mode
  updateAuthButton();

  updateUI();
  qrInput.focus();
}

async function handleLogout() {
  if (isGuestMode) {
    // In guest mode, "Login" button shows the login screen
    document.getElementById("main-app").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
  } else {
    // In authenticated mode, logout and reload
    await _supabase.auth.signOut();
    window.location.reload();
  }
}

// New function to update auth button text
function updateAuthButton() {
  const logoutBtn = document.querySelector('.btn-logout');
  if (logoutBtn) {
    logoutBtn.innerText = isGuestMode ? "Login" : "Logout";
  }
}

// --- RECYCLE BIN LOGIC ---
function toggleDeletedView() {
  showingDeleted = !showingDeleted;
  const btn = document.getElementById("btn-view-deleted");
  btn.innerText = showingDeleted ? "View Active" : "View Deleted";
  updateUI();
}

async function restoreEntry(rowUuid) {
  const { error } = await _supabase
    .from("attendance")
    .update({ is_deleted: false })
    .eq("id", rowUuid);
  if (error) alert("Error restoring: " + error.message);
}

// --- STUDENT PROFILE LOGIC ---
async function showProfile(studentId) {
  // Check if ID is a student ID
  if (!studentId.startsWith("STG-")) return;

  const { data, error } = await _supabase
    .from("students")
    .select("*")
    .eq("student_id", studentId)
    .single();

  if (error || !data) {
    console.log(
      "No detailed profile found in 'students' table for ID:",
      studentId,
    );
    return; // Don't show modal if student data doesn't exist yet
  }

  // Update Modal Content
  document.getElementById("p-img").src =
    data.image_url || "https://via.placeholder.com/150";
  document.getElementById("p-name").innerText =
    `${data.first_name} ${data.last_name}`;
  document.getElementById("p-id").innerText = data.student_id;
  document.getElementById("p-dob").innerText = data.dob || "Not Set";
  document.getElementById("p-spec").innerText = data.specialty || "N/A";
  document.getElementById("p-level").innerText = data.education_level || "N/A";

  document.getElementById("profileModal").style.display = "flex";
}

function closeProfile() {
  document.getElementById("profileModal").style.display = "none";
}

// --- DATABASE FUNCTIONS ---
async function updateUI() {
  let query = _supabase
    .from("attendance")
    .select("*")
    .eq("is_deleted", showingDeleted);

  // In guest mode, show all records (like admin). Otherwise apply user's class filter
  if (!isGuestMode && currentUserProfile && currentUserProfile.role !== "admin") {
    if (currentUserProfile.assigned_class) {
      query = query.eq("spec", currentUserProfile.assigned_class.toUpperCase());
    }
  }

  const { data: records, error } = await query.order("created_at", {
    ascending: false,
  });
  if (error) return console.error("Error fetching data:", error.message);

  tableBody.innerHTML = records
    .map((s) => {
      const d = new Date(s.created_at);
      const displayDate = d.toLocaleDateString("en-GB");
      const rawDate = s.created_at.split("T")[0];
      const displayTime = d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const actionIcon = showingDeleted
        ? `<button onclick="event.stopPropagation(); restoreEntry('${s.id}')" class="btn-restore" title="Restore">🔄</button>`
        : `<button onclick="event.stopPropagation(); deleteEntry('${s.id}')" class="btn-delete" title="Delete">🗑️</button>`;

      return `
      <tr data-date="${rawDate}" onclick="showProfile('${s.student_id}')" style="cursor: pointer;">
        <td data-label="Date" style="color: #94a3b8">${displayDate}</td>
        <td data-label="Member">
          <div class="mobile-align-right">
            <b style="color: #2563eb">${s.student_id}</b><br>
            <span>${s.name}</span>
          </div>
        </td>
        <td data-label="Info" class="spec-cell">${s.spec}</td>
        <td data-label="Time" style="color: #94a3b8">${displayTime}</td>
        <td data-label="Status">
           <div class="status-wrapper">
              <span class="status-text" style="color: ${s.status === "Late" ? "#dc2626" : "#059669"};">
                  ${s.status}
              </span>
            </div>
        </td>
        <td data-label="Actions" class="actions-cell">${actionIcon}</td>
      </tr>`;
    })
    .join("");

  populateSpecFilter(records);
  filterTable();
}

async function smartAdd(id, name, extra) {
  const cleanID = id.trim().toUpperCase();
  if (!cleanID.startsWith("STG-")) {
    playErrorSound();
    alert(
      "ACCESS DENIED: Invalid ID format.\n\nStudents must start with 'STG-'",
    );
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const { data: existingRecords, error: checkError } = await _supabase
    .from("attendance")
    .select("*")
    .eq("student_id", cleanID)
    .eq("is_deleted", false)
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`);

  if (checkError)
    return alert("Error checking attendance: " + checkError.message);

  if (existingRecords && existingRecords.length > 0) {
    playErrorSound();
    alert(`⚠️ ALREADY SCANNED\n\n${name} has already been recorded today.`);
    return;
  }

  const now = new Date();
  const isLate =
    now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() >= 55);
  const dataObj = {
    name: name.trim(),
    status: isLate ? "Late" : "On Time",
    is_deleted: false,
    student_id: cleanID,
    spec: extra.trim().toUpperCase(),
  };

  const { error } = await _supabase.from("attendance").insert([dataObj]);
  if (error) {
    playErrorSound();
    alert("Error saving: " + error.message);
  } else {
    playSuccessSound();
    updateUI();
  }
}

async function deleteEntry(rowUuid) {
  if (isGuestMode) {
    alert("⚠️ Permission Denied\n\nYou don't have permission to delete records in guest mode.\nPlease login to access this feature.");
    return;
  }
  if (!confirm(`Move this record to the recycle bin?`)) return;
  const { error } = await _supabase
    .from("attendance")
    .update({ is_deleted: true })
    .eq("id", rowUuid);
  if (error) alert("Error deleting: " + error.message);
}

async function clearAll() {
  if (isGuestMode) {
    alert("⚠️ Permission Denied\n\nYou don't have permission to reset the list in guest mode.\nPlease login to access this feature.");
    return;
  }
  if (!confirm("Reset the entire list?")) return;
  const { error } = await _supabase
    .from("attendance")
    .update({ is_deleted: true })
    .eq("is_deleted", false);
  if (error) alert("Error clearing: " + error.message);
}

// --- UI HELPERS ---
function updateStats(visibleRecords) {
  const counts = {};
  visibleRecords.forEach((s) => {
    const key = (s.spec || "Unknown").toUpperCase();
    counts[key] = (counts[key] || 0) + 1;
  });
  let statsHTML = `<div class="stat-card total-card"><span class="label">Total Students</span><span class="value" style="font-size: 2.5rem;">${visibleRecords.length}</span></div>`;
  Object.keys(counts)
    .sort()
    .forEach((key) => {
      statsHTML += `<div class="stat-card"><span class="label">${key}</span><span class="value">${counts[key]}</span></div>`;
    });
  statsContainer.innerHTML = statsHTML;
}

function populateSpecFilter(records) {
  const currentSelection = specSelect.value;
  const keys = [...new Set(records.map((s) => (s.spec || "").toUpperCase()))]
    .filter((k) => k !== "")
    .sort();
  let options = `<option value="">All Specialties</option>`;
  keys.forEach((key) => {
    options += `<option value="${key}" ${key === currentSelection ? "selected" : ""}>${key}</option>`;
  });
  specSelect.innerHTML = options;
}

function filterTable() {
  const searchText = document
    .getElementById("search-input")
    .value.toLowerCase();
  const specFilter = specSelect.value.toUpperCase();
  const dateFilter = document.getElementById("filter-date").value;
  const rows = document.querySelectorAll("#table-body tr");
  let visibleRecords = [];

  rows.forEach((row) => {
    const rowText = row.innerText.toLowerCase();
    const rowInfo = row.cells[2].textContent.trim().toUpperCase();
    const rowDate = row.getAttribute("data-date");
    const matchesSearch = rowText.includes(searchText);
    const matchesSpec = specFilter === "" || rowInfo === specFilter;
    const matchesDate = dateFilter === "" || rowDate === dateFilter;

    if (matchesSearch && matchesSpec && matchesDate) {
      row.style.display = "";
      visibleRecords.push({ spec: rowInfo });
    } else {
      row.style.display = "none";
    }
  });
  updateStats(visibleRecords);
}

function toggleTheme() {
  const body = document.body;
  const themeBtn = document.getElementById("theme-icon");
  body.classList.toggle("dark-mode");
  const isDark = body.classList.contains("dark-mode");
  localStorage.setItem("attendance-theme", isDark ? "dark" : "light");
  themeBtn.innerHTML = isDark ? sunSVG : moonSVG;
}

// --- INITIALIZATION ---
window.onload = async () => {
  const savedTheme = localStorage.getItem("attendance-theme");
  const themeBtn = document.getElementById("theme-icon");
  if (themeBtn) themeBtn.innerHTML = savedTheme === "dark" ? sunSVG : moonSVG;
  if (savedTheme === "dark") document.body.classList.add("dark-mode");

  const dateInput = document.getElementById("filter-date");
  if (dateInput) dateInput.value = new Date().toISOString().split("T")[0];

  const {
    data: { session },
  } = await _supabase.auth.getSession();
  
  if (session) {
    // User has a valid session, check if it's a real login or guest
    const { data: profile } = await _supabase
      .from("profiles")
      .select("role, full_name, assigned_class")
      .eq("id", session.user.id)
      .single();
    if (profile) {
      // Check if this is the guest account
      if (session.user.email === "guest@cfpa.dz") {
        isGuestMode = true;
        showApp(profile);
      } else {
        isGuestMode = false;
        showApp(profile);
      }
    }
  } else {
    // No session - auto-login as guest
    const { data, error } = await _supabase.auth.signInWithPassword({
      email: "guest@cfpa.dz",
      password: "guestpass123"
    });
    
    if (!error && data.user) {
      const { data: profile } = await _supabase
        .from("profiles")
        .select("role, full_name, assigned_class")
        .eq("id", data.user.id)
        .single();
      if (profile) {
        isGuestMode = true;
        showApp(profile);
      }
    } else {
      // Fallback if guest login fails
      console.error("Guest auto-login failed:", error);
      isGuestMode = true;
      const guestProfile = {
        role: "guest",
        full_name: "Guest User",
        assigned_class: null
      };
      showApp(guestProfile);
    }
  }

  _supabase
    .channel(`attendance_changes`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "attendance" },
      () => updateUI(),
    )
    .subscribe();
};

qrInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const parts = qrInput.value.split(";");
    if (parts.length >= 3) {
      smartAdd(parts[0], parts[1], parts[2]);
      qrInput.value = "";
    }
  }
});

function openModal() {
  document.getElementById("manualModal").style.display = "flex";
}
function closeModal() {
  document.getElementById("manualModal").style.display = "none";
  qrInput.focus();
}

function submitManual() {
  const id = document.getElementById("m-id").value;
  const name = document.getElementById("m-name").value;
  const extra = document.getElementById("m-spec").value;
  if (id && name && extra) {
    smartAdd(id, name, extra);
    closeModal();
    document.getElementById("m-id").value = "";
    document.getElementById("m-name").value = "";
    document.getElementById("m-spec").value = "";
  }
}

async function toggleScanner() {
  const btn = document.getElementById("cam-btn");
  const reader = document.getElementById("reader");
  if (html5QrCode && html5QrCode.isScanning) {
    await html5QrCode.stop();
    reader.style.setProperty("display", "none", "important");
    btn.innerText = "📷 Open Camera Scanner";
    return;
  }
  reader.style.setProperty("display", "block", "important");
  btn.innerText = "🛑 Stop Camera";
  if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
  html5QrCode
    .start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      (decodedText) => {
        if (isProcessing) return;
        const parts = decodedText.split(";");
        if (parts.length >= 3) {
          isProcessing = true;
          smartAdd(parts[0], parts[1], parts[2]);
          setTimeout(() => {
            isProcessing = false;
          }, 1000);
        }
      },
    )
    .catch(() => {
      reader.style.setProperty("display", "none", "important");
      btn.innerText = "📷 Open Camera Scanner";
    });
}

function exportToCSV() {
  let csv = "Date,ID,Name,Info,Time,Status\n";
  const rows = document.querySelectorAll("#table-body tr");
  rows.forEach((row) => {
    if (row.style.display !== "none") {
      const cells = row.querySelectorAll("td");
      csv += `${cells[0].innerText},${cells[1].querySelector("b").innerText},${cells[1].querySelector("span").innerText},${cells[2].innerText},${cells[3].innerText},${cells[4].querySelector(".status-text").innerText}\n`;
    }
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.setAttribute("href", url);
  a.setAttribute(
    "download",
    `student_attendance_${new Date().toLocaleDateString()}.csv`,
  );
  a.click();
}
