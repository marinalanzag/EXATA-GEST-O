'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Building2, DollarSign, TrendingUp, TrendingDown, Users,
  FileText, Camera, Calendar, ArrowRight, Eye
} from 'lucide-react'
import type { Property, Contract, Expense, Boleto, Invoice } from '@/types/database'

interface PropertyWithDetails extends Property {
  contracts: Contract[]
  expenses: Expense[]
  boletos: Boleto[]
  invoices: Invoice[]
}

export default function ProprietarioPage() {
  const { profile } = useAuth()
  const [properties, setProperties] = useState<PropertyWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)

  useEffect(() => {
    if (profile) loadData()
  }, [profile])

  async function loadData() {
    try {
      const { data: props } = await supabase
        .from('properties')
        .select('*')
        .eq('proprietario_id', profile!.id)
        .order('endereco')

      if (!props || props.length === 0) {
        setLoading(false)
        return
      }

      const propIds = props.map(p => p.id)

      const [
        { data: contracts },
        { data: expenses },
      ] = await Promise.all([
        supabase.from('contracts').select('*, inquilino:profiles(*)').in('imovel_id', propIds).order('created_at', { ascending: false }),
        supabase.from('expenses').select('*').in('imovel_id', propIds).order('data_vencimento', { ascending: false }),
      ])

      const contractIds = (contracts || []).map(c => c.id)
      let boletos: Boleto[] = []
      let invoices: Invoice[] = []

      if (contractIds.length > 0) {
        const [{ data: b }, { data: inv }] = await Promise.all([
          supabase.from('boletos').select('*').in('contrato_id', contractIds).order('data_vencimento', { ascending: false }),
          supabase.from('invoices').select('*').in('contrato_id', contractIds).order('data_emissao', { ascending: false }),
        ])
        boletos = b || []
        invoices = inv || []
      }

      const enriched: PropertyWithDetails[] = props.map(p => {
        const propContracts = (contracts || []).filter(c => c.imovel_id === p.id)
        const propContractIds = propContracts.map(c => c.id)
        return {
          ...p,
          contracts: propContracts,
          expenses: (expenses || []).filter(e => e.imovel_id === p.id),
          boletos: boletos.filter(b => propContractIds.includes(b.contrato_id)),
          invoices: invoices.filter(inv => propContractIds.includes(inv.contrato_id)),
        }
      })

      setProperties(enriched)
      if (enriched.length > 0) setSelectedProperty(enriched[0].id)
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      disponivel: 'bg-green-100 text-green-800',
      locado: 'bg-blue-100 text-blue-800',
      manutencao: 'bg-yellow-100 text-yellow-800',
    }
    const labels: Record<string, string> = { disponivel: 'Disponível', locado: 'Locado', manutencao: 'Manutenção' }
    return <Badge className={map[s] || ''}>{labels[s] || s}</Badge>
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      </div>
    )
  }

  const totalReceita = properties.reduce((sum, p) => {
    const active = p.contracts.find(c => c.ativo)
    return sum + (active ? Number(active.valor_aluguel) : 0)
  }, 0)

  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const totalDespesas = properties.reduce((sum, p) => {
    return sum + p.expenses.filter(e => e.data_vencimento?.startsWith(currentMonth)).reduce((s, e) => s + Number(e.valor), 0)
  }, 0)

  const selected = properties.find(p => p.id === selectedProperty)

  return (
    <div className="p-6 space-y-6">
      {/* Welcome */}
      <Card className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <CardContent className="p-6">
          <h1 className="text-2xl font-bold">Olá, {profile?.nome}!</h1>
          <p className="text-indigo-100 mt-1">Visão geral dos seus imóveis — EXATA Negócios Imobiliários</p>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Imóveis</p>
                <p className="text-2xl font-bold">{properties.length}</p>
              </div>
              <Building2 className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Locados</p>
                <p className="text-2xl font-bold">{properties.filter(p => p.status === 'locado').length}</p>
              </div>
              <Users className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Receita Mensal</p>
                <p className="text-2xl font-bold text-green-600">{formatBRL(totalReceita)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Despesas do Mês</p>
                <p className="text-2xl font-bold text-red-600">{formatBRL(totalDespesas)}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Properties */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Meus Imóveis</h2>
          {properties.map(prop => {
            const active = prop.contracts.find(c => c.ativo)
            return (
              <Card
                key={prop.id}
                className={`cursor-pointer transition-all hover:shadow-md ${selectedProperty === prop.id ? 'ring-2 ring-blue-500' : ''}`}
                onClick={() => setSelectedProperty(prop.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{prop.endereco}, {prop.numero}</p>
                      <p className="text-sm text-gray-500">{prop.bairro} - {prop.cidade}</p>
                    </div>
                    {statusBadge(prop.status)}
                  </div>
                  {active && (
                    <div className="mt-2 text-sm">
                      <span className="text-gray-500">Inquilino: </span>
                      <span className="font-medium">{(active.inquilino as any)?.nome}</span>
                      <span className="text-gray-500 ml-3">Aluguel: </span>
                      <span className="font-medium text-green-600">{formatBRL(active.valor_aluguel)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Property Details */}
        <div className="lg:col-span-2">
          {selected ? (
            <Card>
              <CardHeader>
                <CardTitle>{selected.endereco}, {selected.numero}</CardTitle>
                <CardDescription>{selected.bairro} - {selected.cidade}/{selected.estado}</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="contrato">
                  <TabsList className="mb-4">
                    <TabsTrigger value="contrato">Contrato</TabsTrigger>
                    <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
                    <TabsTrigger value="boletos">Boletos</TabsTrigger>
                    <TabsTrigger value="nfs">Notas Fiscais</TabsTrigger>
                  </TabsList>

                  <TabsContent value="contrato">
                    {selected.contracts.filter(c => c.ativo).map(contract => (
                      <div key={contract.id} className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-gray-500">Inquilino</p>
                            <p className="font-medium">{(contract.inquilino as any)?.nome}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Valor</p>
                            <p className="font-medium text-green-600">{formatBRL(contract.valor_aluguel)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Vigência</p>
                            <p className="font-medium">{formatDate(contract.data_inicio)} a {formatDate(contract.data_fim)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Garantia</p>
                            <p className="font-medium">{contract.tipo_garantia}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {selected.contracts.filter(c => c.ativo).length === 0 && (
                      <p className="text-gray-500 text-center py-4">Nenhum contrato ativo.</p>
                    )}
                  </TabsContent>

                  <TabsContent value="financeiro">
                    <div className="space-y-2">
                      {selected.expenses.slice(0, 10).map(exp => (
                        <div key={exp.id} className="flex items-center justify-between p-3 rounded border">
                          <div>
                            <p className="font-medium">{exp.descricao}</p>
                            <p className="text-sm text-gray-500">{exp.categoria} • Venc: {formatDate(exp.data_vencimento)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatBRL(exp.valor)}</p>
                            <Badge className={exp.pago ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                              {exp.pago ? 'Pago' : 'Pendente'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {selected.expenses.length === 0 && <p className="text-gray-500 text-center py-4">Nenhuma despesa registrada.</p>}
                    </div>
                  </TabsContent>

                  <TabsContent value="boletos">
                    <div className="space-y-2">
                      {selected.boletos.slice(0, 10).map(bol => (
                        <div key={bol.id} className="flex items-center justify-between p-3 rounded border">
                          <div>
                            <p className="font-medium">Ref: {bol.referencia_mes}</p>
                            <p className="text-sm text-gray-500">Venc: {formatDate(bol.data_vencimento)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{formatBRL(bol.valor)}</p>
                            <Badge className={
                              bol.status === 'pago' ? 'bg-green-100 text-green-800' :
                              bol.status === 'vencido' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }>
                              {bol.status === 'pago' ? 'Pago' : bol.status === 'vencido' ? 'Vencido' : 'Pendente'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {selected.boletos.length === 0 && <p className="text-gray-500 text-center py-4">Nenhum boleto encontrado.</p>}
                    </div>
                  </TabsContent>

                  <TabsContent value="nfs">
                    <div className="space-y-2">
                      {selected.invoices.slice(0, 10).map(nf => (
                        <div key={nf.id} className="flex items-center justify-between p-3 rounded border">
                          <div>
                            <p className="font-medium">NF {nf.numero_nf}</p>
                            <p className="text-sm text-gray-500">Ref: {nf.referencia_mes} • Emissão: {formatDate(nf.data_emissao)}</p>
                          </div>
                          <p className="font-medium">{formatBRL(nf.valor)}</p>
                        </div>
                      ))}
                      {selected.invoices.length === 0 && <p className="text-gray-500 text-center py-4">Nenhuma NF encontrada.</p>}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                Selecione um imóvel para ver os detalhes.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
