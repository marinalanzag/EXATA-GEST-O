'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import JSZip from 'jszip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Upload,
  Download,
  FileText,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileArchive,
  FileCode,
  File,
  ArrowUpDown,
  MessageSquare,
  Lock,
  Unlock,
  ShieldCheck,
} from 'lucide-react'
import { format, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { OFXTransaction, ReconciliationEntry, ReconciliationStatus } from '@/lib/ofx-parser'
import { useAuth } from '@/lib/auth'
import type { Boleto, Expense, ReconciliationStatusDB } from '@/types/database'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

function getMonthOptions(count: number) {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = subMonths(now, i)
    const value = format(d, 'yyyy-MM')
    const label = format(d, 'MMMM yyyy', { locale: ptBR })
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return options
}

const STATUS_CONFIG: Record<ReconciliationStatus, { label: string; icon: typeof CheckCircle2; className: string }> = {
  conciliado: {
    label: 'Conciliado',
    icon: CheckCircle2,
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  nao_identificado: {
    label: 'Não identificado',
    icon: AlertTriangle,
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  justificado: {
    label: 'Justificado',
    icon: MessageSquare,
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ContabilidadePage() {
  const { profile } = useAuth()
  const monthOptions = useMemo(() => getMonthOptions(12), [])
  const currentMonth = format(new Date(), 'yyyy-MM')
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)

  // OFX data
  const [ofxUploaded, setOfxUploaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [entries, setEntries] = useState<ReconciliationEntry[]>([])
  const [ofxSummary, setOfxSummary] = useState<any>(null)

  // Reconciliation persistence
  const [reconciliationId, setReconciliationId] = useState<string | null>(null)
  const [reconciliationStatus, setReconciliationStatus] = useState<ReconciliationStatusDB>('aberta')
  const [loadingReconciliation, setLoadingReconciliation] = useState(true)
  const [fechadaEm, setFechadaEm] = useState<string | null>(null)
  const [closingMonth, setClosingMonth] = useState(false)

  const isFechada = reconciliationStatus === 'fechada'

  // System data for matching
  const [boletos, setBoletos] = useState<Boleto[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])

  // Justification dialog
  const [justifyIndex, setJustifyIndex] = useState<number | null>(null)
  const [justifyText, setJustifyText] = useState('')
  const [justifyHasNota, setJustifyHasNota] = useState(false)
  const [justifyNumeroNota, setJustifyNumeroNota] = useState('')

  // Download state
  const [downloading, setDownloading] = useState(false)

  // File input refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef2 = useRef<HTMLInputElement>(null)

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>('todos')

  // ---------------------------------------------------------------------------
  // Fetch system data for matching
  // ---------------------------------------------------------------------------

  const fetchSystemData = useCallback(async () => {
    const [boletosRes, expensesRes] = await Promise.all([
      supabase
        .from('boletos')
        .select('*, contrato:contracts(*, imovel:properties(endereco, numero), inquilino:profiles(nome))')
        .gte('data_vencimento', `${selectedMonth}-01`)
        .lte('data_vencimento', `${selectedMonth}-31`),
      supabase
        .from('expenses')
        .select('*, imovel:properties(endereco, numero)')
        .gte('data_vencimento', `${selectedMonth}-01`)
        .lte('data_vencimento', `${selectedMonth}-31`),
    ])

    if (!boletosRes.error) setBoletos((boletosRes.data ?? []) as Boleto[])
    if (!expensesRes.error) setExpenses((expensesRes.data ?? []) as Expense[])
  }, [selectedMonth])

  useEffect(() => {
    fetchSystemData()
  }, [fetchSystemData])

  // ---------------------------------------------------------------------------
  // Load saved reconciliation when month changes
  // ---------------------------------------------------------------------------

  const loadReconciliation = useCallback(async () => {
    setLoadingReconciliation(true)
    const { data, error } = await supabase
      .from('reconciliations')
      .select('*')
      .eq('mes', selectedMonth)
      .single()

    if (data && !error) {
      setReconciliationId(data.id)
      setReconciliationStatus(data.status as ReconciliationStatusDB)
      setEntries((data.entries as ReconciliationEntry[]) || [])
      setOfxSummary(data.summary || null)
      setOfxUploaded(true)
      setFechadaEm(data.fechada_em)
    } else {
      // No saved reconciliation for this month
      setReconciliationId(null)
      setReconciliationStatus('aberta')
      setEntries([])
      setOfxSummary(null)
      setOfxUploaded(false)
      setFechadaEm(null)
    }
    setLoadingReconciliation(false)
  }, [selectedMonth])

  useEffect(() => {
    loadReconciliation()
  }, [loadReconciliation])

  // ---------------------------------------------------------------------------
  // Save reconciliation to database
  // ---------------------------------------------------------------------------

  async function saveReconciliation(newEntries: ReconciliationEntry[], summary?: any) {
    const payload = {
      mes: selectedMonth,
      entries: newEntries as unknown,
      summary: summary || ofxSummary,
      updated_at: new Date().toISOString(),
    }

    if (reconciliationId) {
      await supabase
        .from('reconciliations')
        .update(payload)
        .eq('id', reconciliationId)
    } else {
      const { data } = await supabase
        .from('reconciliations')
        .insert({ ...payload, status: 'aberta' })
        .select()
        .single()
      if (data) setReconciliationId(data.id)
    }
  }

  // ---------------------------------------------------------------------------
  // Close / Reopen reconciliation
  // ---------------------------------------------------------------------------

  async function handleFecharConciliacao() {
    if (!reconciliationId) return
    setClosingMonth(true)
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('reconciliations')
      .update({
        status: 'fechada',
        fechada_em: now,
        fechada_por: profile?.nome || profile?.email || null,
        updated_at: now,
      })
      .eq('id', reconciliationId)

    if (error) {
      toast.error('Erro ao fechar conciliação')
    } else {
      setReconciliationStatus('fechada')
      setFechadaEm(now)
      toast.success('Conciliação fechada com sucesso!')
    }
    setClosingMonth(false)
  }

  async function handleReabrirConciliacao() {
    if (!reconciliationId) return
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('reconciliations')
      .update({
        status: 'aberta',
        reaberta_em: now,
        reaberta_por: profile?.nome || profile?.email || null,
        updated_at: now,
      })
      .eq('id', reconciliationId)

    if (error) {
      toast.error('Erro ao reabrir conciliação')
    } else {
      setReconciliationStatus('aberta')
      toast.success('Conciliação reaberta para edição')
    }
  }

  // ---------------------------------------------------------------------------
  // OFX Upload & Matching
  // ---------------------------------------------------------------------------

  async function handleOFXUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/contabilidade/parse-ofx', {
        method: 'POST',
        body: formData,
      })

      const result = await res.json()

      if (!res.ok) {
        toast.error(result.error || 'Erro ao processar arquivo')
        setUploading(false)
        return
      }

      setOfxSummary(result.summary)

      // Match transactions with boletos and expenses
      const transactions: OFXTransaction[] = result.data.transactions
      const reconciled = matchTransactions(transactions)
      setEntries(reconciled)
      setOfxUploaded(true)

      // Save to database
      await saveReconciliation(reconciled, result.summary)
      setOfxSummary(result.summary)

      toast.success(`${transactions.length} lançamentos importados com sucesso`)
    } catch (error) {
      toast.error('Erro ao processar arquivo OFX')
      console.error(error)
    }

    setUploading(false)
    // Reset file input
    e.target.value = ''
  }

  function matchTransactions(transactions: OFXTransaction[]): ReconciliationEntry[] {
    return transactions.map((trn) => {
      const absAmount = Math.abs(trn.amount)

      // Try to match credits with boletos (payments received)
      if (trn.amount > 0) {
        const matchedBoleto = boletos.find((b) => {
          const diff = Math.abs(b.valor - absAmount)
          return diff < 0.05 && b.status === 'pago'
        })

        if (matchedBoleto) {
          return {
            transaction: trn,
            status: 'conciliado' as ReconciliationStatus,
            matchType: 'boleto' as const,
            matchId: matchedBoleto.id,
          }
        }
      }

      // Try to match debits with expenses
      if (trn.amount < 0) {
        const matchedExpense = expenses.find((exp) => {
          const diff = Math.abs(exp.valor - absAmount)
          return diff < 0.05 && exp.pago
        })

        if (matchedExpense) {
          return {
            transaction: trn,
            status: 'conciliado' as ReconciliationStatus,
            matchType: 'despesa' as const,
            matchId: matchedExpense.id,
          }
        }
      }

      return {
        transaction: trn,
        status: 'nao_identificado' as ReconciliationStatus,
        matchType: null,
        matchId: null,
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Justification
  // ---------------------------------------------------------------------------

  function openJustify(index: number) {
    const entry = entries[index]
    setJustifyIndex(index)
    setJustifyText(entry.justificativa || '')
    setJustifyHasNota(entry.possuiNota || false)
    setJustifyNumeroNota(entry.numeroNota || '')
  }

  async function saveJustification() {
    if (justifyIndex === null) return
    if (!justifyText.trim()) {
      toast.error('Preencha a justificativa')
      return
    }

    const newEntries = entries.map((entry, i) =>
      i === justifyIndex
        ? {
            ...entry,
            status: 'justificado' as ReconciliationStatus,
            justificativa: justifyText.trim(),
            possuiNota: justifyHasNota,
            numeroNota: justifyHasNota ? justifyNumeroNota : null,
          }
        : entry
    )

    setEntries(newEntries)
    await saveReconciliation(newEntries)
    setJustifyIndex(null)
    toast.success('Justificativa salva')
  }

  // ---------------------------------------------------------------------------
  // Download Conciliação CSV
  // ---------------------------------------------------------------------------

  function handleDownloadConciliacao() {
    if (entries.length === 0) {
      toast.error('Nenhum lançamento para exportar')
      return
    }

    const statusLabels: Record<ReconciliationStatus, string> = {
      conciliado: 'Conciliado',
      nao_identificado: 'Não identificado',
      justificado: 'Justificado',
    }

    // BOM for Excel UTF-8 compatibility
    const BOM = '﻿'

    const headers = [
      'Data',
      'Descrição',
      'Tipo',
      'Valor',
      'Status',
      'Tipo Match',
      'Justificativa',
      'Possui Nota',
      'Número Nota',
    ]

    const rows = entries.map((entry) => {
      const trn = entry.transaction
      return [
        trn.date,
        `"${trn.description.replace(/"/g, '""')}"`,
        trn.amount > 0 ? 'Crédito' : 'Débito',
        trn.amount.toFixed(2).replace('.', ','),
        statusLabels[entry.status],
        entry.matchType === 'boleto' ? 'Boleto' : entry.matchType === 'despesa' ? 'Despesa' : '',
        entry.justificativa ? `"${entry.justificativa.replace(/"/g, '""')}"` : '',
        entry.possuiNota ? 'Sim' : entry.status === 'justificado' ? 'Não' : '',
        entry.numeroNota || '',
      ]
    })

    // Summary rows
    const emptyRow = Array(headers.length).fill('')
    const summaryRows = [
      emptyRow,
      ['RESUMO', '', '', '', '', '', '', '', ''],
      ['Total de lançamentos', '', '', String(entries.length), '', '', '', '', ''],
      ['Total créditos', '', '', formatCurrency(stats.totalCreditos), '', '', '', '', ''],
      ['Total débitos', '', '', formatCurrency(stats.totalDebitos), '', '', '', '', ''],
      ['Conciliados', '', '', String(stats.conciliados), '', '', '', '', ''],
      ['Não identificados', '', '', String(stats.naoIdentificados), '', '', '', '', ''],
      ['Justificados', '', '', String(stats.justificados), '', '', '', '', ''],
    ]

    const csvContent =
      BOM +
      headers.join(';') +
      '\n' +
      rows.map((r) => r.join(';')).join('\n') +
      '\n' +
      summaryRows.map((r) => r.join(';')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conciliacao_${selectedMonth}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast.success('Conciliação exportada com sucesso')
  }

  // ---------------------------------------------------------------------------
  // Download ZIP
  // ---------------------------------------------------------------------------

  async function handleDownloadNotas(tipo: 'emitidas' | 'tomador' | 'todas') {
    setDownloading(true)

    try {
      const res = await fetch(`/api/contabilidade/download-notas?mes=${selectedMonth}&tipo=${tipo}`)
      const result = await res.json()

      if (!res.ok) {
        toast.error(result.error || 'Erro ao buscar notas')
        setDownloading(false)
        return
      }

      // Download each file and add to ZIP
      const zip = new JSZip()
      let downloadedCount = 0

      for (const file of result.files) {
        try {
          const fileRes = await fetch(file.url)
          if (fileRes.ok) {
            const blob = await fileRes.blob()
            zip.file(file.name, blob)
            downloadedCount++
          }
        } catch {
          console.warn(`Falha ao baixar: ${file.name}`)
        }
      }

      if (downloadedCount === 0) {
        toast.error('Nenhum arquivo foi baixado')
        setDownloading(false)
        return
      }

      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `notas_${selectedMonth}_${tipo}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(`${downloadedCount} arquivo(s) baixados com sucesso`)
    } catch (error) {
      toast.error('Erro ao gerar ZIP')
      console.error(error)
    }

    setDownloading(false)
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const stats = useMemo(() => {
    const conciliados = entries.filter((e) => e.status === 'conciliado').length
    const naoIdentificados = entries.filter((e) => e.status === 'nao_identificado').length
    const justificados = entries.filter((e) => e.status === 'justificado').length
    const totalCreditos = entries
      .filter((e) => e.transaction.amount > 0)
      .reduce((s, e) => s + e.transaction.amount, 0)
    const totalDebitos = entries
      .filter((e) => e.transaction.amount < 0)
      .reduce((s, e) => s + Math.abs(e.transaction.amount), 0)

    return { conciliados, naoIdentificados, justificados, totalCreditos, totalDebitos, total: entries.length }
  }, [entries])

  const filteredEntries = useMemo(() => {
    if (statusFilter === 'todos') return entries
    return entries.filter((e) => e.status === statusFilter)
  }, [entries, statusFilter])

  const mesLabel = monthOptions.find((m) => m.value === selectedMonth)?.label ?? selectedMonth

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contabilidade</h1>
          <p className="text-sm text-muted-foreground capitalize">
            Conciliação bancária e documentação — {mesLabel}
          </p>
        </div>
        <Select value={selectedMonth} onValueChange={(v) => { if (v) setSelectedMonth(v) }}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Banner de conciliação fechada */}
      {isFechada && (
        <div className="flex items-center justify-between p-4 rounded-lg border border-emerald-200 bg-emerald-50">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-800">Conciliação fechada</p>
              <p className="text-xs text-emerald-600">
                Fechada em {fechadaEm ? format(new Date(fechadaEm), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'} — Os registros estão travados para edição.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-100"
            onClick={handleReabrirConciliacao}
          >
            <Unlock className="h-4 w-4" />
            Reabrir para edição
          </Button>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="conciliacao">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="conciliacao" className="flex-1 sm:flex-none">
            <ArrowUpDown className="h-4 w-4 mr-1.5" />
            Conciliação
          </TabsTrigger>
          <TabsTrigger value="notas" className="flex-1 sm:flex-none">
            <FileArchive className="h-4 w-4 mr-1.5" />
            Download Notas
          </TabsTrigger>
        </TabsList>

        {/* ================================================================= */}
        {/* TAB: Conciliação Bancária                                         */}
        {/* ================================================================= */}
        <TabsContent value="conciliacao" className="space-y-6">
          {/* Upload OFX */}
          {!ofxUploaded ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Upload className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-medium mb-1">Importar Extrato Bancário</h3>
                <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                  Faça upload do extrato OFX do mês para conciliar com os lançamentos do sistema.
                  Baixe o arquivo OFX no Internet Banking do Inter.
                </p>
                <div>
                  <Button disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                    {uploading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
                    ) : (
                      <><Upload className="h-4 w-4" /> Selecionar arquivo OFX</>
                    )}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ofx,.qfx"
                    className="hidden"
                    onChange={handleOFXUpload}
                    disabled={uploading}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-emerald-600">{formatCurrency(stats.totalCreditos)}</p>
                        <p className="text-xs text-muted-foreground">Créditos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      </div>
                      <div>
                        <p className="text-lg font-bold text-red-600">{formatCurrency(stats.totalDebitos)}</p>
                        <p className="text-xs text-muted-foreground">Débitos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer ${statusFilter === 'conciliado' ? 'ring-2 ring-indigo-500' : ''}`}
                  onClick={() => setStatusFilter(statusFilter === 'conciliado' ? 'todos' : 'conciliado')}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-lg font-bold">{stats.conciliados}</p>
                        <p className="text-xs text-muted-foreground">Conciliados</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer ${statusFilter === 'nao_identificado' ? 'ring-2 ring-indigo-500' : ''}`}
                  onClick={() => setStatusFilter(statusFilter === 'nao_identificado' ? 'todos' : 'nao_identificado')}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-lg font-bold">{stats.naoIdentificados}</p>
                        <p className="text-xs text-muted-foreground">Não identificados</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card
                  className={`cursor-pointer ${statusFilter === 'justificado' ? 'ring-2 ring-indigo-500' : ''}`}
                  onClick={() => setStatusFilter(statusFilter === 'justificado' ? 'todos' : 'justificado')}
                >
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                        <MessageSquare className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-lg font-bold">{stats.justificados}</p>
                        <p className="text-xs text-muted-foreground">Justificados</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Re-upload + Download buttons */}
              <div className="flex flex-wrap items-center gap-3">
                {!isFechada && (
                <div>
                  <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef2.current?.click()}>
                    <Upload className="h-4 w-4" />
                    Importar novo extrato
                  </Button>
                  <input
                    ref={fileInputRef2}
                    type="file"
                    accept=".ofx,.qfx"
                    className="hidden"
                    onChange={handleOFXUpload}
                    disabled={uploading}
                  />
                </div>
                )}
                <Button variant="default" size="sm" onClick={handleDownloadConciliacao}>
                  <Download className="h-4 w-4" />
                  Baixar Conciliação (CSV)
                </Button>
                {!isFechada && stats.naoIdentificados === 0 && entries.length > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleFecharConciliacao}
                    disabled={closingMonth}
                  >
                    {closingMonth ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                    Fechar Conciliação
                  </Button>
                )}
                {ofxSummary && (
                  <p className="text-xs text-muted-foreground">
                    {ofxSummary.totalTransactions} lançamentos · Período: {ofxSummary.period}
                  </p>
                )}
              </div>

              {/* Transactions Table */}
              <div className="hidden lg:block">
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Correspondência</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map((entry, index) => {
                        const realIndex = entries.indexOf(entry)
                        const st = STATUS_CONFIG[entry.status]
                        const Icon = st.icon
                        const isCredit = entry.transaction.amount > 0

                        return (
                          <TableRow key={entry.transaction.id + index}>
                            <TableCell className="text-sm">
                              {entry.transaction.date.split('-').reverse().join('/')}
                            </TableCell>
                            <TableCell className="max-w-[250px]">
                              <span className="font-medium text-sm truncate block">
                                {entry.transaction.description}
                              </span>
                              {entry.justificativa && (
                                <span className="text-xs text-blue-600 truncate block">
                                  {entry.justificativa}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className={`text-right font-medium ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
                              {isCredit ? '+' : ''}{formatCurrency(entry.transaction.amount)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={isCredit ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}>
                                {isCredit ? 'Crédito' : 'Débito'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={st.className}>
                                <Icon className="h-3 w-3 mr-1" />
                                {st.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {entry.matchType === 'boleto' && 'Boleto recebido'}
                              {entry.matchType === 'despesa' && 'Despesa cadastrada'}
                              {entry.possuiNota && entry.numeroNota && (
                                <span className="block text-xs">NF: {entry.numeroNota}</span>
                              )}
                              {entry.possuiNota === false && entry.status === 'justificado' && (
                                <span className="block text-xs text-muted-foreground">Sem nota</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {entry.status !== 'conciliado' && !isFechada && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openJustify(realIndex)}
                                  title="Justificar"
                                >
                                  <MessageSquare className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </Card>
              </div>

              {/* Mobile cards */}
              <div className="grid gap-3 lg:hidden">
                {filteredEntries.map((entry, index) => {
                  const realIndex = entries.indexOf(entry)
                  const st = STATUS_CONFIG[entry.status]
                  const Icon = st.icon
                  const isCredit = entry.transaction.amount > 0

                  return (
                    <Card key={entry.transaction.id + index}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{entry.transaction.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {entry.transaction.date.split('-').reverse().join('/')}
                            </p>
                          </div>
                          <span className={`font-bold text-sm ${isCredit ? 'text-emerald-600' : 'text-red-600'}`}>
                            {isCredit ? '+' : ''}{formatCurrency(entry.transaction.amount)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className={st.className}>
                            <Icon className="h-3 w-3 mr-1" />
                            {st.label}
                          </Badge>
                          {entry.status !== 'conciliado' && !isFechada && (
                            <Button variant="ghost" size="sm" onClick={() => openJustify(realIndex)}>
                              <MessageSquare className="h-4 w-4 mr-1" />
                              Justificar
                            </Button>
                          )}
                        </div>
                        {entry.justificativa && (
                          <p className="text-xs text-blue-600 mt-2 border-t pt-2">{entry.justificativa}</p>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>

              {entries.length > 0 && (
                <p className="text-xs text-muted-foreground text-right">
                  Exibindo {filteredEntries.length} de {entries.length} lançamentos
                </p>
              )}
            </>
          )}
        </TabsContent>

        {/* ================================================================= */}
        {/* TAB: Download Notas                                               */}
        {/* ================================================================= */}
        <TabsContent value="notas" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Notas Emitidas */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                    <FileText className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Notas Emitidas</CardTitle>
                    <CardDescription>NFs de locação emitidas no mês</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  PDFs e XMLs das notas fiscais de serviço emitidas pela Exata referentes aos aluguéis do mês.
                </p>
                <Button
                  className="w-full"
                  onClick={() => handleDownloadNotas('emitidas')}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Baixar ZIP — Emitidas
                </Button>
              </CardContent>
            </Card>

            {/* Notas de Tomador/Fornecedor */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                    <FileCode className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Notas Tomador</CardTitle>
                    <CardDescription>NFs de fornecedores e prestadores</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  XMLs das notas fiscais recebidas de fornecedores e prestadores de serviço vinculadas às despesas.
                </p>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => handleDownloadNotas('tomador')}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Baixar ZIP — Tomador
                </Button>
              </CardContent>
            </Card>

            {/* Todas as Notas */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <FileArchive className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Pacote Completo</CardTitle>
                    <CardDescription>Todas as notas do mês</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Download completo com todas as notas emitidas e de tomador em um único ZIP para enviar ao contador.
                </p>
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => handleDownloadNotas('todas')}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileArchive className="h-4 w-4" />
                  )}
                  Baixar Pacote Completo
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Info */}
          <Card className="bg-blue-50/50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
            <CardContent className="flex gap-3 pt-4">
              <HelpCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-300">
                <p className="font-medium mb-1">Como funciona</p>
                <p>
                  As notas emitidas são as NFs de serviço cadastradas na aba Notas Fiscais.
                  As notas de tomador são os XMLs anexados nas despesas do Financeiro.
                  Os arquivos são organizados em pastas dentro do ZIP.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Justification Dialog */}
      <Dialog open={justifyIndex !== null} onOpenChange={(open) => !open && setJustifyIndex(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Justificar Lançamento</DialogTitle>
          </DialogHeader>

          {justifyIndex !== null && entries[justifyIndex] && (
            <div className="space-y-4">
              {/* Transaction info */}
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm font-medium">{entries[justifyIndex].transaction.description}</p>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    {entries[justifyIndex].transaction.date.split('-').reverse().join('/')}
                  </span>
                  <span className={`text-sm font-bold ${entries[justifyIndex].transaction.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(entries[justifyIndex].transaction.amount)}
                  </span>
                </div>
              </div>

              {/* Quick justification options */}
              <div className="space-y-2">
                <Label>Tipo</Label>
                <div className="flex flex-wrap gap-2">
                  {['Aluguel', 'Airbnb', 'IPTU', 'Condomínio', 'Manutenção', 'Transferência interna', 'Outro'].map((opt) => (
                    <Button
                      key={opt}
                      variant={justifyText === opt ? 'default' : 'outline'}
                      size="sm"
                      type="button"
                      onClick={() => setJustifyText(opt === 'Outro' ? '' : opt)}
                      className="h-7 text-xs"
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Justification */}
              <div className="space-y-2">
                <Label>Justificativa *</Label>
                <Textarea
                  value={justifyText}
                  onChange={(e) => setJustifyText(e.target.value)}
                  placeholder="Ex: Pagamento de IPTU, Airbnb Flat 07, Transferência interna..."
                  rows={3}
                />
              </div>

              {/* Has invoice? */}
              <div className="space-y-3">
                <Label>Possui nota fiscal?</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="has_nota"
                      checked={justifyHasNota}
                      onChange={() => setJustifyHasNota(true)}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm">Sim</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="has_nota"
                      checked={!justifyHasNota}
                      onChange={() => { setJustifyHasNota(false); setJustifyNumeroNota('') }}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm">Não</span>
                  </label>
                </div>

                {justifyHasNota && (
                  <div className="space-y-2">
                    <Label>Número da NF</Label>
                    <Input
                      value={justifyNumeroNota}
                      onChange={(e) => setJustifyNumeroNota(e.target.value)}
                      placeholder="Ex: 001234"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button onClick={saveJustification}>
              Salvar Justificativa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
