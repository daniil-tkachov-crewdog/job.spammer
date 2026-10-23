const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const section = (title, body) => (body ? `<section><h2>${title}</h2>${body}</section>` : '');

export function renderCV(cv) {
  const p = cv.personal || {};
  const contact = [p.location, p.phone, p.email].filter(Boolean).map(esc).join('<span class="dot">•</span>');

  const experience = (cv.experience || [])
    .map(
      (j) => `
      <div class="item">
        <div class="row"><strong>${esc(j.title)}</strong><span class="date">${esc(j.start)} – ${esc(j.end)}</span></div>
        <div class="row sub"><span>${esc(j.company)}</span><span>${esc(j.location)}</span></div>
        <ul>${(j.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      </div>`
    )
    .join('');

  const skills = (cv.skills || [])
    .map((g) => `<div class="skill"><strong>${esc(g.category)}:</strong> ${(g.items || []).map(esc).join(', ')}</div>`)
    .join('');

  const education = (cv.education || [])
    .map(
      (e) => `
      <div class="item">
        <div class="row"><strong>${esc(e.degree)}</strong><span class="date">${esc(e.start)} – ${esc(e.end)}</span></div>
        <div class="row sub"><span>${esc(e.school)}</span><span>${esc(e.location)}</span></div>
      </div>`
    )
    .join('');

  const certs = (cv.certifications || []).length
    ? `<ul class="inline">${cv.certifications.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`
    : '';

  const languages = (cv.languages || []).length
    ? `<p>${cv.languages.map((l) => `${esc(l.language)} <span class="muted">(${esc(l.level)})</span>`).join(' · ')}</p>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: 9.6pt; line-height: 1.42; color: #1f2933; background: #fff; }
  .page { max-width: 180mm; margin: 0 auto; }
  header { text-align: center; padding-bottom: 8px; border-bottom: 2px solid #1e3a5f; margin-bottom: 10px; }
  h1 { font-size: 22pt; font-weight: 700; letter-spacing: 0.5px; color: #1e3a5f; }
  .headline { font-size: 11pt; font-weight: 500; color: #3e5c76; margin-top: 2px; }
  .contact { font-size: 9pt; color: #52606d; margin-top: 4px; }
  .dot { margin: 0 7px; color: #9aa5b1; }
  section { margin-top: 9px; }
  h2 { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #1e3a5f;
       border-bottom: 1px solid #cbd2d9; padding-bottom: 2px; margin-bottom: 5px; }
  .item { margin-bottom: 6px; break-inside: avoid; }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  .row strong { font-weight: 600; color: #102a43; }
  .sub { color: #3e5c76; font-style: italic; font-size: 9.2pt; }
  .date { color: #52606d; white-space: nowrap; font-size: 9pt; }
  ul { padding-left: 15px; margin-top: 2px; }
  li { margin-bottom: 1.5px; }
  li::marker { color: #3e5c76; }
  ul.inline { padding-left: 15px; }
  .skill { margin-bottom: 2px; }
  .skill strong { font-weight: 600; color: #102a43; }
  .muted { color: #52606d; }
</style></head>
<body><div class="page">
  <header>
    <h1>${esc(p.name)}</h1>
    <div class="headline">${esc(cv.title)}</div>
    <div class="contact">${contact}</div>
  </header>
  ${section('Profile', cv.summary ? `<p>${esc(cv.summary)}</p>` : '')}
  ${section('Experience', experience)}
  ${section('Skills', skills)}
  ${section('Education', education)}
  ${section('Certifications', certs)}
  ${section('Languages', languages)}
</div></body></html>`;
}
