# CV Bullshitter

Paste a job description, fill your name / phone / email / location / latest company,
press **Start** — GPT-4o writes a CV that matches the job, rendered to a one-page PDF.

No logins, no storage. Personal fields are kept in your browser's localStorage only.

## Run
```bash
npm install
npx playwright install chromium
cp .env.example .env   # set OPENAI_API_KEY
npm start              # http://localhost:10000
```

## Deploy (Render)
Docker web service (see `Dockerfile`), env var `OPENAI_API_KEY`.
