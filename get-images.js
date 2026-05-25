import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function getImages() {
  const { data: projects } = await supabase.from('portfolio_projects').select('image_url');
  console.log("Project images:", projects.map(p => p.image_url));
}

getImages();
