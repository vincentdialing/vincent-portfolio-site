import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
// Use service role key if available, otherwise fallback to anon key
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function convertImage(url) {
  // Extract bucket and path
  // url format: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  
  const bucketAndPath = url.substring(idx + marker.length);
  const slashIdx = bucketAndPath.indexOf('/');
  const bucket = decodeURIComponent(bucketAndPath.substring(0, slashIdx));
  const path = decodeURIComponent(bucketAndPath.substring(slashIdx + 1));
  
  const extMatch = path.match(/\.(png|jpg|jpeg)$/i);
  if (!extMatch) return null;
  
  const newPath = path.substring(0, path.lastIndexOf('.')) + '.webp';
  
  console.log(`Converting: [${bucket}] ${path} -> ${newPath}`);
  
  // 1. Download the image
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Failed to fetch ${url}`);
    return null;
  }
  const buffer = await res.arrayBuffer();
  
  // 2. Convert to webp
  let webpBuffer;
  try {
    webpBuffer = await sharp(Buffer.from(buffer)).webp({ quality: 82 }).toBuffer();
  } catch (err) {
    console.error(`Sharp error on ${path}:`, err);
    return null;
  }
  
  // 3. Upload to supabase
  const { data, error } = await supabase.storage.from(bucket).upload(newPath, webpBuffer, {
    contentType: 'image/webp',
    upsert: true
  });
  
  if (error) {
    console.error(`Failed to upload ${newPath}:`, error.message);
    return null;
  }
  
  // 4. Return new public URL
  const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(newPath);
  return pubData.publicUrl;
}

async function run() {
  const tables = ['portfolio_projects', 'portfolio_project_images', 'portfolio_services'];
  
  for (const table of tables) {
    console.log(`\nProcessing ${table}...`);
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.log(`Error reading ${table}: ${error.message}`);
      continue;
    }
    
    for (const row of data || []) {
      let updatedRow = false;
      const updates = {};
      
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'string' && value.match(/\.(png|jpg|jpeg)$/i)) {
          const newUrl = await convertImage(value);
          if (newUrl) {
            updates[key] = newUrl;
            updatedRow = true;
          }
        }
      }
      
      if (updatedRow) {
        console.log(`Updating DB for ${table} id=${row.id}`);
        const { error: updateError } = await supabase.from(table).update(updates).eq('id', row.id);
        if (updateError) {
           console.error(`DB Update Error: ${updateError.message}`);
        } else {
           console.log(`Success updated id=${row.id}`);
        }
      }
    }
  }
  console.log('\nConversion complete!');
}

run();
