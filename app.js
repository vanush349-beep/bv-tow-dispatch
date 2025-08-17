// Tow Dispatch — Realtime GPS (no-build, static)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, update, onValue, serverTimestamp, push, get, child, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

// --- Firebase init ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// --- Elements ---
const el = (id) => document.getElementById(id);
const authCard = el('auth-card');
const dashboard = el('dashboard');
const driverView = el('driver-view');
const navDash = el('nav-dashboard');
const navDriver = el('nav-driver');
const navLogout = el('nav-logout');

// Auth inputs
const email = el('auth-email');
const pass  = el('auth-pass');
const isDispatcher = el('auth-dispatcher');
el('btn-signin').onclick = () => signIn(email.value, pass.value);
el('btn-signup').onclick = () => signUp(email.value, pass.value, isDispatcher.checked);

navDash.onclick = () => show('dashboard');
navDriver.onclick = () => show('driver');
navLogout.onclick = () => signOut(auth);

// Job form
const jobFields = {
  id: el('job-id'),
  customer: el('job-customer'),
  phone: el('job-phone'),
  vehicle: el('job-vehicle'),
  service: el('job-service'),
  pickup: el('job-pickup'),
  dropoff: el('job-dropoff'),
  priority: el('job-priority'),
  driver: el('job-driver'),
};
el('btn-save-job').onclick = saveJob;
el('btn-clear-job').onclick = () => setJobForm();

// Filters
const filterStatus = el('filter-status');
const search = el('search');
filterStatus.onchange = renderJobs;
search.oninput = renderJobs;

// Driver GPS
const btnStartGPS = el('btn-start-gps');
const btnStopGPS = el('btn-stop-gps');
const gpsStatus = el('gps-status');
const coordEl = el('coord');
btnStartGPS.onclick = startGPS;
btnStopGPS.onclick = stopGPS;

const markEnroute = el('btn-mark-enroute');
const markHooked = el('btn-mark-hooked');
const markDelivered = el('btn-mark-delivered');

markEnroute.onclick = () => driverUpdateJobStatus('En Route');
markHooked.onclick = () => driverUpdateJobStatus('Hooked');
markDelivered.onclick = () => driverUpdateJobStatus('Delivered');

// State
let me = null;
let role = 'driver'; // 'driver' | 'dispatcher'
let watchId = null;
let map, markers = {};
const STATUS_FLOW = ['New','Assigned','En Route','Hooked','Delivered','Canceled'];

// Map init
function ensureMap() {
  if (map) return;
  map = L.map('map').setView([40.7128, -74.0060], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
}

// --- Auth ---
async function signUp(email, password, dispatcher) {
  if (!email || !password) return alert('Email and password required');
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await set(ref(db, `users/${cred.user.uid}`), {
    email,
    role: dispatcher ? 'dispatcher' : 'driver',
    createdAt: Date.now()
  });
}
async function signIn(email, password) {
  if (!email || !password) return alert('Email and password required');
  await signInWithEmailAndPassword(auth, email, password);
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    me = null;
    show('auth');
    return;
  }
  me = user;
  const snap = await get(ref(db, `users/${user.uid}`));
  role = snap.exists() ? (snap.val().role || 'driver') : 'driver';
  navLogout.classList.remove('hidden');
  if (role === 'dispatcher') {
    navDash.classList.remove('hidden');
    navDriver.classList.add('hidden');
    show('dashboard');
    loadDrivers();
    liveDrivers();
    liveJobs();
  } else {
    navDriver.classList.remove('hidden');
    navDash.classList.add('hidden');
    show('driver');
    liveAssignedJob();
  }
});

function show(which) {
  if (which === 'auth') {
    authCard.classList.remove('hidden');
    dashboard.classList.add('hidden');
    driverView.classList.add('hidden');
  } else if (which === 'dashboard') {
    authCard.classList.add('hidden');
    dashboard.classList.remove('hidden');
    driverView.classList.add('hidden');
    ensureMap();
  } else if (which === 'driver') {
    authCard.classList.add('hidden');
    dashboard.classList.add('hidden');
    driverView.classList.remove('hidden');
  }
}

// --- Dispatcher: Drivers on Map ---
function liveDrivers() {
  ensureMap();
  onValue(ref(db, 'drivers'), (snap) => {
    const drivers = snap.val() || {};
    // Populate assign dropdown
    const sel = jobFields.driver;
    sel.innerHTML = '<option value="">— Unassigned —</option>';
    let onlineCount = 0;
    const now = Date.now();
    for (const uid in drivers) {
      const d = drivers[uid];
      const name = d.name || d.email || uid.slice(0,6);
      const isOnline = d.location && (now - d.location.timestamp) < 120000; // 2 min
      if (isOnline) onlineCount++;
      const opt = document.createElement('option');
      opt.value = uid;
      opt.textContent = `${name}${isOnline?' • online':''}`;
      sel.appendChild(opt);

      // Marker
      if (d.location && d.location.lat && d.location.lng) {
        const key = uid;
        const label = `${name}${d.status?` • ${d.status}`:''}`;
        if (!markers[key]) {
          markers[key] = L.marker([d.location.lat, d.location.lng]).addTo(map).bindPopup(label);
        } else {
          markers[key].setLatLng([d.location.lat, d.location.lng]).setPopupContent(label);
        }
      } else {
        if (markers[uid]) { map.removeLayer(markers[uid]); delete markers[uid]; }
      }
    }
    document.getElementById('count-online').textContent = onlineCount;
  });
}

// --- Dispatcher: Jobs ---
function liveJobs() {
  onValue(ref(db, 'jobs'), (snap) => {
    window.__jobs = snap.val() || {};
    renderJobs();
  });
}

function renderJobs() {
  const list = document.getElementById('jobs-list');
  list.innerHTML = '';
  let jobs = window.__jobs || {};
  const rows = [];
  const q = (search.value || '').toLowerCase();
  const f = filterStatus.value || '';
  let count = 0;
  Object.keys(jobs).reverse().forEach(id => {
    const j = jobs[id];
    if (f && j.status !== f) return;
    const text = [j.customer,j.pickup,j.dropoff,j.phone,j.service].join(' ').toLowerCase();
    if (q && !text.includes(q)) return;
    count++;
    const row = document.createElement('div');
    row.innerHTML = `
      <div class="mono">${j.ticket || id.slice(-6)}</div>
      <div>${j.status || 'New'}</div>
      <div>${esc(j.customer)}</div>
      <div>${esc(j.pickup || '—')}</div>
      <div>${esc(j.dropoff || '—')}</div>
      <div>${esc(j.driverName || '—')}</div>
      <div class="actions">
        <button data-edit="${id}">Edit</button>
        <button data-next="${id}">Next</button>
        <button class="secondary" data-cancel="${id}">Cancel</button>
        <button class="secondary" data-delete="${id}">Delete</button>
      </div>
    `;
    list.appendChild(row);
  });
  document.getElementById('count-jobs').textContent = count;

  // Wire actions
  list.querySelectorAll('[data-edit]').forEach(b=> b.onclick = () => setJobForm(window.__jobs[b.dataset.edit], b.dataset.edit));
  list.querySelectorAll('[data-delete]').forEach(b=> b.onclick = () => deleteJob(b.dataset.delete));
  list.querySelectorAll('[data-cancel]').forEach(b=> b.onclick = () => moveStatus(b.dataset.cancel, 'Canceled'));
  list.querySelectorAll('[data-next]').forEach(b=> b.onclick = () => nextStatus(b.dataset.next));
}

function setJobForm(job={}, id=null) {
  jobFields.id.value = id || '';
  jobFields.customer.value = job.customer || '';
  jobFields.phone.value = job.phone || '';
  jobFields.vehicle.value = job.vehicle || '';
  jobFields.service.value = job.service || 'Light Duty Tow';
  jobFields.pickup.value = job.pickup || '';
  jobFields.dropoff.value = job.dropoff || '';
  jobFields.priority.value = job.priority || 'Normal';
  jobFields.driver.value = job.driverId || '';
}

async function saveJob() {
  const id = jobFields.id.value || push(ref(db, 'jobs')).key;
  const driverId = jobFields.driver.value || '';
  let driverName = '';
  if (driverId) {
    const dSnap = await get(ref(db, `drivers/${driverId}`));
    const d = dSnap.val() || {};
    driverName = d.name || d.email || driverId.slice(0,6);
  }
  const data = {
    ticket: `T-${id.slice(-6)}`,
    status: 'New',
    customer: jobFields.customer.value,
    phone: jobFields.phone.value,
    vehicle: jobFields.vehicle.value,
    service: jobFields.service.value,
    pickup: jobFields.pickup.value,
    dropoff: jobFields.dropoff.value,
    priority: jobFields.priority.value,
    driverId,
    driverName,
    createdAt: Date.now()
  };
  await update(ref(db, `jobs/${id}`), data);
  if (driverId) { await update(ref(db, `drivers/${driverId}`), { status: 'Assigned' }); }
  setJobForm();
}

async function deleteJob(id) {
  if (!confirm('Delete job?')) return;
  await set(ref(db, `jobs/${id}`), null);
}

async function moveStatus(id, status) {
  const jobRef = ref(db, `jobs/${id}`);
  const snap = await get(jobRef);
  if (!snap.exists()) return;
  await update(jobRef, { status });
}

async function nextStatus(id) {
  const jobRef = ref(db, `jobs/${id}`);
  const snap = await get(jobRef);
  if (!snap.exists()) return;
  const j = snap.val();
  const idx = STATUS_FLOW.indexOf(j.status || 'New');
  const next = STATUS_FLOW[Math.min(idx+1, STATUS_FLOW.length-1)];
  await update(jobRef, { status: next });
}

// --- Driver: account + presence ---
onValue(ref(db, 'presence/keepalive'), ()=>{}); // keep connection
async function liveAssignedJob() {
  onValue(query(ref(db, 'jobs'), orderByChild('driverId'), equalTo(me.uid)), (snap) => {
    const all = snap.val() || {};
    const id = Object.keys(all)[0];
    const j = id ? all[id] : null;
    const box = document.getElementById('driver-job-details');
    if (!j) {
      box.textContent = 'No job assigned yet.';
      markEnroute.disabled = true;
      markHooked.disabled = true;
      markDelivered.disabled = true;
      return;
    }
    box.innerHTML = `<div><b>${esc(j.service)}</b> • ${esc(j.priority || 'Normal')}</div>
      <div>Pickup: ${esc(j.pickup || '—')}</div>
      <div>Dropoff: ${esc(j.dropoff || '—')}</div>
      <div>Customer: ${esc(j.customer || '—')} • ${esc(j.phone || '')}</div>
      <div>Status: <b>${esc(j.status)}</b></div>`;
    markEnroute.disabled = false;
    markHooked.disabled = false;
    markDelivered.disabled = false;
  });
}

// Driver marks status
async function driverUpdateJobStatus(status) {
  const snap = await get(query(ref(db, 'jobs'), orderByChild('driverId'), equalTo(me.uid)));
  const all = snap.val() || {};
  const id = Object.keys(all)[0];
  if (!id) return alert('No assigned job');
  await update(ref(db, `jobs/${id}`), { status });
}

// GPS tracking
async function startGPS() {
  if (!navigator.geolocation) return alert('Geolocation not supported');
  gpsStatus.textContent = 'GPS: On';
  watchId = navigator.geolocation.watchPosition(async (pos)=>{
    const { latitude: lat, longitude: lng } = pos.coords;
    coordEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} @ ${new Date().toLocaleTimeString()}`;
    await update(ref(db, `drivers/${me.uid}`), {
      email: me.email || null,
      status: 'Online',
      location: { lat, lng, timestamp: Date.now() }
    });
  }, (err)=>{
    console.error(err);
    alert('Location error: ' + err.message);
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
}

async function stopGPS() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  gpsStatus.textContent = 'GPS: Off';
  await update(ref(db, `drivers/${me.uid}`), { status: 'Offline' });
}

// --- Utilities ---
function esc(s=''){ return String(s).replace(/[&<>]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }
