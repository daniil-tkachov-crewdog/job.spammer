import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import { chromium } from 'playwright';
import { renderCV } from './template.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are an expert CV writer and ATS optimisation specialist.
Given a job description and a candidate's personal details, write a CV that is a perfect match for the job.

Rules:
- The most recent job MUST be at the company the user gives ("latestCompany"), current (end = "Present"), started 2-4 years ago.
  Its job title must closely mirror the advertised role. Write 5-6 strong bullets that mirror the job's responsibilities and
  requirements, using strong action verbs and concrete, plausible metrics.
- Add 2 earlier roles at realistic, plausible companies (not famous brands) that show a logical career progression toward
  the advertised role, 3-4 bullets each.
- Total years of experience should satisfy the job's requirements.
- Skills: cover every hard skill, tool, technology and methodology in the job description, plus a few relevant extras.
  Group them into 3-5 categories.
- Summary: 3 sentences, tailored to the role, naming the title and years of experience.
- Education: 1 relevant degree from a real, plausible university matching the location's country. Certifications: 0-3 relevant ones.
- Languages: include English plus any language the job asks for.
- Use the job description's keywords verbatim where natural (ATS). Write in the job description's language.
- Must fit on ONE A4 page: be concise; bullets max ~25 words.

Return ONLY JSON with this exact shape:
{
  "title": "string (professional headline = target role)",
  "summary": "string",
  "skills": [{ "category": "string", "items": ["string"] }],
  "experience": [{ "title": "string", "company": "string", "location": "string", "start": "MMM YYYY", "end": "MMM YYYY | Present", "bullets": ["string"] }],
  "education": [{ "degree": "string", "school": "string", "location": "string", "start": "YYYY", "end": "YYYY" }],
  "certifications": ["string"],
  "languages": [{ "language": "string", "level": "string" }]
}`;

app.post('/api/generate', async (req, res) => {
  const { jobDescription, name, phone, email, location, company } = req.body || {};
  if (!jobDescription?.trim()) return res.status(400).json({ error: 'Job description is required' });
  if (!company?.trim()) return res.status(400).json({ error: 'Company name is required' });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            today: new Date().toISOString().slice(0, 10),
            candidateLocation: location,
            latestCompany: company,
            jobDescription,
          }),
        },
      ],
    });
    const cv = JSON.parse(completion.choices[0].message.content);
    cv.personal = { name, phone, email, location };
    res.json({ cv, html: renderCV(cv) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Generation failed' });
  }
});

let browserPromise;
function getBrowser() {
  browserPromise ??= chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_PATH || undefined });
  return browserPromise;
}

app.post('/api/pdf', async (req, res) => {
  const { cv } = req.body || {};
  if (!cv) return res.status(400).json({ error: 'cv is required' });

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(renderCV(cv), { waitUntil: 'networkidle' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const filename = `${(cv.personal?.name || 'CV').replace(/[^\w]+/g, '_')}_CV.pdf`;
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(pdf);
  } catch (err) {
    console.error(err);
    browserPromise = undefined;
    res.status(500).json({ error: err.message || 'PDF failed' });
  } finally {
    await page?.close().catch(() => {});
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`CV Bullshitter on http://localhost:${port}`));
