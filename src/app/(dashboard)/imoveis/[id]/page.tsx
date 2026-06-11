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
import {
  ArrowLeft,
  Edit,
  Trash2,
  Building2,
  FileText,
  Calendar,
  DollarSign,
  Eye,
  Loader2,
} from 'lucide-react'
import { PropertyForm } from '@/components/forms/property-form'
import { PropertyInventory } from '@/components/property-inventory'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Property, Contract, Inspection, Expense, PropertyStatus } from '@/types/database'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatDate = (dateStr: string) => {
  try {
    return format(new Date(dateStr + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return dateStr
  }
}

const STATUS_CONFIG: Record<PropertyStatus, { label: string; className: string }> = {
  disponivel: { label: 'Disponível', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  locado: { label: 'Locado', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  manutencao: { label: 'Manutenção', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  aplicativo: { label: 'Aplicativo', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
}

const GARANTIA_LABELS: Record<string, string> = {
  caucao: 'Caução',
  fiador: 'Fiador',
  seguro_fianca: 'Seguro Fiança',
}

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  iptu: 'IPTU',
  condominio: 'Condomínio',
  manutencao: 'Manutenção',
  seguro: 'Seguro',
  outros: 'Outros',
}

export default function PropertyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { profile } = useAuth()
  const id = params.id as string

  const [property, setProperty] = useState<Property | null>(null)
  const [activeContract, setActiveContract] = useState<Contract | null>(null)
  const [pastContracts, setPastContracts] = useState<Contract[]>([])
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isGestor = profile?.role === 'gestor'

  const fetchData = useCallback(async () => {
    setLoading(true)

    const [propRes, contractsRes, inspectionsRes, expensesRes] = await Promise.all([
      supabase
        .from('properties')
        .select('*, proprietario:profiles!proprietario_id(*)')
        .eq('id', id)
        .single(),
      supabase
        .from('contracts')
        .select('*, inquilino:profiles!inquilino_id(*)')
        .eq('imovel_id', id)
        .order('data_inicio', { ascending: false }),
      supabase
        .from('inspections')
        .select('*, fotos:inspection_photos(*)')
        .eq('imovel_id', id)
        .order('data', { ascending: false }),
      supabase
        .from('expenses')
        .select('*')
        .eq('imovel_id', id)
        .order('data_vencimento', { ascending: false }),
    ])

    if (propRes.error) {
      toast.error('Erro ao carregar imovel')
      console.error(propRes.error)
      setLoading(false)
      return
    }

    setProperty(propRes.data as Property)

    if (!contractsRes.error && contractsRes.data) {
      const contracts = contractsRes.data as Contract[]
      const active = contracts.find((c) => c.ativo) ?? null
      setActiveContract(active)
      setPastContracts(contracts.filter((c) => !c.ativo))
    }

    if (!inspectionsRes.error) {
      setInspections((inspectionsRes.data ?? []) as Inspection[])
    }

    if (!expensesRes.error) {
      setExpenses((expensesRes.data ?? []) as Expense[])
    }

    setLoading(false)
  }, [id])

  useEffect(() => {
    if (id) fetchData()
  }, [id, fetchData])

  async function handleDelete() {
    setDeleting(true)
    try {
      const { error } = await supabase.from('properties').delete().eq('id', id)
      if (error) throw error
      toast.success('Imovel excluido com sucesso')
      router.push('/imoveis')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Erro desconhecido'
      toast.error(`Erro ao excluir: ${message}`)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Building2 className="h-12 w-12 text-muted-foreground/40" />
        <h3 className="mt-4 text-lg font-medium">Imóvel não encontrado</h3>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/imoveis')}>
          <ArrowLeft className="h-4 w-4" />
          Voltar para Imóveis
        </Button>
      </div>
    )
  }

  const statusConf = STATUS_CONFIG[property.status]
  const totalExpenses = expenses.reduce((sum, e) => sum + e.valor, 0)
  const paidExpenses = expenses.filter((e) => e.pago).reduce((sum, e) => sum + e.valor, 0)
  const pendingExpenses = totalExpenses - paidExpenses

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/imoveis')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">
                {property.endereco}, {property.numero}
              </h1>
              <Badge variant="secondary" className={statusConf.className}>
                {statusConf.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {property.bairro} - {property.cidade}/{property.estado}
              {property.complemento && ` | ${property.complemento}`}
            </p>
          </div>
        </div>

        {isGestor && (
          <div className="flex gap-2">
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
                  <DialogTitle>Editar Imovel</DialogTitle>
                </DialogHeader>
                <PropertyForm
                  property={property}
                  onSuccess={(updated) => {
                    setProperty(updated)
                    setEditDialogOpen(false)
                  }}
                  onCancel={() => setEditDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger
                render={
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirmar Exclusao</DialogTitle>
                  <DialogDescription>
                    Tem certeza que deseja excluir este imovel? Esta acao nao pode ser desfeita.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose
                    render={<Button variant="outline" />}
                  >
                    Cancelar
                  </DialogClose>
                  <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                    {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Excluir
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="detalhes">
        <TabsList>
          <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
          <TabsTrigger value="contrato">Contrato Ativo</TabsTrigger>
          <TabsTrigger value="inventario">Inventário</TabsTrigger>
          <TabsTrigger value="vistorias">Vistorias</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="historico">Historico</TabsTrigger>
        </TabsList>

        {/* Detalhes Tab */}
        <TabsContent value="detalhes">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Informacoes do Imovel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InfoField label="Endereço" value={`${property.endereco}, ${property.numero}`} />
                {property.complemento && <InfoField label="Complemento" value={property.complemento} />}
                <InfoField label="Bairro" value={property.bairro} />
                <InfoField label="Cidade" value={property.cidade} />
                <InfoField label="Estado" value={property.estado} />
                <InfoField label="CEP" value={property.cep || '-'} />
                <InfoField label="Tipo" value={property.tipo} />
                <InfoField label="Proprietário" value={property.proprietario?.nome ?? '-'} />
                <InfoField label="Despesas pagas por" value={property.despesas_pagas_por === 'empresa' ? 'Empresa' : 'Inquilino'} />
                {property.observacoes && (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <InfoField label="Observacoes" value={property.observacoes} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contrato Ativo Tab */}
        <TabsContent value="contrato">
          {activeContract ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Contrato Ativo
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/contratos/${activeContract.id}`)}
                  >
                    <Eye className="h-4 w-4" />
                    Ver Detalhes
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <InfoField
                    label="Inquilino"
                    value={activeContract.inquilino?.nome ?? '-'}
                  />
                  <InfoField
                    label="Valor do Aluguel"
                    value={formatCurrency(activeContract.valor_aluguel)}
                  />
                  <InfoField
                    label="Garantia"
                    value={GARANTIA_LABELS[activeContract.tipo_garantia] ?? activeContract.tipo_garantia}
                  />
                  <InfoField
                    label="Inicio"
                    value={formatDate(activeContract.data_inicio)}
                  />
                  <InfoField
                    label="Fim"
                    value={formatDate(activeContract.data_fim)}
                  />
                  {activeContract.observacoes && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <InfoField label="Observacoes" value={activeContract.observacoes} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/40" />
                <h3 className="mt-4 text-lg font-medium">Nenhum contrato ativo</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Este imovel nao possui contrato vigente.
                </p>
                {isGestor && (
                  <Button className="mt-4" onClick={() => router.push('/contratos/novo')}>
                    Criar Contrato
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Inventario Tab */}
        <TabsContent value="inventario">
          <PropertyInventory imovelId={id} readOnly={!isGestor} />
        </TabsContent>

        {/* Vistorias Tab */}
        <TabsContent value="vistorias">
          {inspections.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground/40" />
                <h3 className="mt-4 text-lg font-medium">Nenhuma vistoria registrada</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nao ha vistorias para este imovel.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {inspections.map((insp) => (
                <Card key={insp.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        Vistoria de {insp.tipo === 'entrada' ? 'Entrada' : 'Saida'}
                      </CardTitle>
                      <Badge variant="secondary">
                        {formatDate(insp.data)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {insp.observacoes && (
                      <p className="text-sm text-muted-foreground mb-3">{insp.observacoes}</p>
                    )}
                    {insp.fotos && insp.fotos.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Fotos ({insp.fotos.length})
                        </p>
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
                                <p className="text-[10px] text-white truncate">
                                  {foto.comodo}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Financeiro Tab */}
        <TabsContent value="financeiro">
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Total Despesas</p>
                  <p className="text-lg font-bold">{formatCurrency(totalExpenses)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Pagas</p>
                  <p className="text-lg font-bold text-emerald-600">{formatCurrency(paidExpenses)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                  <p className="text-lg font-bold text-red-600">{formatCurrency(pendingExpenses)}</p>
                </CardContent>
              </Card>
            </div>

            {expenses.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <DollarSign className="h-12 w-12 text-muted-foreground/40" />
                  <h3 className="mt-4 text-lg font-medium">Nenhuma despesa registrada</h3>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Descricao</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((exp) => (
                      <TableRow key={exp.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {EXPENSE_CATEGORY_LABELS[exp.categoria] ?? exp.categoria}
                          </Badge>
                        </TableCell>
                        <TableCell>{exp.descricao}</TableCell>
                        <TableCell>{formatDate(exp.data_vencimento)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              exp.pago
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            }
                          >
                            {exp.pago ? 'Pago' : 'Pendente'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(exp.valor)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Historico Tab */}
        <TabsContent value="historico">
          {pastContracts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground/40" />
                <h3 className="mt-4 text-lg font-medium">Nenhum contrato encerrado</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Nao ha contratos anteriores para este imovel.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inquilino</TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Garantia</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pastContracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.inquilino?.nome ?? '-'}</TableCell>
                      <TableCell>
                        {formatDate(c.data_inicio)} - {formatDate(c.data_fim)}
                      </TableCell>
                      <TableCell>
                        {GARANTIA_LABELS[c.tipo_garantia] ?? c.tipo_garantia}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(c.valor_aluguel)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => router.push(`/contratos/${c.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
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
