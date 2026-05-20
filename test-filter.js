import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testFilter() {
  const { data: allProjects } = await supabase.from('portfolio_projects').select('*');
  const q = "";
  const serviceKey = "brand-identity"; // Example

  try {
    const filtered = allProjects.filter(p => {
      const matchSearch = p.title.toLowerCase().includes(q) || 
                          p.category.toLowerCase().includes(q) || 
                          p.description.toLowerCase().includes(q);
      const matchService = !serviceKey || p.service_key === serviceKey;
      return matchSearch && matchService;
    });
    console.log("Filtered count:", filtered.length);
  } catch (err) {
    console.error("Filter error:", err);
  }
}

testFilter();
