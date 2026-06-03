'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Search,
  FileText,
  Loader2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  CalendarClock,
} from 'lucide-react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { nomeImovel } from '@/lib/utils'
import type { Contract, Property, Profile } from '@/types/database'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatDate = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return dateStr
  }
}

type ContractStatus = 'ativo' | 'vencendo' | 'vencido' | 'inativo'

function getContractStatus(contract: Contract): ContractStatus {
  if (!contract.ativo) return 'inativo'
  const today = new Date()
  const fim = parseISO(contract.data_fim)
  const daysUntilEnd = differenceInDays(fim, today)
  if (daysUntilEnd < 0) return 'vencido'
  if (daysUntilEnd <= 60) return 'vencendo'
  return 'ativo'
}

function getDaysRemaining(contract: Contract): number {
  const today = new Date()
  const fim = parseISO(contract.data_fim)
  return differenceInDays(fim, today)
}

const CONTRACT_STATUS_CONFIG: Record<ContractStatus, { label: string; className: string }> = {
  ativo: { label: 'Ativo', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  vencendo: { label: 'Vencendo', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  vencido: { label: 'Vencido', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  inativo: { label: 'Inativo', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
}

const GARANTIA_LABELS: Record<string, string> = {
  caucao: 'Caução',
  fiador: 'Fiador',
  seguro_fianca: 'Seguro Fiança',
}

function DaysRemainingBadge({ days }: { days: number }) {
  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
        <XCircle className="h-3.5 w-3.5" />
        Vencido há {Math.abs(days)} dias
      </span>
    )
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        {days} dias restantes
      </span>
    )
  }
  if (days <= 60) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <Clock className="h-3.5 w-3.5" />
        {days} dias restantes
      </span>
    )
  }
  if (days <= 90) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" />
        {days} dias restantes
      </span>
    )
  }
  return (
    <span className="text-xs text-muted-foreground">
      {days} dias restantes
    </span>
  )
}

export default function ContratosPage() {
  const router = useRouter()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ativos')
  const [properties, setProperties] = useState<Property[]>([])
  const [tenants, setTenants] = useState<Profile[]>([])
  const [propertyFilter, setPropertyFilter] = useState<string>('todos')
  const [tenantFilter, setTenantFilter] = useState<string>('todos')

  useEffect(() => {
    async function fetchContracts() {
      const { data, error } = await supabase
        .from('contracts')
        .select('*, imovel:properties(*, proprietario:profiles!proprietario_id(*)), inquilino:profiles!inquilino_id(*)')
        .order('data_fim', { ascending: true })

      if (error) {
        console.error('Erro ao buscar contratos:', error)
      } else {
        setContracts((data ?? []) as Contract[])
      }
      setLoading(false)
    }

    async function fetchFilters() {
      const [propsRes, tenantsRes] = await Promise.all([
        supabase.from('properties').select('*').order('endereco'),
        supabase.from('profiles').select('*').eq('role', 'inquilino').order('nome'),
      ])
      setProperties((propsRes.data ?? []) as Property[])
      setTenants((tenantsRes.data ?? []) as Profile[])
    }

    fetchContracts()
    fetchFilters()
  }, [])

  // Summary stats
  const stats = useMemo(() => {
    const active = contracts.filter(c => c.ativo)
    const statuses = active.map(c => ({ contract: c, status: getContractStatus(c), days: getDaysRemaining(c) }))
    return {
      total: contracts.length,
      ativos: active.length,
      vencendo: statuses.filter(s => s.status === 'vencendo').length,
      vencidos: statuses.filter(s => s.status === 'vencido').length,
      inativos: contracts.filter(c => !c.ativo).length,
    }
  }, [contracts])

  // Contracts expiring soon (next 60 days) for alert section
  const expiringContracts = useMemo(() => {
    return contracts
      .filter(c => c.ativo)
      .map(c => ({ ...c, days: getDaysRemaining(c), status: getContractStatus(c) }))
      .filter(c => c.status === 'vencendo' || c.status === 'vencido')
      .sort((a, b) => a.days - b.days)
  }, [contracts])

  const filtered = useMemo(() => {
    return contracts
      .filter((c) => {
        const contractStatus = getContractStatus(c)

        const matchSearch =
          !searchTerm ||
          c.imovel?.endereco?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.inquilino?.nome?.toLowerCase().includes(searchTerm.toLowerCase())

        let matchStatus = true
        if (statusFilter === 'ativos') matchStatus = c.ativo === true
        else if (statusFilter === 'inativos') matchStatus = !c.ativo
        else if (statusFilter === 'vencendo') matchStatus = contractStatus === 'vencendo'
        else if (statusFilter === 'vencido') matchStatus = contractStatus === 'vencido'
        // 'todos' matches all

        const matchProperty = propertyFilter === 'todos' || c.imovel_id === propertyFilter
        const matchTenant = tenantFilter === 'todos' || c.inquilino_id === tenantFilter

        return matchSearch && matchStatus && matchProperty && matchTenant
      })
      .sort((a, b) => {
        // Sort by expiration date ascending (soonest first)
        return new Date(a.data_fim).getTime() - new Date(b.data_fim).getTime()
      })
  }, [contracts, searchTerm, statusFilter, propertyFilter, tenantFilter])

  const currentMonth = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contratos</h1>
          <p className="text-sm text-muted-foreground capitalize">
            Gestão de contratos de locação — {currentMonth}
          </p>
        </div>
        <Button onClick={() => router.push('/contratos/novo')}>
          <Plus className="h-4 w-4" />
          Novo Contrato
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card
          className={`cursor-pointer transition-shadow hover:shadow-md ${statusFilter === 'ativos' ? 'ring-2 ring-indigo-500' : ''}`}
          onClick={() => setStatusFilter('ativos')}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.ativos}</p>
                <p className="text-xs text-muted-foreground">Contratos Ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-shadow hover:shadow-md ${statusFilter === 'vencendo' ? 'ring-2 ring-indigo-500' : ''}`}
          onClick={() => setStatusFilter('vencendo')}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.vencendo}</p>
                <p className="text-xs text-muted-foreground">Vencendo em breve</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-shadow hover:shadow-md ${statusFilter === 'vencido' ? 'ring-2 ring-indigo-500' : ''}`}
          onClick={() => setStatusFilter('vencido')}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.vencidos}</p>
                <p className="text-xs text-muted-foreground">Vencidos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-shadow hover:shadow-md ${statusFilter === 'todos' ? 'ring-2 ring-indigo-500' : ''}`}
          onClick={() => setStatusFilter('todos')}
        >
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total de Contratos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expiration Alerts */}
      {!loading && expiringContracts.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" />
              Atenção — Contratos com vencimento próximo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiringContracts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg bg-white dark:bg-gray-900 p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => router.push(`/contratos/${c.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">
                      {nomeImovel(c.imovel)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.inquilino?.nome ?? '-'} · Vencimento: {formatDate(c.data_fim)}
                    </p>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <DaysRemainingBadge days={c.days} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por imóvel ou inquilino..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'ativos')}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativos">Ativos</SelectItem>
                <SelectItem value="inativos">Inativos</SelectItem>
                <SelectItem value="vencendo">Vencendo</SelectItem>
                <SelectItem value="vencido">Vencidos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={propertyFilter} onValueChange={(v) => setPropertyFilter(v ?? 'todos')}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Imóvel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os imóveis</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {nomeImovel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tenantFilter} onValueChange={(v) => setTenantFilter(v ?? 'todos')}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Inquilino" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os inquilinos</SelectItem>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Contracts table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="mt-4 text-lg font-medium">Nenhum contrato encontrado</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {contracts.length === 0
                ? 'Cadastre o primeiro contrato para começar.'
                : 'Tente ajustar os filtros de busca.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Imóvel</TableHead>
                    <TableHead>Inquilino</TableHead>
                    <TableHead className="text-right">Aluguel</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Garantia</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((contract) => {
                    const contractStatus = getContractStatus(contract)
                    const statusConf = CONTRACT_STATUS_CONFIG[contractStatus]
                    const days = getDaysRemaining(contract)
                    return (
                      <TableRow
                        key={contract.id}
                        className={`cursor-pointer ${
                          contractStatus === 'vencido'
                            ? 'bg-red-50/50 dark:bg-red-950/10'
                            : contractStatus === 'vencendo'
                            ? 'bg-amber-50/50 dark:bg-amber-950/10'
                            : ''
                        }`}
                        onClick={() => router.push(`/contratos/${contract.id}`)}
                      >
                        <TableCell>
                          <span className="font-medium">
                            {nomeImovel(contract.imovel)}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {contract.imovel?.bairro ?? ''}
                          </p>
                        </TableCell>
                        <TableCell>{contract.inquilino?.nome ?? '-'}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(contract.valor_aluguel)}
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(contract.data_inicio)}</TableCell>
                        <TableCell className="text-sm">{formatDate(contract.data_fim)}</TableCell>
                        <TableCell>
                          <DaysRemainingBadge days={days} />
                        </TableCell>
                        <TableCell>
                          {GARANTIA_LABELS[contract.tipo_garantia] ?? contract.tipo_garantia}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusConf.className}>
                            {statusConf.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((contract) => {
              const contractStatus = getContractStatus(contract)
              const statusConf = CONTRACT_STATUS_CONFIG[contractStatus]
              const days = getDaysRemaining(contract)
              return (
                <Card
                  key={contract.id}
                  className={`cursor-pointer transition-shadow hover:shadow-md ${
                    contractStatus === 'vencido'
                      ? 'border-red-200 dark:border-red-900'
                      : contractStatus === 'vencendo'
                      ? 'border-amber-200 dark:border-amber-900'
                      : ''
                  }`}
                  onClick={() => router.push(`/contratos/${contract.id}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm">
                        {nomeImovel(contract.imovel)}
                      </CardTitle>
                      <Badge variant="secondary" className={statusConf.className}>
                        {statusConf.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Inquilino</span>
                        <span>{contract.inquilino?.nome ?? '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Aluguel</span>
                        <span className="font-medium">{formatCurrency(contract.valor_aluguel)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Período</span>
                        <span className="text-xs">
                          {formatDate(contract.data_inicio)} — {formatDate(contract.data_fim)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t">
                        <span className="text-muted-foreground">Prazo</span>
                        <DaysRemainingBadge days={days} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {!loading && contracts.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Exibindo {filtered.length} de {contracts.length} contratos
        </p>
      )}
    </div>
  )
}
