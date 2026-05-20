import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data } = await supabase.from('portfolio_projects').select('title, category, description, service_key');
  for (const d of data) {
    if (!d.title || !d.category || !d.description || !d.service_key) {
      console.log('Found nulls:', d);
    }
  }
}
run();
