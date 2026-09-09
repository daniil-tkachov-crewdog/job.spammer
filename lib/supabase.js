import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.warn('[supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — DB calls will fail.');
}

export const supabase = createClient(url || '', key || '', {
  auth: { persistSession: false },
});

export const CV_BUCKET = 'cv';
