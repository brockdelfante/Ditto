import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://gxkxxzezbatgtrfkwofb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4a3h4emV6YmF0Z3RyZmt3b2ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMDkwMjEsImV4cCI6MjA5MzU4NTAyMX0.Rdt-ivryuXiF8ialnppZhX2XQxT91LwhbMwGgEAgG3U'

export default createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
