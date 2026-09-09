# Job Spammer

AI-powered job application auto-filler. Paste job-advert URLs, upload a CV, fill
your applicant details, pick a ChatGPT model, and hit **Run** — a headless
browser opens each page, an AI fills the form and submits, and the table marks
each link `done` / `failed`.

## Stack
- Node + Express (single HTML page in `public/`)
- Playwright (headless Chromium)
- OpenAI API (model list + form-filling)
- Supabase (project SYNAP) — `profile`, `jobs`, `settings` + `cv` storage bucket

## Local dev
```bash
npm install                 # also installs Chromium via postinstall
cp .env.example .env        # fill in the three secrets
npm start                   # http://localhost:10000
```

## Env vars
| var | purpose |
|-----|---------|
| `OPENAI_API_KEY` | OpenAI key (models + completions) |
| `SUPABASE_URL` | `https://pxltdkohbewkgfpiepgk.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server only) |

## Deploy (Render)
- Web service, **standard** plan (2 GB RAM — required for Chromium)
- Build: `npm install`
- Start: `npm start`
- Set the three env vars above

## Caveats
Auto-filling arbitrary job boards is unreliable. Sites with logins, captchas, or
bot detection are marked `failed` with a reason in the Detail column.
