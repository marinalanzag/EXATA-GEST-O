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
} from '@/components/ui/dialog'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Plus,
  Edit,
  Trash2,
  Check,
  Loader2,
  FileText,
  Upload,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { format, parseISO, subMonths, isBefore } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Expense, Property, Contract, ExpenseCategory, ExpensePayer } from '@/types/database'

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

type ExpenseStatus = 'pago' | 'pendente' | 'vencido'

function getExpenseStatus(expense: Expense): ExpenseStatus {
  if (expense.pago) return 'pago'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const vencimento = parseISO(expense.data_vencimento)
  if (isBefore(vencimento, today)) return 'vencido'
  return 'pendente'
}

const STATUS_CONFIG: Record<ExpenseStatus, { label: string; className: string }> = {
  pago: {
    label: 'Pago',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  pendente: {
    label: 'Pendente',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  vencido: {
    label: 'Vencido',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
}

const CATEGORY_CONFIG: Record<ExpenseCategory, { label: string; className: string; color: string }> = {
  iptu: {
    label: 'IPTU',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    color: '#8b5cf6',
  },
  condominio: {
    label: 'Condomínio',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    color: '#3b82f6',
  },
  manutencao: {
    label: 'Manutenção',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    color: '#f97316',
  },
  seguro: {
    label: 'Seguro',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    color: '#10b981',
  },
  outros: {
    label: 'Outros',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    color: '#6b7280',
  },
}

const PAYER_LABELS: Record<ExpensePayer, string> = {
  empresa: 'Empresa',
  inquilino: 'Inquilino',
}

// Generates list of last N months as { value: 'YYYY-MM', label: 'Mês YYYY' }
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

// ---------------------------------------------------------------------------
// Empty form state
// ---------------------------------------------------------------------------

interface ExpenseForm {
  imovel_id: string
  categoria: ExpenseCategory
  descricao: string
  valor: string
  data_vencimento: string
  pago_por: ExpensePayer
  numero_nf: string
  nf_option: 'com_nota' | 'sem_nota'
}

const EMPTY_FORM: ExpenseForm = {
  imovel_id: '',
  categoria: 'outros',
  descricao: '',
  valor: '',
  data_vencimento: '',
  pago_por: 'empresa',
  numero_nf: '',
  nf_option: 'com_nota',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FinanceiroPage() {
  // Data
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)

  // Filters — default to current month
  const monthOptions = useMemo(() => getMonthOptions(12), [])
  const currentMonth = format(new Date(), 'yyyy-MM')
  const [mesFilter, setMesFilter] = useState<string>(currentMonth)
  const [propertyFilter, setPropertyFilter] = useState<string>('todos')
  const [categoriaFilter, setCategoriaFilter] = useState<string>('todos')
  const [statusFilter, setStatusFilter] = useState<string>('todos')

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [form, setForm] = useState<ExpenseForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [xmlFile, setXmlFile] = useState<File | null>(null)
  const [uploadingXml, setUploadingXml] = useState(false)

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ------ Fetch data ------

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [expensesRes, contractsRes, propsRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('*, imovel:properties(*)')
        .order('data_vencimento', { ascending: false }),
      supabase
        .from('contracts')
        .select('*, imovel:properties(*)')
        .eq('ativo', true),
      supabase.from('properties').select('*').order('endereco'),
    ])

    if (expensesRes.error) {
      console.error('Erro ao buscar despesas:', expensesRes.error)
      toast.error('Erro ao carregar despesas')
    } else {
      setExpenses((expensesRes.data ?? []) as Expense[])
    }

    if (!contractsRes.error) {
      setContracts((contractsRes.data ?? []) as Contract[])
    }

    setProperties((propsRes.data ?? []) as Property[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ------ Filtered expenses ------

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      const status = getExpenseStatus(e)

      if (mesFilter !== 'todos') {
        const expMonth = e.data_vencimento.slice(0, 7)
        if (expMonth !== mesFilter) return false
      }

      if (propertyFilter !== 'todos' && e.imovel_id !== propertyFilter) return false
      if (categoriaFilter !== 'todos' && e.categoria !== categoriaFilter) return false

      if (statusFilter === 'pago' && !e.pago) return false
      if (statusFilter === 'pendente' && status !== 'pendente') return false
      if (statusFilter === 'vencido' && status !== 'vencido') return false

      return true
    })
  }, [expenses, mesFilter, propertyFilter, categoriaFilter, statusFilter])

  // ------ Summary cards (filtered by selected month) ------

  const filteredForMonth = useMemo(() => {
    if (mesFilter === 'todos') return expenses
    return expenses.filter((e) => e.data_vencimento.slice(0, 7) === mesFilter)
  }, [expenses, mesFilter])

  const totalReceitas = useMemo(() => {
    // Sum rent from active contracts
    return contracts.reduce((sum, c) => sum + c.valor_aluguel, 0)
  }, [contracts])

  const totalDespesas = useMemo(
    () => filteredForMonth.reduce((sum, e) => sum + e.valor, 0),
    [filteredForMonth]
  )

  const saldo = totalReceitas - totalDespesas

  const contasVencidas = useMemo(
    () => filteredForMonth.filter((e) => getExpenseStatus(e) === 'vencido').length,
    [filteredForMonth]
  )

  // ------ Charts data ------

  const barData = useMemo(() => {
    const months: { key: string; label: string; total: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i)
      const key = format(d, 'yyyy-MM')
      const label = format(d, 'MMM yy', { locale: ptBR })
      months.push({ key, label: label.charAt(0).toUpperCase() + label.slice(1), total: 0 })
    }
    for (const e of expenses) {
      const m = e.data_vencimento.slice(0, 7)
      const entry = months.find((mo) => mo.key === m)
      if (entry) entry.total += e.valor
    }
    return months.map(({ label, total }) => ({ name: label, valor: total }))
  }, [expenses])

  const pieData = useMemo(() => {
    const source = mesFilter === 'todos' ? expenses : filteredForMonth
    const map: Record<string, number> = {}
    for (const e of source) {
      map[e.categoria] = (map[e.categoria] || 0) + e.valor
    }
    return Object.entries(map).map(([cat, value]) => ({
      name: CATEGORY_CONFIG[cat as ExpenseCategory]?.label ?? cat,
      value,
      color: CATEGORY_CONFIG[cat as ExpenseCategory]?.color ?? '#6b7280',
    }))
  }, [expenses, filteredForMonth, mesFilter])

  // ------ XML upload helper ------

  async function uploadXml(file: File, expenseId: string): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'xml'
    const path = `nf-xml/${expenseId}.${ext}`
    const { error } = await supabase.storage
      .from('documentos')
      .upload(path, file, { upsert: true })
    if (error) {
      console.error('Erro ao enviar XML:', error)
      return null
    }
    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(path)
    return urlData.publicUrl
  }

  // ------ Dialog handlers ------

  function openNew() {
    setEditingExpense(null)
    setForm(EMPTY_FORM)
    setXmlFile(null)
    setDialogOpen(true)
  }

  function openEdit(expense: Expense) {
    setEditingExpense(expense)
    const isSemNota = expense.numero_nf === 'SEM NOTA'
    setForm({
      imovel_id: expense.imovel_id,
      categoria: expense.categoria,
      descricao: expense.descricao,
      valor: String(expense.valor),
      data_vencimento: expense.data_vencimento,
      pago_por: expense.pago_por,
      numero_nf: isSemNota ? '' : (expense.numero_nf ?? ''),
      nf_option: isSemNota ? 'sem_nota' : 'com_nota',
    })
    setXmlFile(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.imovel_id || !form.descricao || !form.valor || !form.data_vencimento) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    setSaving(true)

    const nfNumber = form.nf_option === 'sem_nota' ? 'SEM NOTA' : (form.numero_nf || null)

    const payload: Record<string, unknown> = {
      imovel_id: form.imovel_id,
      categoria: form.categoria,
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      data_vencimento: form.data_vencimento,
      pago_por: form.pago_por,
      numero_nf: nfNumber,
    }

    if (editingExpense) {
      // Upload XML if provided
      if (xmlFile) {
        setUploadingXml(true)
        const xmlUrl = await uploadXml(xmlFile, editingExpense.id)
        setUploadingXml(false)
        if (xmlUrl) payload.xml_nf_url = xmlUrl
      }

      const { error } = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', editingExpense.id)
      if (error) {
        toast.error('Erro ao atualizar despesa')
        console.error(error)
      } else {
        toast.success('Despesa atualizada com sucesso')
        setDialogOpen(false)
        fetchData()
      }
    } else {
      const insertPayload = { ...payload, pago: false }
      const { data: inserted, error } = await supabase
        .from('expenses')
        .insert(insertPayload)
        .select()
        .single()
      if (error) {
        toast.error('Erro ao criar despesa')
        console.error(error)
      } else {
        // Upload XML after insert (we need the ID)
        if (xmlFile && inserted) {
          setUploadingXml(true)
          const xmlUrl = await uploadXml(xmlFile, inserted.id)
          setUploadingXml(false)
          if (xmlUrl) {
            await supabase.from('expenses').update({ xml_nf_url: xmlUrl }).eq('id', inserted.id)
          }
        }
        toast.success('Despesa criada com sucesso')
        setDialogOpen(false)
        fetchData()
      }
    }

    setSaving(false)
  }

  // ------ Toggle paid ------

  async function togglePago(expense: Expense) {
    const nowStr = format(new Date(), 'yyyy-MM-dd')
    const { error } = await supabase
      .from('expenses')
      .update({
        pago: !expense.pago,
        data_pagamento: !expense.pago ? nowStr : null,
      })
      .eq('id', expense.id)

    if (error) {
      toast.error('Erro ao atualizar status')
      console.error(error)
    } else {
      toast.success(expense.pago ? 'Despesa marcada como pendente' : 'Despesa marcada como paga')
      fetchData()
    }
  }

  // ------ Delete ------

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    const { error } = await supabase.from('expenses').delete().eq('id', deleteId)
    if (error) {
      toast.error('Erro ao excluir despesa')
      console.error(error)
    } else {
      toast.success('Despesa excluída com sucesso')
      fetchData()
    }
    setDeleteId(null)
    setDeleting(false)
  }

  // ------ NF display helper ------
  function NfBadge({ expense }: { expense: Expense }) {
    if (expense.numero_nf === 'SEM NOTA') {
      return (
        <Badge variant="secondary" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
          Sem nota
        </Badge>
      )
    }
    if (expense.numero_nf) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{expense.numero_nf}</span>
          {expense.xml_nf_url && (
            <a
              href={expense.xml_nf_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-indigo-600 hover:text-indigo-500"
              title="Baixar XML"
            >
              <FileText className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )
    }
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const mesLabel = mesFilter === 'todos'
    ? 'Todos os períodos'
    : monthOptions.find(m => m.value === mesFilter)?.label ?? mesFilter

  // ------ Render ------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground capitalize">
            Controle de receitas e despesas — {mesLabel}
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nova Despesa
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg bg-emerald-100 p-3 dark:bg-emerald-900/30">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Receita Mensal</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(totalReceitas)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg bg-red-100 p-3 dark:bg-red-900/30">
              <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Despesas do Mês</p>
              <p className="text-xl font-bold text-red-600 dark:text-red-400">
                {formatCurrency(totalDespesas)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className={`rounded-lg p-3 ${saldo >= 0 ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-orange-100 dark:bg-orange-900/30'}`}>
              <DollarSign className={`h-5 w-5 ${saldo >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo</p>
              <p className={`text-xl font-bold ${saldo >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-orange-600 dark:text-orange-400'}`}>
                {formatCurrency(saldo)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 pt-6">
            <div className="rounded-lg bg-yellow-100 p-3 dark:bg-yellow-900/30">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Contas Vencidas</p>
              <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                {contasVencidas}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
            <Select value={mesFilter} onValueChange={(v) => setMesFilter(v ?? currentMonth)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os períodos</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
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
                    {p.endereco}, {p.numero}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoriaFilter} onValueChange={(v) => setCategoriaFilter(v ?? 'todos')}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as categorias</SelectItem>
                {(Object.keys(CATEGORY_CONFIG) as ExpenseCategory[]).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_CONFIG[cat].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'todos')}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <DollarSign className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="mt-4 text-lg font-medium">Nenhuma despesa encontrada</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {expenses.length === 0
                ? 'Cadastre a primeira despesa para começar.'
                : 'Tente ajustar os filtros de busca.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Imóvel</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>NF</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pago por</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((expense) => {
                    const status = getExpenseStatus(expense)
                    const statusConf = STATUS_CONFIG[status]
                    const catConf = CATEGORY_CONFIG[expense.categoria]
                    return (
                      <TableRow key={expense.id}>
                        <TableCell>
                          <span className="font-medium">
                            {expense.imovel?.endereco ?? '-'}, {expense.imovel?.numero ?? ''}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={catConf.className}>
                            {catConf.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {expense.descricao}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(expense.valor)}
                        </TableCell>
                        <TableCell>{formatDate(expense.data_vencimento)}</TableCell>
                        <TableCell>
                          <NfBadge expense={expense} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusConf.className}>
                            {statusConf.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{PAYER_LABELS[expense.pago_por]}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => togglePago(expense)}
                              title={expense.pago ? 'Marcar como pendente' : 'Marcar como pago'}
                            >
                              <Check className={`h-4 w-4 ${expense.pago ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openEdit(expense)}
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleteId(expense.id)}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
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
          <div className="grid gap-3 lg:hidden">
            {filtered.map((expense) => {
              const status = getExpenseStatus(expense)
              const statusConf = STATUS_CONFIG[status]
              const catConf = CATEGORY_CONFIG[expense.categoria]
              return (
                <Card key={expense.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm">
                        {expense.imovel?.endereco ?? '-'}, {expense.imovel?.numero ?? ''}
                      </CardTitle>
                      <Badge variant="secondary" className={statusConf.className}>
                        {statusConf.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Categoria</span>
                        <Badge variant="secondary" className={catConf.className}>
                          {catConf.label}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Descrição</span>
                        <span className="text-right max-w-[60%] truncate">{expense.descricao}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Valor</span>
                        <span className="font-medium">{formatCurrency(expense.valor)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Vencimento</span>
                        <span>{formatDate(expense.data_vencimento)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Nota Fiscal</span>
                        <NfBadge expense={expense} />
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Pago por</span>
                        <span>{PAYER_LABELS[expense.pago_por]}</span>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-1 border-t pt-3">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => togglePago(expense)}
                        title={expense.pago ? 'Marcar como pendente' : 'Marcar como pago'}
                      >
                        <Check className={`h-4 w-4 ${expense.pago ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(expense)} title="Editar">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(expense.id)} title="Excluir">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {!loading && expenses.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Exibindo {filtered.length} de {expenses.length} despesas
        </p>
      )}

      {/* Charts */}
      {!loading && expenses.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Bar chart - despesas por mes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Despesas por Mês</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis
                      fontSize={12}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) =>
                        new Intl.NumberFormat('pt-BR', {
                          notation: 'compact',
                          compactDisplay: 'short',
                          currency: 'BRL',
                          style: 'currency',
                        }).format(v)
                      }
                    />
                    <Tooltip
                      formatter={(value) => [formatCurrency(Number(value)), 'Despesas']}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--border))',
                        backgroundColor: 'hsl(var(--popover))',
                        color: 'hsl(var(--popover-foreground))',
                      }}
                    />
                    <Bar dataKey="valor" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Pie chart - despesas por categoria */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Despesas por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="name"
                      label={(props: any) =>
                        `${props.name || ''} ${((props.percent || 0) * 100).toFixed(0)}%`
                      }
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [formatCurrency(Number(value)), 'Valor']}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--border))',
                        backgroundColor: 'hsl(var(--popover))',
                        color: 'hsl(var(--popover-foreground))',
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Nova / Editar Despesa Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Imovel */}
            <div className="grid gap-2">
              <Label htmlFor="imovel_id">Imóvel *</Label>
              <Select value={form.imovel_id} onValueChange={(v) => setForm({ ...form, imovel_id: v ?? '' })}>
                <SelectTrigger id="imovel_id">
                  <SelectValue placeholder="Selecione o imóvel" />
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

            {/* Categoria */}
            <div className="grid gap-2">
              <Label htmlFor="categoria">Categoria *</Label>
              <Select
                value={form.categoria}
                onValueChange={(v) => setForm({ ...form, categoria: v as ExpenseCategory })}
              >
                <SelectTrigger id="categoria">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_CONFIG) as ExpenseCategory[]).map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_CONFIG[cat].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Descricao */}
            <div className="grid gap-2">
              <Label htmlFor="descricao">Descrição *</Label>
              <Input
                id="descricao"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Ex: IPTU parcela 3/12"
              />
            </div>

            {/* Valor */}
            <div className="grid gap-2">
              <Label htmlFor="valor">Valor (R$) *</Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                min="0"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                placeholder="0,00"
              />
            </div>

            {/* Data vencimento */}
            <div className="grid gap-2">
              <Label htmlFor="data_vencimento">Data de Vencimento *</Label>
              <Input
                id="data_vencimento"
                type="date"
                value={form.data_vencimento}
                onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
              />
            </div>

            {/* Pago por */}
            <div className="grid gap-2">
              <Label htmlFor="pago_por">Pago por *</Label>
              <Select
                value={form.pago_por}
                onValueChange={(v) => setForm({ ...form, pago_por: v as ExpensePayer })}
              >
                <SelectTrigger id="pago_por">
                  <SelectValue placeholder="Quem paga" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa">Empresa</SelectItem>
                  <SelectItem value="inquilino">Inquilino</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Separator */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">Nota Fiscal</p>

              {/* NF Option */}
              <div className="grid gap-3">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="nf_option"
                      checked={form.nf_option === 'com_nota'}
                      onChange={() => setForm({ ...form, nf_option: 'com_nota' })}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm">Com nota</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="nf_option"
                      checked={form.nf_option === 'sem_nota'}
                      onChange={() => setForm({ ...form, nf_option: 'sem_nota', numero_nf: '' })}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm">Sem nota</span>
                  </label>
                </div>

                {form.nf_option === 'com_nota' && (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="numero_nf">Número da NF</Label>
                      <Input
                        id="numero_nf"
                        value={form.numero_nf}
                        onChange={(e) => setForm({ ...form, numero_nf: e.target.value })}
                        placeholder="Ex: 001234"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="xml_nf">XML da NF</Label>
                      <div className="flex items-center gap-2">
                        <label className="flex-1 flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors">
                          <Upload className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground truncate">
                            {xmlFile ? xmlFile.name : (editingExpense?.xml_nf_url ? 'XML já anexado (substituir)' : 'Selecionar arquivo XML')}
                          </span>
                          <input
                            id="xml_nf"
                            type="file"
                            accept=".xml"
                            className="hidden"
                            onChange={(e) => setXmlFile(e.target.files?.[0] ?? null)}
                          />
                        </label>
                        {xmlFile && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setXmlFile(null)}
                            type="button"
                          >
                            Remover
                          </Button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
            <Button onClick={handleSave} disabled={saving || uploadingXml}>
              {(saving || uploadingXml) && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingExpense ? 'Salvar' : 'Criar Despesa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Despesa</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja excluir esta despesa? Essa ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
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
  )
}
