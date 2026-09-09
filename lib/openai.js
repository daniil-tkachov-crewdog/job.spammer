import OpenAI from 'openai';

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

// List chat-capable GPT models, newest first.
export async function listModels() {
  const res = await getClient().models.list();
  const models = res.data
    .map((m) => m.id)
    .filter((id) => /^(gpt-|o1|o3|o4|chatgpt)/i.test(id) && !/(embedding|whisper|tts|audio|image|dall|moderation|realtime|transcribe|search)/i.test(id))
    .sort();
  return models;
}

/**
 * Ask the model how to fill a job-application page.
 * @param {string} model
 * @param {object} pageData  serialized DOM: {url, title, fields[], buttons[]}
 * @param {object} profile   applicant fields
 * @param {string} cvText    extracted CV text (may be empty)
 * @returns {Promise<{fills:Array<{selector:string,value:string}>, uploads:Array<{selector:string}>, clicks:Array<{selector:string}>, notes:string}>}
 */
export async function planApplication(model, pageData, profile, cvText) {
  const sys = `You are an automation agent filling out an online job application form.
You are given the page's form fields (each with a stable CSS selector), buttons, the applicant's profile, and their CV text.
Return ONLY JSON with this shape:
{
  "fills":   [{"selector": "<css>", "value": "<text>"}],
  "uploads": [{"selector": "<css>"}],   // file inputs that should receive the CV
  "clicks":  [{"selector": "<css>"}],   // buttons to click IN ORDER (e.g. submit/apply/next)
  "notes":   "<short explanation or why you could not complete it>"
}
Rules:
- Only use selectors present in the provided data.
- Map profile/CV info to the right fields. Leave a field out of "fills" if you have no suitable value.
- Put the final submit/apply button last in "clicks".
- Do not invent data (no fake references, no lying about eligibility). If a required field has no matching profile value, note it.`;

  const user = JSON.stringify({ page: pageData, profile, cv: cvText?.slice(0, 8000) || '' });

  const res = await getClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const raw = res.choices[0]?.message?.content || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    return { fills: [], uploads: [], clicks: [], notes: 'Model returned unparseable output.' };
  }
}
