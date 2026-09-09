import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase, CV_BUCKET } from './lib/supabase.js';
import { listModels } from './lib/openai.js';
import { startRun, getRunState } from './lib/runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(500).json({ error: e.message || String(e) });
});

// ---- models ----
app.get('/api/models', wrap(async (_req, res) => {
  res.json({ models: await listModels() });
}));

// ---- profile ----
app.get('/api/profile', wrap(async (_req, res) => {
  const { data } = await supabase.from('profile').select('*').limit(1).maybeSingle();
  res.json({ profile: data || {} });
}));

app.put('/api/profile', wrap(async (req, res) => {
  const fields = req.body || {};
  const { data: existing } = await supabase.from('profile').select('id').limit(1).maybeSingle();
  let result;
  if (existing) {
    result = await supabase.from('profile').update(fields).eq('id', existing.id).select().single();
  } else {
    result = await supabase.from('profile').insert(fields).select().single();
  }
  if (result.error) throw result.error;
  res.json({ profile: result.data });
}));

// ---- CV upload ----
app.post('/api/cv', upload.single('cv'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const filename = req.file.originalname;
  const cvPath = `cv/${Date.now()}-${filename}`;
  const up = await supabase.storage.from(CV_BUCKET).upload(cvPath, req.file.buffer, {
    contentType: req.file.mimetype,
    upsert: true,
  });
  if (up.error) throw up.error;

  const { data: existing } = await supabase.from('profile').select('id').limit(1).maybeSingle();
  const patch = { cv_path: cvPath, cv_filename: filename };
  if (existing) await supabase.from('profile').update(patch).eq('id', existing.id);
  else await supabase.from('profile').insert(patch);
  res.json({ cv_filename: filename });
}));

// ---- settings (model) ----
app.put('/api/settings', wrap(async (req, res) => {
  const { selected_model } = req.body || {};
  const { data: existing } = await supabase.from('settings').select('id').limit(1).maybeSingle();
  if (existing) await supabase.from('settings').update({ selected_model }).eq('id', existing.id);
  else await supabase.from('settings').insert({ selected_model });
  res.json({ ok: true });
}));

// ---- links / jobs ----
app.get('/api/links', wrap(async (_req, res) => {
  const { data } = await supabase.from('jobs').select('*').order('created_at', { ascending: true });
  res.json({ jobs: data || [] });
}));

app.post('/api/links', wrap(async (req, res) => {
  const urls = Array.isArray(req.body?.urls) ? req.body.urls : [req.body?.url];
  const rows = urls.filter(Boolean).map((url) => ({ url: String(url).trim(), status: 'pending' }));
  if (!rows.length) return res.status(400).json({ error: 'No URLs' });
  const { data, error } = await supabase.from('jobs').insert(rows).select();
  if (error) throw error;
  res.json({ jobs: data });
}));

app.delete('/api/links/:id', wrap(async (req, res) => {
  await supabase.from('jobs').delete().eq('id', req.params.id);
  res.json({ ok: true });
}));

// ---- run + status ----
app.post('/api/run', wrap(async (_req, res) => {
  res.json(await startRun());
}));

app.get('/api/status', wrap(async (_req, res) => {
  const { data } = await supabase.from('jobs').select('*').order('created_at', { ascending: true });
  res.json({ jobs: data || [], run: getRunState() });
}));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Job Spammer running on :${PORT}`));
