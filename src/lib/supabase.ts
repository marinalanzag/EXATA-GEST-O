import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: async (url, options) => {
      // Retry fetch up to 2 times on network failures (Supabase cold start)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(url, options)
          return response
        } catch (err) {
          if (attempt === 2) throw err
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        }
      }
      return fetch(url, options) // fallback (unreachable but satisfies TS)
    },
  },
})
