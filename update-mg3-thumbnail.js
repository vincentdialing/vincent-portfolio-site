import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function updateThumbnail() {
  const { data, error: fetchError } = await supabase
    .from('portfolio_projects')
    .select('id, details')
    .eq('project_key', 'mg-3')
    .single();

  if (fetchError) {
    console.error("Fetch error:", fetchError);
    return;
  }

  const details = data.details || [];
  const videoBlock = details.find(b => b.type === 'video');
  if (videoBlock) {
    videoBlock.thumbnail = 'https://yuqzoemntdshtlrqbamr.supabase.co/storage/v1/object/public/portfolio/bento-mg-3-1779692231130.webp';
  } else {
    console.error("No video block found!");
    return;
  }

  const { error: updateError } = await supabase
    .from('portfolio_projects')
    .update({ details })
    .eq('id', data.id);

  if (updateError) {
    console.error("Update error:", updateError);
  } else {
    console.log("Successfully updated mg-3 details with thumbnail URL!");
  }
}

updateThumbnail();
