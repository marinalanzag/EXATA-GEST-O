'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function Home() {
  const { profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (!profile) {
      router.replace('/login')
      return
    }
    switch (profile.role) {
      case 'gestor':
        router.replace('/dashboard')
        break
      case 'proprietario':
        router.replace('/proprietario')
        break
      case 'inquilino':
        router.replace('/inquilino')
        break
      default:
        router.replace('/login')
    }
  }, [profile, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )
}
