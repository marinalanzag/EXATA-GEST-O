'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  signUp: (data: {
    email: string
    password: string
    nome: string
    telefone: string
    role: Profile['role']
  }) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Erro ao buscar perfil:', error.message)
      return null
    }

    return data as Profile
  }, [])

  useEffect(() => {
    // Use onAuthStateChange as the single source of truth.
    // getSession is only needed as a fallback for the initial load.
    let initialized = false

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      // IMPORTANTE: nunca usar await em queries do Supabase DENTRO deste
      // callback — ele segura o lock de auth e trava TODAS as queries do app
      // (deadlock conhecido do supabase-js). Por isso o setTimeout(0).
      setSession(newSession)
      setUser(newSession?.user ?? null)

      const userId = newSession?.user?.id

      setTimeout(async () => {
        if (userId) {
          const prof = await fetchProfile(userId)
          setProfile(prof)
        } else {
          setProfile(null)
        }

        if (!initialized) {
          initialized = true
          setLoading(false)
        }
      }, 0)
    })

    // Fallback: if onAuthStateChange doesn't fire within 3s, resolve loading
    const timeout = setTimeout(() => {
      if (!initialized) {
        initialized = true
        setLoading(false)
      }
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [fetchProfile])

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return { error: error.message }
      }

      return { error: null }
    },
    []
  )

  const signUp = useCallback(
    async (data: {
      email: string
      password: string
      nome: string
      telefone: string
      role: Profile['role']
    }): Promise<{ error: string | null }> => {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            nome: data.nome,
            telefone: data.telefone,
            role: data.role,
          },
        },
      })

      if (authError) {
        return { error: authError.message }
      }

      if (authData.user) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: authData.user.id,
          email: data.email,
          nome: data.nome,
          telefone: data.telefone,
          role: data.role,
        })

        if (profileError) {
          return { error: profileError.message }
        }
      }

      return { error: null }
    },
    []
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setSession(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signIn,
        signOut,
        signUp,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
