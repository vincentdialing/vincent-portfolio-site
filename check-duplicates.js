import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkDuplicates() {
  const { data, error } = await supabase
    .from('portfolio_projects')
    .select('id, project_key, service_key, title, details')
    .eq('project_key', 'mg-3');

  if (error) {
    console.error(error);
    return;
  }

  console.log("Matching rows:", data.length);
  data.forEach((row, i) => {
    console.log(`Row ${i}: ID = ${row.id}, project_key = ${row.project_key}, service_key = ${row.service_key}, title = ${row.title}`);
    console.log("Details:", JSON.stringify(row.details, null, 2));
  });
}

checkDuplicates();
