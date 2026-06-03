'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog'
import { WhatsAppButton } from '@/components/shared/whatsapp-button'
import {
  FileText,
  Download,
  Plus,
  Trash2,
  Upload,
  Loader2,
  FileCode,
  File,
} from 'lucide-react'
import { format, parseISO, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { generateInvoiceMessage } from '@/lib/whatsapp'
import type { Invoice, Contract, Property, Profile } from '@/types/database'

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

const monthOptions = getMonthOptions(12)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvoiceWithRelations = Invoice & {
  contrato?: (Contract & {
    imovel: Property
    inquilino: Profile
  }) | null
  imovel?: Property | null
}

interface InvoiceForm {
  tipo: 'aluguel' | 'airbnb'
  contrato_id: string
  imovel_id: string
  numero_nf: string
  valor: string
  referencia_mes: string
  data_emissao: string
  arquivo_pdf: File | null
  arquivo_xml: File | null
}

const emptyForm: InvoiceForm = {
  tipo: 'aluguel',
  contrato_id: '',
  imovel_id: '',
  numero_nf: '',
  valor: '',
  referencia_mes: format(new Date(), 'yyyy-MM'),
  data_emissao: format(new Date(), 'yyyy-MM-dd'),
  arquivo_pdf: null,
  arquivo_xml: null,
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NotasFiscaisPage() {
  const [invoices, setInvoices] = useState<InvoiceWithRelations[]>([])
  const [contracts, setContracts] = useState<(Contract & { imovel: Property; inquilino: Profile })[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterMes, setFilterMes] = useState<string>('all')
  const [filterImovel, setFilterImovel] = useState<string>('all')

  // New NF dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState<InvoiceForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('invoices')
      .select('*, contrato:contracts(*, imovel:properties(*), inquilino:profiles(*)), imovel:properties(*)')
      .order('data_emissao', { ascending: false })

    if (error) {
      toast.error('Erro ao carregar notas fiscais.')
      console.error(error)
    } else {
      setInvoices((data as unknown as InvoiceWithRelations[]) || [])
    }
    setLoading(false)
  }, [])

  const fetchContracts = useCallback(async () => {
    const { data, error } = await supabase
      .from('contracts')
      .select('*, imovel:properties(*), inquilino:profiles(*)')
      .eq('ativo', true)

    if (error) {
      console.error(error)
    } else {
      setContracts(data as unknown as (Contract & { imovel: Property; inquilino: Profile })[] || [])
    }
  }, [])

  const fetchProperties = useCallback(async () => {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('endereco')

    if (error) {
      console.error(error)
    } else {
      setProperties(data || [])
    }
  }, [])

  useEffect(() => {
    fetchInvoices()
    fetchContracts()
    fetchProperties()
  }, [fetchInvoices, fetchContracts, fetchProperties])

  // ---------------------------------------------------------------------------
  // Filtered data
  // ---------------------------------------------------------------------------

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (filterMes !== 'all' && inv.referencia_mes !== filterMes) return false
      if (filterImovel !== 'all') {
        const imovelId = inv.contrato?.imovel?.id || inv.imovel?.id
        if (imovelId !== filterImovel) return false
      }
      return true
    })
  }, [invoices, filterMes, filterImovel])

  // Stats
  const stats = useMemo(() => {
    return {
      total: filteredInvoices.length,
      valorTotal: filteredInvoices.reduce((sum, inv) => sum + inv.valor, 0),
    }
  }, [filteredInvoices])

  // ---------------------------------------------------------------------------
  // Upload helpers
  // ---------------------------------------------------------------------------

  async function uploadFile(file: File, folder: string): Promise<string | null> {
    const fileExt = file.name.split('.').pop() || ''
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`
    const filePath = `${folder}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('notas-fiscais')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('Erro ao fazer upload:', uploadError)
      return null
    }

    const { data: publicUrlData } = supabase.storage
      .from('notas-fiscais')
      .getPublicUrl(filePath)

    return publicUrlData.publicUrl
  }

  // ---------------------------------------------------------------------------
  // Form handlers
  // ---------------------------------------------------------------------------

  const handleOpenNew = () => {
    setFormData(emptyForm)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    // Validate based on tipo
    if (formData.tipo === 'aluguel' && !formData.contrato_id) {
      toast.error('Selecione um contrato.')
      return
    }
    if (formData.tipo === 'airbnb' && !formData.imovel_id) {
      toast.error('Selecione o imóvel.')
      return
    }
    if (!formData.numero_nf || !formData.valor || !formData.referencia_mes || !formData.data_emissao) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }

    if (!formData.arquivo_pdf && !formData.arquivo_xml) {
      toast.error('Anexe pelo menos o PDF ou XML da nota fiscal.')
      return
    }

    setSaving(true)

    let pdfUrl = ''
    let xmlUrl = ''

    // Upload PDF
    if (formData.arquivo_pdf) {
      const url = await uploadFile(formData.arquivo_pdf, 'pdf')
      if (!url) {
        toast.error('Erro ao fazer upload do PDF.')
        setSaving(false)
        return
      }
      pdfUrl = url
    }

    // Upload XML
    if (formData.arquivo_xml) {
      const url = await uploadFile(formData.arquivo_xml, 'xml')
      if (!url) {
        toast.error('Erro ao fazer upload do XML.')
        setSaving(false)
        return
      }
      xmlUrl = url
    }

    const insertData: Record<string, unknown> = {
      tipo: formData.tipo,
      numero_nf: formData.numero_nf,
      valor: parseFloat(formData.valor),
      referencia_mes: formData.referencia_mes,
      data_emissao: formData.data_emissao,
      arquivo_url: pdfUrl || xmlUrl,
      xml_url: xmlUrl,
    }

    if (formData.tipo === 'aluguel') {
      insertData.contrato_id = formData.contrato_id
    } else {
      insertData.imovel_id = formData.imovel_id
    }

    const { error } = await supabase.from('invoices').insert(insertData)

    if (error) {
      toast.error('Erro ao salvar nota fiscal.')
      console.error(error)
    } else {
      toast.success('Nota fiscal cadastrada com sucesso.')
      fetchInvoices()
      setDialogOpen(false)
    }

    setSaving(false)
  }

  // ---------------------------------------------------------------------------
  // Delete handler
  // ---------------------------------------------------------------------------

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)

    const { error } = await supabase.from('invoices').delete().eq('id', deleteId)

    if (error) {
      toast.error('Erro ao excluir nota fiscal.')
      console.error(error)
    } else {
      toast.success('Nota fiscal excluída.')
      fetchInvoices()
    }

    setDeleteId(null)
    setDeleting(false)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notas Fiscais</h1>
          <p className="text-sm text-muted-foreground">
            Gestão de notas fiscais dos contratos de locação
          </p>
        </div>
        <Button onClick={handleOpenNew}>
          <Plus className="h-4 w-4" />
          Nova Nota Fiscal
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-4 grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg bg-indigo-100 p-3 dark:bg-indigo-900/30">
              <FileText className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Notas Emitidas</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg bg-emerald-100 p-3 dark:bg-emerald-900/30">
              <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valor Total</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(stats.valorTotal)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <Select value={filterMes} onValueChange={(v) => setFilterMes(v ?? 'all')}>
              <SelectTrigger className="w-full sm:w-[200px]">
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
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Imóvel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os imóveis</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.endereco}, {p.numero}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredInvoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="mt-4 text-lg font-medium">Nenhuma nota fiscal encontrada</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {invoices.length === 0
                ? 'Cadastre a primeira nota fiscal.'
                : 'Tente ajustar os filtros.'}
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
                    <TableHead>Nº NF</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead>Arquivos</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((inv) => {
                    const imovel = inv.contrato?.imovel || inv.imovel
                    const inquilino = inv.contrato?.inquilino
                    const isAirbnb = inv.tipo === 'airbnb'
                    const enderecoCompleto = imovel
                      ? `${imovel.endereco}, ${imovel.numero}`
                      : '—'
                    const refLabel = (() => {
                      try {
                        const [y, m] = inv.referencia_mes.split('-')
                        const d = new Date(Number(y), Number(m) - 1, 1)
                        const l = format(d, 'MMMM/yyyy', { locale: ptBR })
                        return l.charAt(0).toUpperCase() + l.slice(1)
                      } catch {
                        return inv.referencia_mes
                      }
                    })()

                    const hasPdf = !!inv.arquivo_url
                    const hasXml = !!inv.xml_url

                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="max-w-[200px] truncate font-medium">
                          {enderecoCompleto}
                        </TableCell>
                        <TableCell>
                          {isAirbnb ? (
                            <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400">
                              Airbnb
                            </Badge>
                          ) : (
                            inquilino?.nome || '—'
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{inv.numero_nf}</TableCell>
                        <TableCell>{refLabel}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(inv.valor)}
                        </TableCell>
                        <TableCell>{formatDate(inv.data_emissao)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {hasPdf && (
                              <Badge
                                variant="secondary"
                                className="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 cursor-pointer hover:bg-red-100"
                                onClick={() => window.open(inv.arquivo_url, '_blank')}
                              >
                                <File className="h-3 w-3 mr-1" />
                                PDF
                              </Badge>
                            )}
                            {hasXml && (
                              <Badge
                                variant="secondary"
                                className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 cursor-pointer hover:bg-blue-100"
                                onClick={() => window.open(inv.xml_url!, '_blank')}
                              >
                                <FileCode className="h-3 w-3 mr-1" />
                                XML
                              </Badge>
                            )}
                            {!hasPdf && !hasXml && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {!isAirbnb && inquilino?.telefone && (
                              <WhatsAppButton
                                variant="icon"
                                telefone={inquilino.telefone}
                                mensagem={generateInvoiceMessage(
                                  inquilino.nome,
                                  enderecoCompleto,
                                  inv.referencia_mes,
                                  inv.valor,
                                  inv.arquivo_url || undefined,
                                )}
                              />
                            )}

                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-red-500 hover:text-red-600"
                              title="Excluir"
                              onClick={() => setDeleteId(inv.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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
            {filteredInvoices.map((inv) => {
              const imovel = inv.contrato?.imovel || inv.imovel
              const inquilino = inv.contrato?.inquilino
              const isAirbnb = inv.tipo === 'airbnb'
              const enderecoCompleto = imovel
                ? `${imovel.endereco}, ${imovel.numero}`
                : '—'
              const refLabel = (() => {
                try {
                  const [y, m] = inv.referencia_mes.split('-')
                  const d = new Date(Number(y), Number(m) - 1, 1)
                  const l = format(d, 'MMMM/yyyy', { locale: ptBR })
                  return l.charAt(0).toUpperCase() + l.slice(1)
                } catch {
                  return inv.referencia_mes
                }
              })()

              const hasPdf = !!inv.arquivo_url
              const hasXml = !!inv.xml_url

              return (
                <Card key={inv.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm">{enderecoCompleto}</CardTitle>
                      <span className="font-mono text-xs text-muted-foreground">{inv.numero_nf}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{isAirbnb ? 'Tipo' : 'Inquilino'}</span>
                        <span>{isAirbnb ? 'Airbnb' : (inquilino?.nome || '—')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Referência</span>
                        <span>{refLabel}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valor</span>
                        <span className="font-medium">{formatCurrency(inv.valor)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Emissão</span>
                        <span>{formatDate(inv.data_emissao)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Arquivos</span>
                        <div className="flex gap-1.5">
                          {hasPdf && (
                            <Badge
                              variant="secondary"
                              className="bg-red-50 text-red-700 cursor-pointer text-xs"
                              onClick={() => window.open(inv.arquivo_url, '_blank')}
                            >
                              PDF
                            </Badge>
                          )}
                          {hasXml && (
                            <Badge
                              variant="secondary"
                              className="bg-blue-50 text-blue-700 cursor-pointer text-xs"
                              onClick={() => window.open(inv.xml_url!, '_blank')}
                            >
                              XML
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-1 border-t pt-3">
                      {!isAirbnb && inquilino?.telefone && (
                        <WhatsAppButton
                          variant="icon"
                          telefone={inquilino.telefone}
                          mensagem={generateInvoiceMessage(
                            inquilino.nome,
                            enderecoCompleto,
                            inv.referencia_mes,
                            inv.valor,
                            inv.arquivo_url || undefined,
                          )}
                        />
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-red-500 hover:text-red-600"
                        title="Excluir"
                        onClick={() => setDeleteId(inv.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {!loading && invoices.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Exibindo {filteredInvoices.length} de {invoices.length} notas fiscais
        </p>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* Nova Nota Fiscal Dialog                                              */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Nota Fiscal</DialogTitle>
            <DialogDescription>
              Cadastre uma nova nota fiscal. Anexe o PDF e/ou XML.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Tipo */}
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select
                value={formData.tipo}
                onValueChange={(v) => {
                  if (v === 'aluguel' || v === 'airbnb') {
                    setFormData({ ...formData, tipo: v, contrato_id: '', imovel_id: '' })
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aluguel">Aluguel (contrato)</SelectItem>
                  <SelectItem value="airbnb">Airbnb (locação temporária)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Contrato - for aluguel */}
            {formData.tipo === 'aluguel' && (
              <div className="space-y-2">
                <Label>Contrato (Imóvel + Inquilino) *</Label>
                <Select
                  value={formData.contrato_id}
                  onValueChange={(v) => setFormData({ ...formData, contrato_id: v ?? '' })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione um contrato" />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.imovel?.endereco}, {c.imovel?.numero} — {c.inquilino?.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Imovel - for airbnb */}
            {formData.tipo === 'airbnb' && (
              <div className="space-y-2">
                <Label>Imóvel *</Label>
                <Select
                  value={formData.imovel_id}
                  onValueChange={(v) => setFormData({ ...formData, imovel_id: v ?? '' })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o imovel" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.endereco}, {p.numero}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Número NF */}
            <div className="space-y-2">
              <Label>Número NF *</Label>
              <Input
                value={formData.numero_nf}
                onChange={(e) => setFormData({ ...formData, numero_nf: e.target.value })}
                placeholder="Ex: NF-001234"
              />
            </div>

            {/* Valor */}
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.valor}
                onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                placeholder="0,00"
              />
            </div>

            {/* Mês Referência */}
            <div className="space-y-2">
              <Label>Mês Referência *</Label>
              <Select
                value={formData.referencia_mes}
                onValueChange={(v) => setFormData({ ...formData, referencia_mes: v ?? '' })}
              >
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

            {/* Data Emissão */}
            <div className="space-y-2">
              <Label>Data de Emissão *</Label>
              <Input
                type="date"
                value={formData.data_emissao}
                onChange={(e) => setFormData({ ...formData, data_emissao: e.target.value })}
              />
            </div>

            {/* Separator - Arquivos */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Arquivos da Nota Fiscal</p>

              {/* Arquivo PDF */}
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <File className="h-4 w-4 text-red-500" />
                    Arquivo PDF
                  </Label>
                  <div className="flex items-center gap-2">
                    <label className="flex-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50">
                      <Upload className="h-4 w-4" />
                      {formData.arquivo_pdf ? formData.arquivo_pdf.name : 'Selecionar PDF da nota'}
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          setFormData({ ...formData, arquivo_pdf: file })
                        }}
                      />
                    </label>
                    {formData.arquivo_pdf && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData({ ...formData, arquivo_pdf: null })}
                        type="button"
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                </div>

                {/* Arquivo XML */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <FileCode className="h-4 w-4 text-blue-500" />
                    Arquivo XML
                  </Label>
                  <div className="flex items-center gap-2">
                    <label className="flex-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/50">
                      <Upload className="h-4 w-4" />
                      {formData.arquivo_xml ? formData.arquivo_xml.name : 'Selecionar XML da nota'}
                      <input
                        type="file"
                        accept=".xml"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          setFormData({ ...formData, arquivo_xml: file })
                        }}
                      />
                    </label>
                    {formData.arquivo_xml && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFormData({ ...formData, arquivo_xml: null })}
                        type="button"
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar Nota Fiscal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------- */}
      {/* Confirm Delete Dialog                                                */}
      {/* ------------------------------------------------------------------- */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Nota Fiscal</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta nota fiscal? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
