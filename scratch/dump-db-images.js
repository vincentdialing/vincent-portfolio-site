import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function findProject() {
  const { data: projects, error } = await supabase
    .from('portfolio_projects')
    .select('*');
  
  if (error) {
    console.error(error);
    return;
  }
  
  for (const p of projects) {
    if (p.project_key === 'graphic-design-6' || p.id === 6 || p.title?.toLowerCase().includes('infographic') || p.title?.toLowerCase().includes('verde')) {
      console.log('Project:', p);
      
      const { data: images } = await supabase
        .from('portfolio_project_images')
        .select('*')
        .eq('project_id', p.id);
        
      console.log('Images for project:', images);
    }
  }
}

findProject();
