const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('[supabaseAdmin] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — groups will not work')
}

const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '', {
  auth: { persistSession: false },
})

module.exports = { supabase }
