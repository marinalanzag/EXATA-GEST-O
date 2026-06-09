'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Building2, DollarSign, Receipt, AlertTriangle,
  TrendingUp, TrendingDown, Users, Calendar, ArrowRight,
  Plus, Bell, BarChart3, Eye, ChevronLeft, ChevronRight
} from 'lucide-react'
import { format, subMonths, differenceInMonths, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

interface PropertyRow {
  id: string
  complemento: string
  endereco: string
  numero: string
  bairro: string
  status: string
  inquilino_nome: string
  valor_aluguel: number
  data_fim: string
  dias_restantes: number
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  // Stats
  const [totalImoveis, setTotalImoveis] = useState(0)
  const [imoveisLocados, setImoveisLocados] = useState(0)
  const [projecaoFaturamento, setProjecaoFaturamento] = useState(0)
  const [receitaEfetiva, setReceitaEfetiva] = useState(0)
  const [despesasMes, setDespesasMes] = useState(0)
  const [boletosPendentes, setBoletosPendentes] = useState(0)
  const [contratosVencendo, setContratosVencendo] = useState(0)

  // Data
  const [propertyRows, setPropertyRows] = useState<PropertyRow[]>([])
  const [alertas, setAlertas] = useState<{ mensagem: string; link: string; cor: string }[]>([])
  const [monthlyData, setMonthlyData] = useState<{ mes: string; projecao: number; receita: number; despesa: number }[]>([])

  const now = new Date()

  // Mês selecionado (padrão: mês corrente)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // Gerar opções de meses (mês que vem + 12 meses para trás)
  const monthOptions = (() => {
    const opts: { value: string; label: string }[] = []
    for (let i = -1; i < 12; i++) {
      const d = subMonths(now, i)
      const value = format(d, 'yyyy-MM')
      const label = format(d, 'MMMM yyyy', { locale: ptBR })
      opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
    }
    return opts
  })()

  const currentMonthKey = selectedMonth
  const mesAtual = monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth

  // Dados brutos (carrega uma vez)
  const [rawData, setRawData] = useState<{
    properties: any[]
    contracts: any[]
    expenses: any[]
    boletos: any[]
  } | null>(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  // Recalcular ao mudar mês selecionado
  useEffect(() => {
    if (rawData) {
      computeStats(rawData.properties, rawData.contracts, rawData.expenses, rawData.boletos)
    }
  }, [selectedMonth, rawData])

  async function loadDashboard() {
    try {
      const [
        { data: properties },
        { data: contracts },
        { data: expenses },
        { data: boletos },
      ] = await Promise.all([
        supabase.from('properties').select('*'),
        supabase.from('contracts').select('*, imovel:properties(*), inquilino:profiles(*)'),
        supabase.from('expenses').select('*'),
        supabase.from('boletos').select('*, contrato:contracts(*, imovel:properties(*))'),
      ])

      setRawData({
        properties: properties || [],
        contracts: contracts || [],
        expenses: expenses || [],
        boletos: boletos || [],
      })

      computeStats(properties || [], contracts || [], expenses || [], boletos || [])
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  function computeStats(properties: any[], contracts: any[], expenses: any[], boletos: any[]) {
    const total = properties.length
    const locados = properties.filter(p => p.status === 'locado').length
    setTotalImoveis(total)
    setImoveisLocados(locados)

    // Active contracts
    const activeContracts = contracts.filter(c => c.ativo)

    // Projeção de faturamento = soma dos boletos emitidos no mês selecionado
    const boletosDoMes = boletos.filter(b => b.referencia_mes === currentMonthKey || b.data_vencimento?.startsWith(currentMonthKey))
    const projecao = boletosDoMes.reduce((sum: number, b: any) => sum + Number(b.valor), 0)
    // Se não tem boletos emitidos, usar soma dos contratos ativos como projeção
    setProjecaoFaturamento(projecao > 0 ? projecao : activeContracts.reduce((sum: number, c: any) => sum + Number(c.valor_aluguel), 0))

    // Receita efetiva = boletos pagos no mês selecionado
    const boletosPagosMes = boletosDoMes.filter((b: any) => b.status === 'pago')
    setReceitaEfetiva(boletosPagosMes.reduce((sum: number, b: any) => sum + Number(b.valor), 0))

    // Despesas do mês selecionado
    const monthExpenses = expenses.filter(e => e.data_vencimento?.startsWith(currentMonthKey))
    setDespesasMes(monthExpenses.reduce((sum: number, e: any) => sum + Number(e.valor), 0))

    // Boletos pendentes (geral, não por mês)
    const pendentes = boletos.filter((b: any) => b.status === 'pendente').length
    setBoletosPendentes(pendentes)

    // Contratos vencendo em 60 dias
    const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    const vencendo = activeContracts.filter((c: any) => new Date(c.data_fim) <= in60Days).length
    setContratosVencendo(vencendo)

    // Property rows
    const rows: PropertyRow[] = properties.map(p => {
      const contract = activeContracts.find((c: any) => c.imovel_id === p.id)
      const inquilino = contract?.inquilino as any
      const dataFim = contract?.data_fim || ''
      const diasRestantes = dataFim ? Math.ceil((new Date(dataFim).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : -1

      return {
        id: p.id,
        complemento: p.complemento || '',
        endereco: p.endereco,
        numero: p.numero,
        bairro: p.bairro,
        status: p.status,
        inquilino_nome: inquilino?.nome || '—',
        valor_aluguel: contract ? Number(contract.valor_aluguel) : 0,
        data_fim: dataFim,
        dias_restantes: diasRestantes,
      }
    }).sort((a, b) => {
      if (a.status === 'locado' && b.status !== 'locado') return -1
      if (a.status !== 'locado' && b.status === 'locado') return 1
      return a.dias_restantes - b.dias_restantes
    })
    setPropertyRows(rows)

    // Alertas
    const alerts: typeof alertas = []
    const vencidos = boletos.filter((b: any) => b.status === 'vencido' || (b.status === 'pendente' && new Date(b.data_vencimento) < now)).length
    if (vencidos > 0) alerts.push({ mensagem: `${vencidos} boleto(s) vencido(s)`, link: '/boletos', cor: 'bg-red-50 border-red-200 text-red-800' })
    if (vencendo > 0) alerts.push({ mensagem: `${vencendo} contrato(s) vencendo em 60 dias`, link: '/contratos', cor: 'bg-yellow-50 border-yellow-200 text-yellow-800' })
    const contasVencer = monthExpenses.filter((e: any) => !e.pago && new Date(e.data_vencimento) >= now && new Date(e.data_vencimento) <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)).length
    if (contasVencer > 0) alerts.push({ mensagem: `${contasVencer} conta(s) a vencer esta semana`, link: '/financeiro', cor: 'bg-orange-50 border-orange-200 text-orange-800' })

    // Contratos com 12+ meses que podem precisar de reajuste IGPM/IPCA
    // Alerta quando o aniversário do contrato cai no mês selecionado
    const contratosReajuste = activeContracts.filter((c: any) => {
      const meses = differenceInMonths(now, parseISO(c.data_inicio))
      if (meses < 12) return false
      // Verificar se o mês/dia de início coincide com o mês selecionado (aniversário)
      const inicio = parseISO(c.data_inicio)
      const mesInicio = inicio.getMonth() + 1
      const [, selMon] = currentMonthKey.split('-').map(Number)
      return mesInicio === selMon
    })
    if (contratosReajuste.length > 0) {
      alerts.push({
        mensagem: `${contratosReajuste.length} contrato(s) completando aniversário — verificar reajuste IGPM/IPCA`,
        link: '/contratos',
        cor: 'bg-amber-50 border-amber-200 text-amber-800',
      })
    }

    setAlertas(alerts)

    // Chart - 6 meses centrados no mês selecionado (3 antes, selecionado, 2 depois)
    const [selYear, selMon] = currentMonthKey.split('-').map(Number)
    const months: typeof monthlyData = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(selYear, selMon - 1 - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const mesLabel = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
      const mesBoletos = boletos.filter((b: any) => b.referencia_mes === key || b.data_vencimento?.startsWith(key))
      const mesProjecao = mesBoletos.reduce((sum: number, b: any) => sum + Number(b.valor), 0) || activeContracts.reduce((sum: number, c: any) => sum + Number(c.valor_aluguel), 0)
      const mesReceita = mesBoletos.filter((b: any) => b.status === 'pago').reduce((sum: number, b: any) => sum + Number(b.valor), 0)
      const mesExp = expenses.filter((e: any) => e.data_vencimento?.startsWith(key))
      const mesDespesa = mesExp.reduce((sum: number, e: any) => sum + Number(e.valor), 0)
      months.push({ mes: mesLabel, projecao: mesProjecao, receita: mesReceita, despesa: mesDespesa })
    }
    setMonthlyData(months)
  }

  const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  const formatDate = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { disponivel: 'bg-green-100 text-green-800', locado: 'bg-blue-100 text-blue-800', manutencao: 'bg-yellow-100 text-yellow-800', aplicativo: 'bg-purple-100 text-purple-800' }
    const labels: Record<string, string> = { disponivel: 'Disponível', locado: 'Locado', manutencao: 'Manutenção', aplicativo: 'Aplicativo' }
    return <Badge className={map[status] || ''}>{labels[status] || status}</Badge>
  }

  const diasBadge = (dias: number) => {
    if (dias < 0) return null
    if (dias <= 30) return <Badge className="bg-red-100 text-red-800">{dias}d</Badge>
    if (dias <= 90) return <Badge className="bg-yellow-100 text-yellow-800">{dias}d</Badge>
    return <Badge className="bg-gray-100 text-gray-600">{dias}d</Badge>
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      </div>
    )
  }

  const saldo = receitaEfetiva - despesasMes

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => {
                const idx = monthOptions.findIndex(m => m.value === selectedMonth)
                if (idx < monthOptions.length - 1) setSelectedMonth(monthOptions[idx + 1].value)
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={selectedMonth} onValueChange={(v) => v && setSelectedMonth(v)}>
              <SelectTrigger className="w-[180px] h-8 text-sm font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => {
                const idx = monthOptions.findIndex(m => m.value === selectedMonth)
                if (idx > 0) setSelectedMonth(monthOptions[idx - 1].value)
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => router.push('/imoveis')} variant="outline">
            <Plus className="h-4 w-4 mr-1" /> Imóvel
          </Button>
          <Button size="sm" onClick={() => router.push('/contratos/novo')} variant="outline">
            <Plus className="h-4 w-4 mr-1" /> Contrato
          </Button>
          <Button size="sm" onClick={() => router.push('/boletos')}>
            <Receipt className="h-4 w-4 mr-1" /> Gerar Boletos
          </Button>
        </div>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {alertas.map((alerta, i) => (
            <Link key={i} href={alerta.link}>
              <div className={`p-3 rounded-lg border ${alerta.cor} flex items-center justify-between hover:shadow-md transition-shadow cursor-pointer`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium text-sm">{alerta.mensagem}</span>
                </div>
                <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Cards Financeiros do Mês */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Projeção Faturamento</p>
                <p className="text-xl font-bold text-blue-600 mt-1">{formatBRL(projecaoFaturamento)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Boletos emitidos</p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Receita Efetiva</p>
                <p className="text-xl font-bold text-green-600 mt-1">{formatBRL(receitaEfetiva)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Boletos pagos</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Despesas do Mês</p>
                <p className="text-xl font-bold text-red-600 mt-1">{formatBRL(despesasMes)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Saldo do Mês</p>
                <p className={`text-xl font-bold mt-1 ${saldo >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatBRL(saldo)}</p>
                <p className="text-xs text-gray-400 mt-0.5">Receita − Despesas</p>
              </div>
              <DollarSign className={`h-8 w-8 ${saldo >= 0 ? 'text-green-400' : 'text-red-400'}`} />
            </div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md" onClick={() => router.push('/boletos')}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Boletos Pendentes</p>
                <p className="text-xl font-bold text-yellow-600 mt-1">{boletosPendentes}</p>
                <p className="text-xs text-gray-400 mt-0.5">{contratosVencendo} contrato(s) vencendo</p>
              </div>
              <Receipt className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Listagem de Imóveis */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Imóveis — {imoveisLocados}/{totalImoveis} locados
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => router.push('/imoveis')}>
              Ver todos <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Imóvel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Inquilino</TableHead>
                  <TableHead className="text-right">Aluguel</TableHead>
                  <TableHead>Fim Contrato</TableHead>
                  <TableHead className="text-center">Prazo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propertyRows.map(row => (
                  <TableRow key={row.id} className={row.dias_restantes >= 0 && row.dias_restantes <= 30 ? 'bg-red-50/50' : row.dias_restantes > 0 && row.dias_restantes <= 90 ? 'bg-yellow-50/50' : ''}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{row.complemento || `${row.endereco}, ${row.numero}`}</p>
                        {row.complemento && (
                          <p className="text-xs text-gray-500">{row.endereco}, {row.numero}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(row.status)}</TableCell>
                    <TableCell>{row.inquilino_nome}</TableCell>
                    <TableCell className="text-right font-medium">
                      {row.valor_aluguel > 0 ? formatBRL(row.valor_aluguel) : '—'}
                    </TableCell>
                    <TableCell>{formatDate(row.data_fim)}</TableCell>
                    <TableCell className="text-center">{diasBadge(row.dias_restantes)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => router.push(`/imoveis/${row.id}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {propertyRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                      Nenhum imóvel cadastrado. <Link href="/imoveis" className="text-blue-600 underline">Cadastrar primeiro imóvel</Link>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Gráfico Projeção vs Receita vs Despesa */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Projeção vs Receita vs Despesa (6 meses)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value) => formatBRL(Number(value))} />
              <Legend />
              <Bar dataKey="projecao" name="Projeção" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="receita" name="Receita Efetiva" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="despesa" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
