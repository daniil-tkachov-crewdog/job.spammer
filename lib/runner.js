import { chromium } from 'playwright';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { supabase, CV_BUCKET } from './supabase.js';
import { planApplication } from './openai.js';

// ---- run state (in-memory, single-user tool) ----
const state = { running: false, currentJobId: null, startedAt: null };
export function getRunState() {
  return { ...state };
}

// ---- helpers ----
async function loadProfile() {
  const { data } = await supabase.from('profile').select('*').limit(1).maybeSingle();
  return data || {};
}

async function loadSelectedModel() {
  const { data } = await supabase.from('settings').select('selected_model').limit(1).maybeSingle();
  return data?.selected_model || 'gpt-4o-mini';
}

// Download the CV from Storage to a temp file; return {filePath, text}.
async function fetchCv(profile) {
  if (!profile?.cv_path) return { filePath: null, text: '' };
  const { data, error } = await supabase.storage.from(CV_BUCKET).download(profile.cv_path);
  if (error || !data) return { filePath: null, text: '' };
  const buf = Buffer.from(await data.arrayBuffer());
  const filePath = path.join(os.tmpdir(), profile.cv_filename || 'cv.pdf');
  await fs.writeFile(filePath, buf);
  // Best-effort text extraction for non-binary CVs.
  let text = '';
  if (/\.(txt|md)$/i.test(profile.cv_filename || '')) text = buf.toString('utf8');
  return { filePath, text };
}

async function setJob(id, status, detail) {
  await supabase
    .from('jobs')
    .update({ status, detail: detail?.slice(0, 500) || null, updated_at: new Date().toISOString() })
    .eq('id', id);
}

// Extract a compact, selectable view of the page's form.
async function extractPage(page) {
  return await page.evaluate(() => {
    function cssPath(el) {
      if (el.id) return `#${CSS.escape(el.id)}`;
      if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && parts.length < 5) {
        let sel = node.tagName.toLowerCase();
        const parent = node.parentElement;
        if (parent) {
          const sibs = [...parent.children].filter((c) => c.tagName === node.tagName);
          if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(node) + 1})`;
        }
        parts.unshift(sel);
        node = node.parentElement;
      }
      return parts.join(' > ');
    }
    function labelFor(el) {
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) return l.innerText.trim();
      }
      const wrap = el.closest('label');
      if (wrap) return wrap.innerText.trim();
      return el.placeholder || el.name || '';
    }
    const fields = [...document.querySelectorAll('input, textarea, select')]
      .filter((el) => el.type !== 'hidden' && el.offsetParent !== null)
      .slice(0, 60)
      .map((el) => ({
        selector: cssPath(el),
        tag: el.tagName.toLowerCase(),
        type: el.type || null,
        label: labelFor(el).slice(0, 120),
        required: el.required || false,
        options:
          el.tagName === 'SELECT'
            ? [...el.options].map((o) => o.value || o.text).slice(0, 30)
            : undefined,
      }));
    const buttons = [...document.querySelectorAll('button, input[type=submit], a[role=button]')]
      .filter((el) => el.offsetParent !== null)
      .slice(0, 40)
      .map((el) => ({ selector: cssPath(el), text: (el.innerText || el.value || '').trim().slice(0, 60) }));
    return { url: location.href, title: document.title, fields, buttons };
  });
}

const SUCCESS_RE = /(application (was )?(sent|submitted|received|complete)|thank you for applying|successfully applied|your application has been|we('| ha)ve received your application)/i;

async function processJob(job, ctx) {
  const { model, profile, cv } = ctx;
  const page = await ctx.browser.newPage();
  try {
    await setJob(job.id, 'running', 'Opening page…');
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);

    const pageData = await extractPage(page);
    if (!pageData.fields.length && !pageData.buttons.length) {
      await setJob(job.id, 'failed', 'No form fields found (login/JS wall or unsupported page).');
      return;
    }

    const plan = await planApplication(model, pageData, profile, cv.text);

    for (const f of plan.fills || []) {
      try {
        const el = page.locator(f.selector).first();
        const tag = await el.evaluate((n) => n.tagName.toLowerCase()).catch(() => '');
        if (tag === 'select') await el.selectOption({ label: f.value }).catch(async () => el.selectOption(f.value));
        else await el.fill(String(f.value), { timeout: 5000 });
      } catch { /* skip unfillable field */ }
    }

    if (cv.filePath) {
      for (const u of plan.uploads || []) {
        try {
          await page.locator(u.selector).first().setInputFiles(cv.filePath, { timeout: 5000 });
        } catch { /* skip */ }
      }
    }

    for (const c of plan.clicks || []) {
      try {
        await page.locator(c.selector).first().click({ timeout: 8000 });
        await page.waitForTimeout(2000);
      } catch { /* skip */ }
    }

    await page.waitForTimeout(2000);
    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (SUCCESS_RE.test(bodyText)) {
      await setJob(job.id, 'done', 'Application submitted.');
    } else {
      await setJob(job.id, 'failed', plan.notes || 'Could not confirm submission.');
    }
  } catch (err) {
    await setJob(job.id, 'failed', err.message || String(err));
  } finally {
    await page.close().catch(() => {});
  }
}

// Process all pending jobs sequentially. Non-blocking (fire and forget).
export async function startRun() {
  if (state.running) return { started: false, reason: 'already running' };
  state.running = true;
  state.startedAt = new Date().toISOString();

  (async () => {
    let browser;
    try {
      const [profile, model] = await Promise.all([loadProfile(), loadSelectedModel()]);
      const cv = await fetchCv(profile);
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const ctx = { browser, model, profile, cv };

      // loop until no pending jobs remain
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: jobs } = await supabase
          .from('jobs')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(1);
        const job = jobs?.[0];
        if (!job) break;
        state.currentJobId = job.id;
        await processJob(job, ctx);
      }
    } catch (err) {
      console.error('[runner] fatal:', err);
    } finally {
      if (browser) await browser.close().catch(() => {});
      state.running = false;
      state.currentJobId = null;
    }
  })();

  return { started: true };
}
