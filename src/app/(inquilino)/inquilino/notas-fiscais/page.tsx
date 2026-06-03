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
import { FileText, Download, Loader2, Receipt } from 'lucide-react'
import { format, parseISO, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { nomeImovel } from '@/lib/utils'
import type { Invoice, Contract, Property } from '@/types/database'

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

const monthOptions = getMonthOptions(12)

type InvoiceWithRelations = Invoice & {
  contrato: Contract & { imovel: Property }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InquilinoNotasFiscais() {
  const { profile } = useAuth()
  const [invoices, setInvoices] = useState<InvoiceWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMes, setFilterMes] = useState<string>('all')

  useEffect(() => {
    if (profile) loadInvoices()
  }, [profile])

  async function loadInvoices() {
    setLoading(true)
    try {
      // Get contracts for this inquilino
      const { data: contracts } = await supabase
        .from('contracts')
        .select('id')
        .eq('inquilino_id', profile!.id)

      const contractIds = (contracts || []).map((c) => c.id)

      if (contractIds.length === 0) {
        setInvoices([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('invoices')
        .select('*, contrato:contracts(*, imovel:properties(*))')
        .in('contrato_id', contractIds)
        .order('data_emissao', { ascending: false })

      if (error) throw error
      setInvoices((data as unknown as InvoiceWithRelations[]) || [])
    } catch (error) {
      console.error('Erro ao carregar notas fiscais:', error)
      toast.error('Erro ao carregar notas fiscais')
    } finally {
      setLoading(false)
    }
  }

  // Filtered
  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (filterMes !== 'all' && inv.referencia_mes !== filterMes) return false
      return true
    })
  }, [invoices, filterMes])

  // Summary
  const totalNotas = invoices.length
  const totalValor = useMemo(
    () => invoices.reduce((s, inv) => s + inv.valor, 0),
    [invoices],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Minhas Notas Fiscais</h1>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total de Notas</CardTitle>
            <Receipt className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalNotas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <FileText className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalValor)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
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
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="mb-2 h-8 w-8" />
              <p>Nenhuma nota fiscal encontrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número NF</TableHead>
                    <TableHead>Imóvel</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => {
                    const imovel = inv.contrato?.imovel
                    const endereco = nomeImovel(imovel)
                    const refLabel = (() => {
                      try {
                        const [y, m] = inv.referencia_mes.split('-')
                        const d = new Date(Number(y), Number(m) - 1, 1)
                        const l = format(d, 'MMM/yyyy', { locale: ptBR })
                        return l.charAt(0).toUpperCase() + l.slice(1)
                      } catch {
                        return inv.referencia_mes
                      }
                    })()

                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">
                          <Badge variant="secondary">NF {inv.numero_nf}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {endereco}
                        </TableCell>
                        <TableCell>{refLabel}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(inv.valor)}
                        </TableCell>
                        <TableCell>{formatDate(inv.data_emissao)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 h-7 px-2"
                              onClick={() => window.open(inv.arquivo_url, '_blank')}
                            >
                              <Download className="h-3.5 w-3.5 mr-1" />
                              PDF
                            </Button>
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
    </div>
  )
}
