import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import process from 'process';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default supabase;