'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft,
  Edit,
  FileText,
  Calendar,
  DollarSign,
  Download,
  Loader2,
  Eye,
  CalendarPlus,
  AlertTriangle,
  Plus,
  Upload,
  Trash2,
} from 'lucide-react'
import { ContractForm } from '@/components/forms/contract-form'
import { InspectionForm } from '@/components/forms/inspection-form'
import { toast } from 'sonner'
import { format, parseISO, differenceInDays, differenceInMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Contract, ContractDocument, Inspection, Boleto, Invoice, BoletoStatus } from '@/types/database'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatDate = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return dateStr
  }
}

const GARANTIA_LABELS: Record<string, string> = {
  caucao: 'Caução',
  fiador: 'Fiador',
  seguro_fianca: 'Seguro Fiança',
}

const CAUCAO_FORMA_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência/PIX',
  cheque: 'Cheque',
  deposito: 'Depósito',
  outro: 'Outro',
}

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

const BOLETO_STATUS_CONFIG: Record<BoletoStatus, { label: string; className: string }> = {
  pendente: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  pago: { label: 'Pago', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  vencido: { label: 'Vencido', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  cancelado: { label: 'Cancelado', className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
}

export default function ContratoDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { profile } = useAuth()
  const id = params.id as string

  const [contract, setContract] = useState<Contract | null>(null)
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [boletos, setBoletos] = useState<Boleto[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [encerrarDialogOpen, setEncerrarDialogOpen] = useState(false)
  const [encerrarLoading, setEncerrarLoading] = useState(false)
  const [novaVistoriaDialogOpen, setNovaVistoriaDialogOpen] = useState(false)
  const [documentos, setDocumentos] = useState<ContractDocument[]>([])
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docNome, setDocNome] = useState('')
  const [docTipo, setDocTipo] = useState('Imposto de Renda')
  const [prorrogarDialogOpen, setProrrogarDialogOpen] = useState(false)
  const [prorrogarLoading, setProrrogarLoading] = useState(false)
  const [novaDataFim, setNovaDataFim] = useState('')
  const [novoValor, setNovoValor] = useState('')

  const isGestor = profile?.role === 'gestor'

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [contractRes, inspectionsRes, boletosRes, invoicesRes] = await Promise.all([
      supabase
        .from('contracts')
        .select('*, imovel:properties(*, proprietario:profiles!proprietario_id(*)), inquilino:profiles!inquilino_id(*)')
        .eq('id', id)
        .single(),
      supabase
        .from('inspections')
        .select('*, fotos:inspection_photos(*)')
        .eq('contrato_id', id)
        .order('data', { ascending: false }),
      supabase
        .from('boletos')
        .select('*')
        .eq('contrato_id', id)
        .order('data_vencimento', { ascending: false }),
      supabase
        .from('invoices')
        .select('*')
        .eq('contrato_id', id)
        .order('data_emissao', { ascending: false }),
    ])

    if (contractRes.error) {
      toast.error('Erro ao carregar contrato')
      console.error(contractRes.error)
      setLoading(false)
      return
    }

    setContract(contractRes.data as Contract)

    if (!inspectionsRes.error) {
      setInspections((inspectionsRes.data ?? []) as Inspection[])
    }
    if (!boletosRes.error) {
      setBoletos((boletosRes.data ?? []) as Boleto[])
    }
    if (!invoicesRes.error) {
      setInvoices((invoicesRes.data ?? []) as Invoice[])
    }

    // Fetch documents
    const { data: docsData } = await supabase
      .from('contract_documents')
      .select('*')
      .eq('contrato_id', id)
      .order('created_at', { ascending: false })
    setDocumentos((docsData ?? []) as ContractDocument[])

    setLoading(false)
  }, [id])

  useEffect(() => {
    if (id) fetchData()
  }, [id, fetchData])

  async function handleEncerrarContrato() {
    if (!contract) return
    setEncerrarLoading(true)

    try {
      const { error: contractError } = await supabase
        .from('contracts')
        .update({ ativo: false })
        .eq('id', contract.id)

      if (contractError) throw contractError

      // Update property status to disponivel
      const { error: propError } = await supabase
        .from('properties')
        .update({ status: 'disponivel' })
        .eq('id', contract.imovel_id)

      if (propError) throw propError

      toast.success('Contrato encerrado com sucesso')
      setEncerrarDialogOpen(false)
      fetchData()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Erro desconhecido'
      toast.error(`Erro ao encerrar contrato: ${message}`)
    } finally {
      setEncerrarLoading(false)
    }
  }

  async function handleUploadDoc(file: File) {
    if (!contract) return
    setUploadingDoc(true)
    try {
      const ext = file.name.split('.').pop() || 'pdf'
      const fileName = `${contract.id}/${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('Contratos')
        .upload(fileName, file)
      if (uploadErr) throw uploadErr

      const { data: urlData } = supabase.storage
        .from('Contratos')
        .getPublicUrl(fileName)

      const { error: insertErr } = await supabase
        .from('contract_documents')
        .insert({
          contrato_id: contract.id,
          nome: docNome.trim() || file.name,
          tipo: docTipo,
          url: urlData.publicUrl,
        })
      if (insertErr) throw insertErr

      toast.success('Documento enviado com sucesso')
      setDocNome('')
      fetchData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.error(`Erro ao enviar documento: ${msg}`)
    } finally {
      setUploadingDoc(false)
    }
  }

  async function handleDeleteDoc(docId: string) {
    const { error } = await supabase
      .from('contract_documents')
      .delete()
      .eq('id', docId)
    if (error) {
      toast.error('Erro ao excluir documento')
    } else {
      toast.success('Documento excluído')
      fetchData()
    }
  }

  async function handleProrrogar() {
    if (!contract || !novaDataFim) return
    setProrrogarLoading(true)

    try {
      const payload: Record<string, unknown> = {
        data_fim: novaDataFim,
        ativo: true,
      }

      if (novoValor.trim()) {
        const valor = parseFloat(novoValor.replace(',', '.'))
        if (!isNaN(valor) && valor > 0) {
          payload.valor_aluguel = valor
        }
      }

      const { error } = await supabase
        .from('contracts')
        .update(payload)
        .eq('id', contract.id)

      if (error) throw error

      toast.success('Contrato prorrogado com sucesso!')
      setProrrogarDialogOpen(false)
      setNovaDataFim('')
      setNovoValor('')
      fetchData()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Erro desconhecido'
      toast.error(`Erro ao prorrogar contrato: ${message}`)
    } finally {
      setProrrogarLoading(false)
    }
  }

  // Verificar se o contrato precisa de reajuste (mais de 12 meses desde o início)
  const mesesContrato = contract
    ? differenceInMonths(
        novaDataFim ? parseISO(novaDataFim) : parseISO(contract.data_fim),
        parseISO(contract.data_inicio)
      )
    : 0
  const precisaReajuste = mesesContrato >= 12

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <FileText className="h-12 w-12 text-muted-foreground/40" />
        <h3 className="mt-4 text-lg font-medium">Contrato nao encontrado</h3>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/contratos')}>
          <ArrowLeft className="h-4 w-4" />
          Voltar para Contratos
        </Button>
      </div>
    )
  }

  const daysUntilEnd = differenceInDays(parseISO(contract.data_fim), new Date())
  const isExpiring = contract.ativo && daysUntilEnd >= 0 && daysUntilEnd <= 30
  const isExpired = contract.ativo && daysUntilEnd < 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/contratos')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">
                Contrato - {contract.imovel?.endereco ?? ''}, {contract.imovel?.numero ?? ''}
              </h1>
              <Badge
                variant="secondary"
                className={
                  !contract.ativo
                    ? 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                    : isExpired
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      : isExpiring
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                }
              >
                {!contract.ativo ? 'Inativo' : isExpired ? 'Vencido' : isExpiring ? 'Vencendo' : 'Ativo'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Inquilino: {contract.inquilino?.nome ?? '-'} | Valor: {formatCurrency(contract.valor_aluguel)}
            </p>
          </div>
        </div>

        {isGestor && (
          <div className="flex flex-wrap gap-2">
            {contract.arquivo_url && (
              <Button
                variant="outline"
                onClick={() => window.open(contract.arquivo_url!, '_blank')}
              >
                <Download className="h-4 w-4" />
                Baixar PDF
              </Button>
            )}

            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogTrigger
                render={
                  <Button variant="outline">
                    <Edit className="h-4 w-4" />
                    Editar
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Editar Contrato</DialogTitle>
                </DialogHeader>
                <ContractForm
                  contract={contract}
                  onSuccess={(updated) => {
                    setContract(updated)
                    setEditDialogOpen(false)
                  }}
                  onCancel={() => setEditDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>

            {contract.ativo && (
              <>
                {/* Prorrogar */}
                <Dialog open={prorrogarDialogOpen} onOpenChange={(open) => {
                  setProrrogarDialogOpen(open)
                  if (!open) { setNovaDataFim(''); setNovoValor('') }
                }}>
                  <DialogTrigger
                    render={
                      <Button variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50">
                        <CalendarPlus className="h-4 w-4" />
                        Prorrogar
                      </Button>
                    }
                  />
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Prorrogar Contrato</DialogTitle>
                      <DialogDescription>
                        Contrato atual: {formatDate(contract.data_inicio)} a {formatDate(contract.data_fim)} — Valor: {formatCurrency(contract.valor_aluguel)}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div>
                        <Label htmlFor="novaDataFim">Nova data de término *</Label>
                        <Input
                          id="novaDataFim"
                          type="date"
                          value={novaDataFim}
                          onChange={(e) => setNovaDataFim(e.target.value)}
                          min={contract.data_fim}
                        />
                      </div>
                      <div>
                        <Label htmlFor="novoValor">Novo valor do aluguel (opcional)</Label>
                        <Input
                          id="novoValor"
                          type="text"
                          placeholder={`Atual: ${formatCurrency(contract.valor_aluguel)}`}
                          value={novoValor}
                          onChange={(e) => setNovoValor(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Deixe em branco para manter o valor atual.
                        </p>
                      </div>

                      {/* Alerta de reajuste IGPM/IPCA */}
                      {novaDataFim && differenceInMonths(parseISO(novaDataFim), parseISO(contract.data_inicio)) >= 12 && (
                        <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
                          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                          <div className="text-sm">
                            <p className="font-semibold">Atenção — Reajuste de aluguel</p>
                            <p className="mt-1">
                              Com esta prorrogação, o contrato ultrapassa 12 meses.
                              Pode ser necessário aplicar reajuste pelo <strong>IGPM</strong> ou <strong>IPCA</strong> conforme cláusula contratual.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>
                        Cancelar
                      </DialogClose>
                      <Button onClick={handleProrrogar} disabled={prorrogarLoading || !novaDataFim}>
                        {prorrogarLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                        Confirmar Prorrogação
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Encerrar */}
                <Dialog open={encerrarDialogOpen} onOpenChange={setEncerrarDialogOpen}>
                  <DialogTrigger
                    render={
                      <Button variant="destructive">
                        Encerrar Contrato
                      </Button>
                    }
                  />
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Encerrar Contrato</DialogTitle>
                      <DialogDescription>
                        Tem certeza que deseja encerrar este contrato? O imóvel será marcado como disponível.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>
                        Cancelar
                      </DialogClose>
                      <Button variant="destructive" onClick={handleEncerrarContrato} disabled={encerrarLoading}>
                        {encerrarLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                        Confirmar Encerramento
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="detalhes">
        <TabsList>
          <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
          <TabsTrigger value="vistorias">Vistorias</TabsTrigger>
          <TabsTrigger value="boletos">Boletos</TabsTrigger>
          <TabsTrigger value="notas">Notas Fiscais</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
        </TabsList>

        {/* Detalhes Tab */}
        <TabsContent value="detalhes">
          {/* Alerta de reajuste para contratos com mais de 12 meses */}
          {contract.ativo && precisaReajuste && (
            <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 mb-4">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">Reajuste de aluguel pode ser necessário</p>
                <p className="mt-1">
                  Este contrato tem <strong>{mesesContrato} meses</strong> desde o início ({formatDate(contract.data_inicio)}).
                  Verifique se é necessário aplicar reajuste pelo IGPM ou IPCA conforme cláusula contratual.
                </p>
              </div>
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Informacoes do Contrato
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InfoField
                  label="Imóvel"
                  value={
                    contract.imovel
                      ? `${contract.imovel.endereco}, ${contract.imovel.numero} - ${contract.imovel.bairro}`
                      : '-'
                  }
                />
                <InfoField label="Inquilino" value={contract.inquilino?.nome ?? '-'} />
                {contract.inquilino?.cpf_cnpj && (
                  <InfoField label="CPF/CNPJ" value={formatCpfCnpj(contract.inquilino.cpf_cnpj)} />
                )}
                {contract.inquilino?.residente && (
                  <InfoField label="Residente no Imóvel" value={contract.inquilino.residente} />
                )}
                <InfoField label="Valor do Aluguel" value={formatCurrency(contract.valor_aluguel)} />
                <InfoField
                  label="Garantia"
                  value={GARANTIA_LABELS[contract.tipo_garantia] ?? contract.tipo_garantia}
                />
                {contract.tipo_garantia === 'caucao' && contract.caucao_valor && (
                  <>
                    <InfoField label="Valor da Caução" value={formatCurrency(contract.caucao_valor)} />
                    <InfoField
                      label="Forma de Pagamento"
                      value={CAUCAO_FORMA_LABELS[contract.caucao_forma_pagamento ?? ''] ?? '-'}
                    />
                  </>
                )}
                <InfoField
                  label="Status"
                  value={contract.ativo ? 'Ativo' : 'Inativo'}
                />
                <InfoField label="Inicio" value={formatDate(contract.data_inicio)} />
                <InfoField label="Fim" value={formatDate(contract.data_fim)} />
                {contract.ativo && (
                  <InfoField
                    label="Dias restantes"
                    value={daysUntilEnd >= 0 ? `${daysUntilEnd} dias` : 'Vencido'}
                  />
                )}
                {contract.observacoes && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <InfoField label="Observacoes" value={contract.observacoes} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vistorias Tab */}
        <TabsContent value="vistorias">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Vistorias</h2>
            {isGestor && (
              <Dialog open={novaVistoriaDialogOpen} onOpenChange={setNovaVistoriaDialogOpen}>
                <DialogTrigger
                  render={
                    <Button>
                      <Plus className="h-4 w-4" />
                      Nova Vistoria
                    </Button>
                  }
                />
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Nova Vistoria</DialogTitle>
                    <DialogDescription>
                      Cadastrar vistoria para o contrato de {contract.imovel?.endereco ?? ''}, {contract.imovel?.numero ?? ''}
                    </DialogDescription>
                  </DialogHeader>
                  <InspectionForm
                    contratoId={id}
                    onSuccess={() => {
                      setNovaVistoriaDialogOpen(false)
                      fetchData()
                    }}
                    onCancel={() => setNovaVistoriaDialogOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            )}
          </div>
          {inspections.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground/40" />
                <h3 className="mt-4 text-lg font-medium">Nenhuma vistoria registrada</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nao ha vistorias vinculadas a este contrato.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {inspections.map((insp) => (
                <Card
                  key={insp.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => router.push(`/vistorias/${insp.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        Vistoria de {insp.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {formatDate(insp.data)}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/vistorias/${insp.id}`)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                          Abrir
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {insp.observacoes && (
                      <p className="text-sm text-muted-foreground mb-3">{insp.observacoes}</p>
                    )}
                    {insp.fotos && insp.fotos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                        {insp.fotos.map((foto) => (
                          <div
                            key={foto.id}
                            className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
                          >
                            <img
                              src={foto.url}
                              alt={foto.descricao || foto.comodo}
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                              <p className="text-[10px] text-white truncate">{foto.comodo}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Boletos Tab */}
        <TabsContent value="boletos">
          {boletos.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <DollarSign className="h-12 w-12 text-muted-foreground/40" />
                <h3 className="mt-4 text-lg font-medium">Nenhum boleto encontrado</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nao ha boletos vinculados a este contrato.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boletos.map((boleto) => {
                    const statusConf = BOLETO_STATUS_CONFIG[boleto.status]
                    return (
                      <TableRow key={boleto.id}>
                        <TableCell className="font-medium">{boleto.referencia_mes}</TableCell>
                        <TableCell>{formatDate(boleto.data_vencimento)}</TableCell>
                        <TableCell>
                          {boleto.data_pagamento ? formatDate(boleto.data_pagamento) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusConf.className}>
                            {statusConf.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(boleto.valor)}
                        </TableCell>
                        <TableCell>
                          {boleto.url_pdf && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => window.open(boleto.url_pdf!, '_blank')}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Notas Fiscais Tab */}
        <TabsContent value="notas">
          {invoices.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/40" />
                <h3 className="mt-4 text-lg font-medium">Nenhuma nota fiscal encontrada</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nao ha notas fiscais vinculadas a este contrato.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número NF</TableHead>
                    <TableHead>Referência</TableHead>
                    <TableHead>Data Emissão</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((nf) => (
                    <TableRow key={nf.id}>
                      <TableCell className="font-medium">{nf.numero_nf}</TableCell>
                      <TableCell>{nf.referencia_mes}</TableCell>
                      <TableCell>{formatDate(nf.data_emissao)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(nf.valor)}
                      </TableCell>
                      <TableCell>
                        {nf.arquivo_url && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => window.open(nf.arquivo_url, '_blank')}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* Documentos Tab */}
        <TabsContent value="documentos">
          <div className="space-y-4">
            {/* Upload area */}
            {isGestor && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Enviar Documento</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                    <div>
                      <Label className="text-xs">Tipo do Documento</Label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={docTipo}
                        onChange={(e) => setDocTipo(e.target.value)}
                      >
                        <option value="Imposto de Renda">Imposto de Renda</option>
                        <option value="Imóvel em Fiança">Imóvel em Fiança</option>
                        <option value="Comprovante de Renda">Comprovante de Renda</option>
                        <option value="RG/CPF">RG/CPF</option>
                        <option value="Comprovante de Residência">Comprovante de Residência</option>
                        <option value="Certidão de Matrícula">Certidão de Matrícula</option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Nome/Descrição (opcional)</Label>
                      <Input
                        value={docNome}
                        onChange={(e) => setDocNome(e.target.value)}
                        placeholder="Ex: IR 2025 - Fiador"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Arquivo</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          className="flex-1"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleUploadDoc(file)
                            e.target.value = ''
                          }}
                          disabled={uploadingDoc}
                        />
                        {uploadingDoc && <Loader2 className="h-4 w-4 animate-spin" />}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Documents list */}
            {documentos.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Upload className="h-12 w-12 text-muted-foreground/40" />
                  <h3 className="mt-4 text-lg font-medium">Nenhum documento anexado</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Envie documentos como Imposto de Renda, imóvel em fiança, etc.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentos.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <Badge variant="secondary">{doc.tipo}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">{doc.nome}</TableCell>
                        <TableCell>{formatDate(doc.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => window.open(doc.url, '_blank')}
                              title="Visualizar"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => window.open(doc.url, '_blank')}
                              title="Baixar"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            {isGestor && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleDeleteDoc(doc.id)}
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  )
}
