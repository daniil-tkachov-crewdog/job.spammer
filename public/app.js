const form = document.getElementById('form');
const startBtn = document.getElementById('start');
const statusEl = document.getElementById('status');
const result = document.getElementById('result');
const preview = document.getElementById('preview');
const downloadBtn = document.getElementById('download');

const SAVED = ['name', 'phone', 'email', 'location', 'company'];
let currentCV = null;

try {
  const saved = JSON.parse(localStorage.getItem('cvb-fields') || '{}');
  SAVED.forEach((k) => { if (saved[k]) form.elements[k].value = saved[k]; });
} catch {}

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? 'error' : '';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  try {
    localStorage.setItem('cvb-fields', JSON.stringify(Object.fromEntries(SAVED.map((k) => [k, data[k]]))));
  } catch {}

  startBtn.disabled = true;
  setStatus('Generating your CV… (10–30s)');
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Generation failed');
    currentCV = json.cv;
    preview.srcdoc = json.html;
    result.hidden = false;
    setStatus('Done.');
    result.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    startBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', async () => {
  if (!currentCV) return;
  downloadBtn.disabled = true;
  try {
    const res = await fetch('/api/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cv: currentCV }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'PDF failed');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(currentCV.personal?.name || 'CV').replace(/[^\w]+/g, '_')}_CV.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    downloadBtn.disabled = false;
  }
});
