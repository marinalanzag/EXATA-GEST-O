'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { Loader2 } from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login')
        return
      }
      // Gestor e proprietário acessam o mesmo dashboard
      if (profile && profile.role !== 'gestor' && profile.role !== 'proprietario') {
        if (profile.role === 'inquilino') {
          router.push('/inquilino')
        }
      }
    }
  }, [user, profile, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!user || (profile && profile.role !== 'gestor' && profile.role !== 'proprietario')) {
    return null
  }

  const isProprietario = profile?.role === 'proprietario'

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-background print:bg-white">
      <Sidebar />
      <main className="lg:pl-64 print:pl-0">
        <div className="pt-14 lg:pt-0 print:pt-0">
          {isProprietario && (
            <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-center text-sm text-blue-800">
              Modo visualização — você pode consultar todas as informações, mas as edições são feitas pela gestão.
            </div>
          )}
          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
