import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface AuthResult {
  ok: boolean
  status: number
  error: string | null
  userId: string | null
}

/**
 * Valida o token Bearer da requisição e exige que o usuário seja gestor.
 * O cliente deve enviar o header: Authorization: Bearer <access_token>
 */
export async function requireGestor(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '')

  if (!token) {
    return { ok: false, status: 401, error: 'Não autenticado', userId: null }
  }

  const supabase = adminClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    return { ok: false, status: 401, error: 'Sessão inválida ou expirada', userId: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'gestor') {
    return { ok: false, status: 403, error: 'Acesso restrito a gestores', userId: null }
  }

  return { ok: true, status: 200, error: null, userId: user.id }
}
