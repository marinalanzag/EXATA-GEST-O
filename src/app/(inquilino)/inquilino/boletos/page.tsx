'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FileText,
  DollarSign,
  Download,
  Check,
  AlertTriangle,
  Loader2,
  Copy,
  Barcode,
} from 'lucide-react'
import { format, parseISO, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { nomeImovel } from '@/lib/utils'
import type { Boleto, Contract, Property, BoletoStatus } from '@/types/database'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const formatDate = (d: string) => {
  try {
    return format(parseISO(d), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return d
  }
}

function getMonthOptions(count: number) {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = -1; i < count; i++) {
    const d = subMonths(now, i)
    const value = format(d, 'yyyy-MM')
    const label = format(d, 'MMMM yyyy', { locale: ptBR })
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return options
}

const STATUS_CONFIG: Record<BoletoStatus, { label: string; className: string }> = {
  pendente: {
    label: 'Pendente',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  pago: {
    label: 'Pago',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  vencido: {
    label: 'Vencido',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
  cancelado: {
    label: 'Cancelado',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  },
}

const monthOptions = getMonthOptions(12)

type BoletoWithRelations = Boleto & {
  contrato: Contract & { imovel: Property }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InquilinoBoletos() {
  const { profile } = useAuth()
  const [boletos, setBoletos] = useState<BoletoWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMes, setFilterMes] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  useEffect(() => {
    if (profile) loadBoletos()
  }, [profile])

  async function loadBoletos() {
    setLoading(true)
    try {
      // Get contracts for this inquilino
      const { data: contracts } = await supabase
        .from('contracts')
        .select('id')
        .eq('inquilino_id', profile!.id)

      const contractIds = (contracts || []).map((c) => c.id)

      if (contractIds.length === 0) {
        setBoletos([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('boletos')
        .select('*, contrato:contracts(*, imovel:properties(*))')
        .in('contrato_id', contractIds)
        .neq('status', 'cancelado')
        .order('data_vencimento', { ascending: false })

      if (error) throw error
      setBoletos((data as unknown as BoletoWithRelations[]) || [])
    } catch (error) {
      console.error('Erro ao carregar boletos:', error)
      toast.error('Erro ao carregar boletos')
    } finally {
      setLoading(false)
    }
  }

  // Filtered
  const filtered = useMemo(() => {
    return boletos.filter((b) => {
      if (filterMes !== 'all' && b.referencia_mes !== filterMes) return false
      if (filterStatus !== 'all' && b.status !== filterStatus) return false
      return true
    })
  }, [boletos, filterMes, filterStatus])

  // Summary
  const totalPendente = useMemo(
    () => boletos.filter((b) => b.status === 'pendente').reduce((s, b) => s + b.valor, 0),
    [boletos],
  )
  const totalVencidos = useMemo(
    () => boletos.filter((b) => b.status === 'vencido').length,
    [boletos],
  )
  const proximoVencimento = useMemo(() => {
    const pendentes = boletos
      .filter((b) => b.status === 'pendente')
      .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
    return pendentes[0] || null
  }, [boletos])

  function copyLinhaDigitavel(texto: string) {
    navigator.clipboard.writeText(texto)
    toast.success('Linha digitável copiada!')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Meus Boletos</h1>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Pendente</CardTitle>
            <DollarSign className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalPendente)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{totalVencidos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Próximo Vencimento</CardTitle>
            <Check className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {proximoVencimento ? (
              <>
                <p className="text-2xl font-bold">{formatDate(proximoVencimento.data_vencimento)}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(proximoVencimento.valor)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum pendente</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterMes} onValueChange={(v) => setFilterMes(v ?? 'all')}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Mês referência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os meses</SelectItem>
            {monthOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v ?? 'all')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="pago">Pago</SelectItem>
            <SelectItem value="vencido">Vencido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="mb-2 h-8 w-8" />
              <p>Nenhum boleto encontrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Imóvel</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((boleto) => {
                    const imovel = boleto.contrato?.imovel
                    const st = STATUS_CONFIG[boleto.status]
                    const endereco = nomeImovel(imovel)
                    const refLabel = (() => {
                      try {
                        const [y, m] = boleto.referencia_mes.split('-')
                        const d = new Date(Number(y), Number(m) - 1, 1)
                        const l = format(d, 'MMM/yyyy', { locale: ptBR })
                        return l.charAt(0).toUpperCase() + l.slice(1)
                      } catch {
                        return boleto.referencia_mes
                      }
                    })()
                    const isOverdue =
                      boleto.status === 'pendente' &&
                      new Date(boleto.data_vencimento) < new Date()

                    return (
                      <TableRow
                        key={boleto.id}
                        className={isOverdue ? 'bg-red-50/50 dark:bg-red-950/10' : undefined}
                      >
                        <TableCell className="max-w-[200px] truncate font-medium">
                          {endereco}
                        </TableCell>
                        <TableCell>{refLabel}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(boleto.valor)}
                        </TableCell>
                        <TableCell>{formatDate(boleto.data_vencimento)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={st.className}>
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {/* PDF download */}
                            {boleto.url_pdf && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700 h-7 px-2"
                                onClick={() => window.open(boleto.url_pdf!, '_blank')}
                              >
                                <Download className="h-3.5 w-3.5 mr-1" />
                                PDF
                              </Button>
                            )}

                            {/* Copy linha digitavel */}
                            {boleto.linha_digitavel && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 font-mono text-xs"
                                title="Copiar linha digitável"
                                onClick={() => copyLinhaDigitavel(boleto.linha_digitavel!)}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copiar código
                              </Button>
                            )}

                            {/* No PDF/code available */}
                            {!boleto.url_pdf && !boleto.linha_digitavel && boleto.status !== 'pago' && (
                              <span className="text-xs text-muted-foreground italic">
                                Aguardando boleto
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linha digitavel detail for mobile — show expanded below each card */}
      <div className="space-y-3 sm:hidden">
        {filtered.filter((b) => b.linha_digitavel && b.status !== 'pago').map((boleto) => (
          <Card key={`ld-${boleto.id}`} className="border-dashed">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Barcode className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-medium">
                  Linha digitável — {boleto.referencia_mes}
                </span>
              </div>
              <p className="font-mono text-xs break-all">{boleto.linha_digitavel}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full h-7 text-xs"
                onClick={() => copyLinhaDigitavel(boleto.linha_digitavel!)}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copiar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
