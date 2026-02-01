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
let currentHub = "student";
let showingDeleted = false;
let currentUserProfile = null; // New global variable for profile

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

// --- HUB SWITCHING LOGIC ---
function switchHub(hub) {
  currentHub = hub;
  document
    .getElementById("btn-student-hub")
    .classList.toggle("active", hub === "student");
  document
    .getElementById("btn-staff-hub")
    .classList.toggle("active", hub === "staff");
  qrInput.placeholder =
    hub === "student"
      ? "Manual Scan (STG-ID;Name;Spec)..."
      : "Manual Scan (STF-ID;Name;Role)...";
  const infoHeader = document.getElementById("column-info-header");
  if (infoHeader) {
    infoHeader.innerText = hub === "student" ? "Specialty" : "Role";
  }
  updateUI();
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
    .select("role, full_name, assigned_class") // Included assigned_class
    .eq("id", data.user.id)
    .single();
  if (profile) showApp(profile);
}

function showApp(profile) {
  currentUserProfile = profile; // Save profile globally
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("main-app").classList.remove("hidden");

  const greetingEl = document.getElementById("user-greeting");
  if (greetingEl) {
    const nameToDisplay = profile.full_name || profile.role.toUpperCase();
    greetingEl.innerText = `Welcome, ${nameToDisplay}`;
  }

  const isAdmin = profile.role === "admin";

  // Logic to hide specialty filters for teachers
  const filterGroup = document.querySelector(".filter-group");
  if (filterGroup && !isAdmin) {
    filterGroup.style.display = "none";
  }

  const delBtn = document.getElementById("btn-view-deleted");
  if (delBtn && isAdmin) delBtn.classList.remove("hidden");

  updateUI();
  qrInput.focus();
}

async function handleLogout() {
  await _supabase.auth.signOut();
  window.location.reload();
}

// --- RECYCLE BIN LOGIC ---
function toggleDeletedView() {
  showingDeleted = !showingDeleted;
  const btn = document.getElementById("btn-view-deleted");
  btn.innerText = showingDeleted ? "View Active" : "View Deleted";
  updateUI();
}

async function restoreEntry(rowUuid) {
  const table = currentHub === "student" ? "attendance" : "staff_attendance";
  const { error } = await _supabase
    .from(table)
    .update({ is_deleted: false })
    .eq("id", rowUuid);
  if (error) alert("Error restoring: " + error.message);
}

// --- DATABASE FUNCTIONS ---
async function updateUI() {
  const table = currentHub === "student" ? "attendance" : "staff_attendance";

  // Build the query
  let query = _supabase
    .from(table)
    .select("*")
    .eq("is_deleted", showingDeleted);

  // New filtering logic: If user is teacher and we are on Student Hub, filter by their class
  if (
    currentUserProfile &&
    currentUserProfile.role !== "admin" &&
    currentHub === "student"
  ) {
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
      const idValue = s.student_id || s.employee_id;
      const extraValue = s.spec || s.role;
      const actionIcon = showingDeleted
        ? `<button onclick="restoreEntry('${s.id}')" class="btn-restore" title="Restore">🔄</button>`
        : `<button onclick="deleteEntry('${s.id}')" class="btn-delete" title="Delete">🗑️</button>`;

      return `
      <tr data-date="${rawDate}">
        <td data-label="Date" style="color: #94a3b8">${displayDate}</td>
        <td data-label="Member">
          <div class="mobile-align-right">
            <b style="color: #2563eb">${idValue}</b><br>
            <span>${s.name}</span>
          </div>
        </td>
        <td data-label="Info" class="spec-cell">${extraValue}</td>
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
  const isStudent = cleanID.startsWith("STG-");
  const isStaff = cleanID.startsWith("STF-");

  if (!isStudent && !isStaff) {
    playErrorSound();
    alert(
      "ACCESS DENIED: Invalid ID format.\n\nStudents must start with 'STG-'\nStaff must start with 'STF-'",
    );
    return;
  }

  const table = isStaff ? "staff_attendance" : "attendance";
  const today = new Date().toISOString().split("T")[0];
  const idColumn = isStaff ? "employee_id" : "student_id";

  const { data: existingRecords, error: checkError } = await _supabase
    .from(table)
    .select("*")
    .eq(idColumn, cleanID)
    .eq("is_deleted", false)
    .gte("created_at", `${today}T00:00:00`)
    .lte("created_at", `${today}T23:59:59`);

  if (checkError) {
    playErrorSound();
    return alert("Error checking attendance: " + checkError.message);
  }

  if (existingRecords && existingRecords.length > 0) {
    playErrorSound();
    alert(
      `⚠️ ALREADY SCANNED\n\n${name} (${cleanID}) has already been recorded today at ${new Date(existingRecords[0].created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    );
    return;
  }

  const now = new Date();
  const isLate =
    now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() >= 55);
  const dataObj = {
    name: name.trim(),
    status: isLate ? "Late" : "On Time",
    is_deleted: false,
  };

  if (isStaff) {
    dataObj.employee_id = cleanID;
    dataObj.role = extra.trim().toUpperCase();
    dataObj.status = "Present";
  } else {
    dataObj.student_id = cleanID;
    dataObj.spec = extra.trim().toUpperCase();
  }

  const { error } = await _supabase.from(table).insert([dataObj]);
  if (error) {
    playErrorSound();
    alert("Error saving: " + error.message);
  } else {
    playSuccessSound();
    console.log(`✅ ${name} scanned successfully`);
  }
}

async function deleteEntry(rowUuid) {
  const table = currentHub === "student" ? "attendance" : "staff_attendance";
  if (!confirm(`Move this record to the recycle bin?`)) return;
  const { error } = await _supabase
    .from(table)
    .update({ is_deleted: true })
    .eq("id", rowUuid);
  if (error) alert("Error deleting: " + error.message);
}

async function clearAll() {
  const table = currentHub === "student" ? "attendance" : "staff_attendance";
  if (
    !confirm(
      `Reset the entire ${currentHub} list? This moves all items to the recycle bin.`,
    )
  )
    return;
  const { error } = await _supabase
    .from(table)
    .update({ is_deleted: true })
    .eq("is_deleted", false);
  if (error) alert("Error clearing: " + error.message);
}

// --- UI HELPERS ---
function updateStats(visibleRecords) {
  const counts = {};
  visibleRecords.forEach((s) => {
    const key = (s.spec || s.role || "Unknown").toUpperCase();
    counts[key] = (counts[key] || 0) + 1;
  });
  let statsHTML = `<div class="stat-card total-card"><span class="label">Total ${currentHub === "student" ? "Students" : "Staff"}</span><span class="value" style="font-size: 2.5rem;">${visibleRecords.length}</span></div>`;
  Object.keys(counts)
    .sort()
    .forEach((key) => {
      statsHTML += `<div class="stat-card"><span class="label">${key}</span><span class="value">${counts[key]}</span></div>`;
    });
  statsContainer.innerHTML = statsHTML;
}

function populateSpecFilter(records) {
  const currentSelection = specSelect.value;
  const keys = [
    ...new Set(records.map((s) => (s.spec || s.role || "").toUpperCase())),
  ]
    .filter((k) => k !== "")
    .sort();
  let options = `<option value="">All ${currentHub === "student" ? "Specialties" : "Roles"}</option>`;
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
      if (currentHub === "student") {
        visibleRecords.push({ spec: rowInfo });
      } else {
        visibleRecords.push({ role: rowInfo });
      }
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

  const loginEmail = document.getElementById("login-email");
  const loginPassword = document.getElementById("login-password");
  if (loginEmail) {
    loginEmail.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleLogin();
    });
  }
  if (loginPassword) {
    loginPassword.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleLogin();
    });
  }

  const {
    data: { session },
  } = await _supabase.auth.getSession();
  if (session) {
    const { data: profile } = await _supabase
      .from("profiles")
      .select("role, full_name, assigned_class")
      .eq("id", session.user.id)
      .single();
    if (profile) showApp(profile);
  }

  ["attendance", "staff_attendance"].forEach((table) => {
    _supabase
      .channel(`${table}_changes`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: table },
        () => updateUI(),
      )
      .subscribe();
  });
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
    `${currentHub}_attendance_${new Date().toLocaleDateString()}.csv`,
  );
  a.click();
}
