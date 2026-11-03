// ================= FIREBASE CONFIGURATION =================
const firebaseConfig = {
  apiKey: "AIzaSyAzCP8bLPAJUju-ybhsmFiWGoSu8aEBmFc",
  authDomain: "faculty-notes-auth.firebaseapp.com",
  projectId: "faculty-notes-auth",
  storageBucket: "faculty-notes-auth.firebasestorage.app",
  messagingSenderId: "579711849456",
  appId: "1:579711849456:web:430835daf0a4b399a74335",
  measurementId: "G-8REEQCSJS6"
};

// Initialize Firebase App & Firestore
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// ================= GLOBAL STATE =================
let currentRoll = null;
let currentPdfDoc = null;
let currentPageNum = 1;
let currentZoom = 1.0;

// ================= DOM ELEMENTS =================
const authView = document.getElementById('auth-view');
const portalView = document.getElementById('portal-view');
const loginBtn = document.getElementById('btn-login');
const logoutBtn = document.getElementById('btn-logout');
const rollInput = document.getElementById('roll-input');
const passInput = document.getElementById('pass-input');
const authError = document.getElementById('auth-error');
const errText = document.getElementById('err-text');
const userTag = document.getElementById('current-user-tag');

const canvas = document.getElementById('pdf-render-canvas');
const ctx = canvas.getContext('2d');
const pageNumSpan = document.getElementById('page-num');
const pageCountSpan = document.getElementById('page-count');
const zoomLabel = document.getElementById('zoom-label');

// ================= LOGIN / WHITELIST VERIFICATION =================

loginBtn.addEventListener('click', async (e) => {
  e.preventDefault();

  const roll = rollInput.value.trim();
  const pass = passInput.value.trim();

  if (!roll || !pass) {
    showError("Please enter both Roll Number and Access Key.");
    return;
  }

  loginBtn.innerText = "CHECKING WHITELIST...";
  loginBtn.disabled = true;
  authError.style.display = 'none';

  try {
    const docRef = db.collection('whitelist').doc(roll);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      showError("Roll not found in authorized whitelist. Contact admin.");
      resetLoginBtn();
      return;
    }

    const userData = docSnap.data();

    // Verify status if the field exists
    if (userData.active === false) {
      showError("This Roll is currently inactive.");
      resetLoginBtn();
      return;
    }

    // Verify Password (loose string comparison to handle numeric entries)
    if (String(userData.pass) !== String(pass)) {
      showError("Incorrect Access Key.");
      resetLoginBtn();
      return;
    }

    // Authentication Success
    currentRoll = roll;
    userTag.innerText = `Roll: ${currentRoll}`;
    sessionStorage.setItem('vault_auth_roll', currentRoll);

    authView.style.display = 'none';
    portalView.style.display = 'flex';
    resetLoginBtn();

    // Load sample initial document
    initDefaultDocument();

  } catch (err) {
    console.error("Firestore lookup error:", err);
    showError("Database connection failed. Ensure Firestore rules allow read.");
    resetLoginBtn();
  }
});

function resetLoginBtn() {
  loginBtn.disabled = false;
  loginBtn.innerHTML = `<span>INITIALIZE DECRYPTION</span><span class="btn-arrow">→</span>`;
}

function showError(msg) {
  errText.innerText = msg;
  authError.style.display = 'flex';
}

// Preserve session on refresh
window.addEventListener('DOMContentLoaded', () => {
  const savedRoll = sessionStorage.getItem('vault_auth_roll');
  if (savedRoll) {
    currentRoll = savedRoll;
    userTag.innerText = `Roll: ${currentRoll}`;
    authView.style.display = 'none';
    portalView.style.display = 'flex';
    initDefaultDocument();
  }
});

// Logout
logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('vault_auth_roll');
  currentRoll = null;
  portalView.style.display = 'none';
  authView.style.display = 'flex';
  rollInput.value = '';
  passInput.value = '';
});

// ================= ANTI-DOWNLOAD / ANTI-SAVE GUARDS =================
document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'u'].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
  if (e.key === 'F12') {
    e.preventDefault();
  }
});

// ================= PDF STREAMING & WATERMARK ENGINE =================

function loadPDF(url) {
  pdfjsLib.getDocument(url).promise.then(pdf => {
    currentPdfDoc = pdf;
    pageCountSpan.innerText = pdf.numPages;
    currentPageNum = 1;
    renderCurrentPage();
  }).catch(err => {
    console.error("Failed to load PDF:", err);
  });
}

function renderCurrentPage() {
  if (!currentPdfDoc) return;

  currentPdfDoc.getPage(currentPageNum).then(page => {
    const viewport = page.getViewport({ scale: currentZoom });
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: ctx,
      viewport: viewport
    };

    page.render(renderContext).promise.then(() => {
      applyWatermark(viewport);
    });
  });

  pageNumSpan.innerText = currentPageNum;
  zoomLabel.innerText = `${Math.round(currentZoom * 100)}%`;
}

function applyWatermark(viewport) {
  if (!currentRoll) return;

  ctx.save();
  ctx.font = 'bold 24px "JetBrains Mono", sans-serif';
  ctx.fillStyle = 'rgba(255, 51, 102, 0.16)';
  ctx.rotate(-22 * Math.PI / 180);

  const text = `RESTRICTED COPY • ROLL: ${currentRoll}`;
  for (let y = -viewport.height; y < viewport.height * 2; y += 190) {
    for (let x = -viewport.width; x < viewport.width * 2; x += 360) {
      ctx.fillText(text, x, y);
    }
  }
  ctx.restore();
}

// Controls
document.getElementById('prev-page').addEventListener('click', () => {
  if (currentPageNum > 1) {
    currentPageNum--;
    renderCurrentPage();
  }
});

document.getElementById('next-page').addEventListener('click', () => {
  if (currentPdfDoc && currentPageNum < currentPdfDoc.numPages) {
    currentPageNum++;
    renderCurrentPage();
  }
});

document.getElementById('zoom-in').addEventListener('click', () => {
  if (currentZoom < 2.2) {
    currentZoom += 0.2;
    renderCurrentPage();
  }
});

document.getElementById('zoom-out').addEventListener('click', () => {
  if (currentZoom > 0.6) {
    currentZoom -= 0.2;
    renderCurrentPage();
  }
});

// Sidebar selection
document.querySelectorAll('.doc-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.doc-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');

    document.getElementById('active-doc-title').innerText = card.querySelector('.doc-card-title').innerText;
    const fileUrl = card.getAttribute('data-file');
    loadPDF(fileUrl);
  });
});

function initDefaultDocument() {
  // Test PDF from Mozilla to verify canvas rendering
  loadPDF("https://raw.githubusercontent.com/mozilla/pdf.js/ba2edeae/web/compressed.tracemonkey-pldi-09.pdf");
}
