import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkDetails() {
  const { data, error } = await supabase
    .from('portfolio_projects')
    .select('project_key, details')
    .eq('project_key', 'mg-3')
    .single();

  if (error) {
    console.error("Error fetching project:", error);
  } else {
    console.log("Details for mg-3:", JSON.stringify(data.details, null, 2));
  }
}

checkDetails();
