'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { WhatsAppButton } from '@/components/shared/whatsapp-button'
import {
  FileText,
  DollarSign,
  Download,
  Plus,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Upload,
  Copy,
  Pencil,
} from 'lucide-react'
import { format, parseISO, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { generateBoletoMessage } from '@/lib/whatsapp'
import { nomeImovel } from '@/lib/utils'
import type { Boleto, Contract, Property, Profile, BoletoStatus } from '@/types/database'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatDate = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return dateStr
  }
}

function getMonthOptions(count: number) {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = -3; i < count; i++) {
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

// ---------------------------------------------------------------------------
// Types for joined data
// ---------------------------------------------------------------------------

type BoletoWithRelations = Boleto & {
  contrato: Contract & {
    imovel: Property
    inquilino: Profile
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BoletosPage() {
  const [boletos, setBoletos] = useState<BoletoWithRelations[]>([])
  const [contracts, setContracts] = useState<(Contract & { imovel: Property; inquilino: Profile })[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterMes, setFilterMes] = useState<string>('all')
  const [filterImovel, setFilterImovel] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Generate dialog
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateMonth, setGenerateMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [selectedContracts, setSelectedContracts] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)

  // Edit boleto dialog (upload PDF + linha digitável)
  const [editBoleto, setEditBoleto] = useState<BoletoWithRelations | null>(null)
  const [editLinhaDigitavel, setEditLinhaDigitavel] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editUploading, setEditUploading] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  // Confirm dialogs
  const [confirmPayId, setConfirmPayId] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const fetchBoletos = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('boletos')
      .select('*, contrato:contracts(*, imovel:properties(*), inquilino:profiles(*))')
      .order('data_vencimento', { ascending: false })

    if (error) {
      toast.error('Erro ao carregar boletos.')
      console.error(error)
    } else {
      setBoletos((data as unknown as BoletoWithRelations[]) || [])
    }
    setLoading(false)
  }, [])

  const fetchContracts = useCallback(async () => {
    const { data, error } = await supabase
      .from('contracts')
      .select('*, imovel:properties(*), inquilino:profiles(*)')
      .eq('ativo', true)

    if (!error) {
      setContracts(data as unknown as (Contract & { imovel: Property; inquilino: Profile })[] || [])
    }
  }, [])

  const fetchProperties = useCallback(async () => {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('endereco')

    if (!error) setProperties(data || [])
  }, [])

  useEffect(() => {
    fetchBoletos()
    fetchContracts()
    fetchProperties()
  }, [fetchBoletos, fetchContracts, fetchProperties])

  // ---------------------------------------------------------------------------
  // Filtered data & Summary
  // ---------------------------------------------------------------------------

  const filteredBoletos = useMemo(() => {
    return boletos.filter((b) => {
      if (filterMes !== 'all' && b.referencia_mes !== filterMes) return false
      if (filterImovel !== 'all' && b.contrato?.imovel?.id !== filterImovel) return false
      if (filterStatus !== 'all' && b.status !== filterStatus) return false
      return true
    })
  }, [boletos, filterMes, filterImovel, filterStatus])

  const totalPendente = useMemo(
    () => boletos.filter((b) => b.status === 'pendente').reduce((s, b) => s + b.valor, 0),
    [boletos],
  )
  const totalPago = useMemo(
    () => boletos.filter((b) => b.status === 'pago').reduce((s, b) => s + b.valor, 0),
    [boletos],
  )
  const totalVencidos = useMemo(
    () => boletos.filter((b) => b.status === 'vencido').length,
    [boletos],
  )
  const semPdf = useMemo(
    () => boletos.filter((b) => (b.status === 'pendente' || b.status === 'vencido') && !b.url_pdf).length,
    [boletos],
  )

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleMarkAsPaid = async () => {
    if (!confirmPayId) return
    setActionLoading(true)
    const { error } = await supabase
      .from('boletos')
      .update({ status: 'pago', data_pagamento: new Date().toISOString().split('T')[0] })
      .eq('id', confirmPayId)

    if (error) {
      toast.error('Erro ao marcar boleto como pago.')
    } else {
      toast.success('Boleto marcado como pago.')
      fetchBoletos()
    }
    setConfirmPayId(null)
    setActionLoading(false)
  }

  const handleCancel = async () => {
    if (!confirmCancelId) return
    setActionLoading(true)
    const { error } = await supabase
      .from('boletos')
      .update({ status: 'cancelado' })
      .eq('id', confirmCancelId)

    if (error) {
      toast.error('Erro ao cancelar boleto.')
    } else {
      toast.success('Boleto cancelado.')
      fetchBoletos()
    }
    setConfirmCancelId(null)
    setActionLoading(false)
  }

  // ---------------------------------------------------------------------------
  // Edit boleto (PDF upload + linha digitável)
  // ---------------------------------------------------------------------------

  function openEditBoleto(boleto: BoletoWithRelations) {
    setEditBoleto(boleto)
    setEditLinhaDigitavel(boleto.linha_digitavel || '')
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editBoleto) return

    setEditUploading(true)
    try {
      const fileExt = file.name.split('.').pop() || 'pdf'
      const filePath = `${editBoleto.id}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('boletos')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('boletos')
        .getPublicUrl(filePath)

      const { error: updateError } = await supabase
        .from('boletos')
        .update({ url_pdf: urlData.publicUrl })
        .eq('id', editBoleto.id)

      if (updateError) throw updateError

      setEditBoleto({ ...editBoleto, url_pdf: urlData.publicUrl })
      toast.success('PDF anexado com sucesso')
      fetchBoletos()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido'
      toast.error(`Erro ao enviar PDF: ${msg}`)
    } finally {
      setEditUploading(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  async function handleSaveEditBoleto() {
    if (!editBoleto) return
    setEditSaving(true)

    const { error } = await supabase
      .from('boletos')
      .update({ linha_digitavel: editLinhaDigitavel.trim() || null })
      .eq('id', editBoleto.id)

    if (error) {
      toast.error('Erro ao salvar')
    } else {
      toast.success('Boleto atualizado')
      setEditBoleto(null)
      fetchBoletos()
    }
    setEditSaving(false)
  }

  function copyLinhaDigitavel(texto: string) {
    navigator.clipboard.writeText(texto)
    toast.success('Linha digitável copiada!')
  }

  // ---------------------------------------------------------------------------
  // Generate boletos
  // ---------------------------------------------------------------------------

  const activeContractsForMonth = useMemo(() => {
    return contracts.filter((c) => {
      const start = c.data_inicio.slice(0, 7)
      const end = c.data_fim.slice(0, 7)
      return generateMonth >= start && generateMonth <= end
    })
  }, [contracts, generateMonth])

  const handleToggleContract = (id: string) => {
    setSelectedContracts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  const handleToggleAll = () => {
    if (selectedContracts.length === activeContractsForMonth.length) {
      setSelectedContracts([])
    } else {
      setSelectedContracts(activeContractsForMonth.map((c) => c.id))
    }
  }

  const handleGenerate = async () => {
    if (selectedContracts.length === 0) {
      toast.error('Selecione ao menos um contrato.')
      return
    }

    setGenerating(true)

    const [year, month] = generateMonth.split('-')
    const dataVencimento = `${year}-${month}-10`

    const boletosToInsert = selectedContracts.map((contratoId) => {
      const contract = contracts.find((c) => c.id === contratoId)!
      return {
        contrato_id: contratoId,
        valor: contract.valor_aluguel,
        data_vencimento: dataVencimento,
        status: 'pendente' as const,
        referencia_mes: generateMonth,
      }
    })

    const { error } = await supabase.from('boletos').insert(boletosToInsert)

    if (error) {
      toast.error('Erro ao gerar boletos.')
      console.error(error)
    } else {
      toast.success(`${boletosToInsert.length} boleto(s) gerado(s). Agora anexe os PDFs de cada boleto.`)
      fetchBoletos()
      setGenerateOpen(false)
      setSelectedContracts([])
    }

    setGenerating(false)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Boletos</h1>
        <Button onClick={() => setGenerateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Gerar Boletos
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
            <Check className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalPago)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalVencidos}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sem PDF</CardTitle>
            <Upload className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{semPdf}</p>
            <p className="text-xs text-muted-foreground">pendentes sem boleto anexado</p>
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

        <Select value={filterImovel} onValueChange={(v) => setFilterImovel(v ?? 'all')}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Imóvel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os imóveis</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {nomeImovel(p)}
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
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredBoletos.length === 0 ? (
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
                    <TableHead>Inquilino</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>PDF</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBoletos.map((boleto) => {
                    const imovel = boleto.contrato?.imovel
                    const inquilino = boleto.contrato?.inquilino
                    const st = STATUS_CONFIG[boleto.status]
                    const enderecoCompleto = nomeImovel(imovel)
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

                    return (
                      <TableRow key={boleto.id}>
                        <TableCell className="max-w-[180px] truncate font-medium">
                          {enderecoCompleto}
                        </TableCell>
                        <TableCell>{inquilino?.nome || '—'}</TableCell>
                        <TableCell>{refLabel}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(boleto.valor)}
                        </TableCell>
                        <TableCell>{formatDate(boleto.data_vencimento)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={st.className}>
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {boleto.url_pdf ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700 h-7 px-2"
                              onClick={() => window.open(boleto.url_pdf!, '_blank')}
                            >
                              <FileText className="h-3.5 w-3.5 mr-1" />
                              PDF
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {/* Edit / attach PDF */}
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Editar / Anexar PDF"
                              onClick={() => openEditBoleto(boleto)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>

                            {boleto.linha_digitavel && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Copiar linha digitável"
                                onClick={() => copyLinhaDigitavel(boleto.linha_digitavel!)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}

                            {boleto.status === 'pendente' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-emerald-600 hover:text-emerald-700"
                                title="Marcar como Pago"
                                onClick={() => setConfirmPayId(boleto.id)}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            )}

                            {inquilino?.telefone && boleto.status !== 'cancelado' && (
                              <WhatsAppButton
                                variant="icon"
                                telefone={inquilino.telefone}
                                mensagem={generateBoletoMessage(
                                  inquilino.nome,
                                  enderecoCompleto,
                                  boleto.referencia_mes,
                                  boleto.valor,
                                  boleto.url_pdf || undefined,
                                )}
                              />
                            )}

                            {(boleto.status === 'pendente' || boleto.status === 'vencido') && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-red-500 hover:text-red-600"
                                title="Cancelar"
                                onClick={() => setConfirmCancelId(boleto.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
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

      {/* ------------------------------------------------------------------- */}
      {/* Edit Boleto Dialog (PDF + Linha Digitável)                           */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={!!editBoleto} onOpenChange={(open) => { if (!open) setEditBoleto(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Boleto</DialogTitle>
          </DialogHeader>
          {editBoleto && (
            <div className="space-y-4">
              {/* Info */}
              <div className="rounded-lg border p-3 bg-muted/20 space-y-1 text-sm">
                <p><span className="text-muted-foreground">Imóvel:</span> {nomeImovel(editBoleto.contrato?.imovel)}</p>
                <p><span className="text-muted-foreground">Inquilino:</span> {editBoleto.contrato?.inquilino?.nome}</p>
                <p><span className="text-muted-foreground">Valor:</span> {formatCurrency(editBoleto.valor)}</p>
                <p><span className="text-muted-foreground">Vencimento:</span> {formatDate(editBoleto.data_vencimento)}</p>
              </div>

              {/* PDF Upload */}
              <div>
                <Label>PDF do Boleto</Label>
                <div className="mt-1">
                  {editBoleto.url_pdf ? (
                    <div className="flex items-center gap-2">
                      <a
                        href={editBoleto.url_pdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted transition-colors"
                      >
                        <FileText className="h-4 w-4 text-red-600" />
                        Visualizar PDF
                      </a>
                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={editUploading}
                          onClick={() => pdfInputRef.current?.click()}
                        >
                          {editUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          Substituir
                        </Button>
                        <input
                          ref={pdfInputRef}
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={handlePdfUpload}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        disabled={editUploading}
                        onClick={() => pdfInputRef.current?.click()}
                      >
                        {editUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        Anexar PDF do boleto
                      </Button>
                      <input
                        ref={pdfInputRef}
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={handlePdfUpload}
                      />
                      <p className="text-xs text-muted-foreground">Baixe o boleto no Internet Banking e anexe aqui</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Linha Digitável */}
              <div>
                <Label htmlFor="linha-digitavel">Linha Digitável</Label>
                <Input
                  id="linha-digitavel"
                  value={editLinhaDigitavel}
                  onChange={(e) => setEditLinhaDigitavel(e.target.value)}
                  placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Copie a linha digitável do Internet Banking do Inter
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditBoleto(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveEditBoleto} disabled={editSaving}>
                  {editSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------- */}
      {/* Generate Boletos Dialog                                              */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar Boletos</DialogTitle>
            <DialogDescription>
              Selecione o mês de referência e os contratos para gerar boletos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Mês / Ano</label>
              <Select value={generateMonth} onValueChange={(v) => setGenerateMonth(v ?? format(new Date(), 'yyyy-MM'))}>
                <SelectTrigger className="w-full">
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Contratos Ativos</label>
                <Button variant="ghost" size="sm" onClick={handleToggleAll}>
                  {selectedContracts.length === activeContractsForMonth.length
                    ? 'Desmarcar todos'
                    : 'Selecionar todos'}
                </Button>
              </div>

              {activeContractsForMonth.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum contrato ativo para este mês.
                </p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
                  {activeContractsForMonth.map((contract) => (
                    <label
                      key={contract.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedContracts.includes(contract.id)}
                        onCheckedChange={() => handleToggleContract(contract.id)}
                      />
                      <div className="flex-1 text-sm">
                        <p className="font-medium">
                          {nomeImovel(contract.imovel)}
                        </p>
                        <p className="text-muted-foreground">
                          {contract.inquilino?.nome} &mdash;{' '}
                          {formatCurrency(contract.valor_aluguel)}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={handleGenerate} disabled={generating || selectedContracts.length === 0}>
              {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gerar {selectedContracts.length > 0 && `(${selectedContracts.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Mark as Paid Dialog */}
      <Dialog open={!!confirmPayId} onOpenChange={(open) => !open && setConfirmPayId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
            <DialogDescription>
              Deseja marcar este boleto como pago? A data de pagamento será definida como hoje.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Não</DialogClose>
            <Button onClick={handleMarkAsPaid} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sim, marcar como pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Cancel Dialog */}
      <Dialog open={!!confirmCancelId} onOpenChange={(open) => !open && setConfirmCancelId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancelar Boleto</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar este boleto? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Não</DialogClose>
            <Button variant="destructive" onClick={handleCancel} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sim, cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
