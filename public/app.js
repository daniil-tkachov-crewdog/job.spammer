const $ = (s) => document.querySelector(s);
const api = async (url, opts) => {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  return r.json();
};

// ---- models ----
async function loadModels() {
  const sel = $('#model');
  try {
    const { models } = await api('/api/models');
    sel.innerHTML = models.map((m) => `<option value="${m}">${m}</option>`).join('');
  } catch (e) {
    sel.innerHTML = `<option>Failed to load models: ${e.message}</option>`;
  }
}
$('#model').addEventListener('change', (e) =>
  api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected_model: e.target.value }) })
);

// ---- profile ----
async function loadProfile() {
  const { profile } = await api('/api/profile');
  document.querySelectorAll('[data-p]').forEach((el) => { el.value = profile[el.dataset.p] || ''; });
  if (profile.cv_filename) $('#cvName').textContent = profile.cv_filename;
  if (profile.selected_model) $('#model').value = profile.selected_model;
}
$('#saveProfile').addEventListener('click', async () => {
  const body = {};
  document.querySelectorAll('[data-p]').forEach((el) => { body[el.dataset.p] = el.value; });
  await api('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  $('#profileMsg').textContent = 'Saved ✓';
  setTimeout(() => ($('#profileMsg').textContent = ''), 2000);
});

// ---- fold ----
$('#foldBtn').addEventListener('click', () => {
  const body = $('#foldBody');
  body.hidden = !body.hidden;
  $('#foldBtn').textContent = (body.hidden ? '▸' : '▾') + ' Applicant details';
});

// ---- CV ----
$('#attachBtn').addEventListener('click', () => $('#cvInput').click());
$('#cvInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('#cvName').textContent = 'Uploading…';
  const fd = new FormData();
  fd.append('cv', file);
  try {
    const { cv_filename } = await api('/api/cv', { method: 'POST', body: fd });
    $('#cvName').textContent = cv_filename;
  } catch (err) {
    $('#cvName').textContent = 'Upload failed: ' + err.message;
  }
});

// ---- links ----
$('#addBtn').addEventListener('click', async () => {
  const raw = $('#linkInput').value.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!raw.length) return;
  await api('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls: raw }) });
  $('#linkInput').value = '';
  refresh();
});

// ---- run ----
$('#runBtn').addEventListener('click', async () => {
  const res = await api('/api/run', { method: 'POST' });
  $('#runMsg').textContent = res.started ? 'Running…' : (res.reason || 'Already running');
});

// ---- table + polling ----
function badge(s) { return `<span class="badge ${s}">${s}</span>`; }
async function refresh() {
  try {
    const { jobs, run } = await api('/api/status');
    $('#rows').innerHTML = jobs.map((j, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><a href="${j.url}" target="_blank" rel="noopener">${j.url}</a></td>
        <td>${badge(j.status)}</td>
        <td>${j.detail || ''}</td>
        <td><button class="del" data-id="${j.id}">✕</button></td>
      </tr>`).join('') || '<tr><td colspan="5" class="muted">No links yet.</td></tr>';
    document.querySelectorAll('.del').forEach((b) =>
      b.addEventListener('click', async () => { await api('/api/links/' + b.dataset.id, { method: 'DELETE' }); refresh(); })
    );
    $('#runBtn').disabled = run.running;
    if (run.running) $('#runMsg').textContent = 'Running…';
    else if ($('#runMsg').textContent === 'Running…') $('#runMsg').textContent = 'Done.';
  } catch { /* ignore transient */ }
}

// init
loadModels().then(loadProfile);
refresh();
setInterval(refresh, 2500);
