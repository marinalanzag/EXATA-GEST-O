'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetHeader,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import {
  Building2,
  FileText,
  DollarSign,
  Receipt,
  Settings,
  LogOut,
  Menu,
  Home,
  BarChart3,
  Users,
  BookOpen,
} from 'lucide-react'
import type { UserRole } from '@/types/database'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

const navItemsByRole: Record<UserRole, NavItem[]> = {
  gestor: [
    { label: 'Dashboard', href: '/dashboard', icon: Home },
    { label: 'Imóveis', href: '/imoveis', icon: Building2 },
    { label: 'Contratos', href: '/contratos', icon: FileText },
    { label: 'Financeiro', href: '/financeiro', icon: DollarSign },
    { label: 'Boletos', href: '/boletos', icon: Receipt },
    { label: 'Notas Fiscais', href: '/notas-fiscais', icon: BarChart3 },
    { label: 'Contabilidade', href: '/contabilidade', icon: BookOpen },
    { label: 'Configurações', href: '/configuracoes', icon: Settings },
  ],
  // Proprietário vê as mesmas páginas do gestor (somente leitura), exceto Configurações
  proprietario: [
    { label: 'Dashboard', href: '/dashboard', icon: Home },
    { label: 'Imóveis', href: '/imoveis', icon: Building2 },
    { label: 'Contratos', href: '/contratos', icon: FileText },
    { label: 'Financeiro', href: '/financeiro', icon: DollarSign },
    { label: 'Boletos', href: '/boletos', icon: Receipt },
    { label: 'Notas Fiscais', href: '/notas-fiscais', icon: BarChart3 },
    { label: 'Contabilidade', href: '/contabilidade', icon: BookOpen },
  ],
  inquilino: [
    { label: 'Dashboard', href: '/inquilino', icon: Home },
    { label: 'Boletos', href: '/inquilino/boletos', icon: Receipt },
    { label: 'Notas Fiscais', href: '/inquilino/notas-fiscais', icon: BarChart3 },
  ],
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { profile, signOut } = useAuth()

  // Fallback para o menor privilégio se o perfil ainda não carregou
  const role = profile?.role ?? 'inquilino'
  const navItems = navItemsByRole[role]

  const isActive = (href: string) => {
    if (href === '/dashboard' || href === '/proprietario' || href === '/inquilino') {
      return pathname === href
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Branding */}
      <div className="flex h-16 items-center gap-3 px-4">
        <Image
          src="/logo.jpg"
          alt="EXATA"
          width={44}
          height={44}
          className="rounded-lg"
        />
        <div>
          <h1 className="text-base font-bold tracking-tight text-foreground">
            EXATA
          </h1>
          <p className="text-[11px] text-muted-foreground leading-none">
            Negócios Imobiliários
          </p>
        </div>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <Separator />

      {/* User info + logout */}
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold dark:bg-indigo-950 dark:text-indigo-300">
            {profile?.nome
              ?.split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {profile?.nome ?? 'Usuário'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {profile?.role === 'gestor'
                ? 'Gestor'
                : profile?.role === 'proprietario'
                  ? 'Proprietário'
                  : 'Inquilino'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  )
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile trigger */}
      <div className="fixed left-0 top-0 z-40 flex h-14 w-full items-center border-b bg-background px-4 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger
            className={cn(
              'inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors'
            )}
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Abrir menu</span>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Menu de navegação</SheetTitle>
            </SheetHeader>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="ml-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white font-bold text-xs">
            EX
          </div>
          <span className="font-semibold text-sm">EXATA</span>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-background lg:block">
        <SidebarContent />
      </aside>
    </>
  )
}
