'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { FileText, DollarSign, Download, Building2, Calendar, Shield } from 'lucide-react'
import type { Contract, Boleto, Invoice } from '@/types/database'

export default function InquilinoPage() {
  const { profile } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [boletos, setBoletos] = useState<Boleto[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) loadData()
  }, [profile])

  async function loadData() {
    try {
      const { data: contractsData } = await supabase
        .from('contracts')
        .select('*, imovel:properties(*)')
        .eq('inquilino_id', profile!.id)
        .order('created_at', { ascending: false })

      setContracts(contractsData || [])
      const contractIds = (contractsData || []).map(c => c.id)

      if (contractIds.length > 0) {
        const [{ data: boletosData }, { data: invoicesData }] = await Promise.all([
          supabase.from('boletos').select('*, contrato:contracts(*, imovel:properties(*))').in('contrato_id', contractIds).order('data_vencimento', { ascending: false }),
          supabase.from('invoices').select('*, contrato:contracts(*, imovel:properties(*))').in('contrato_id', contractIds).order('data_emissao', { ascending: false }),
        ])
        setBoletos(boletosData || [])
        setInvoices(invoicesData || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
  const garantiaLabel: Record<string, string> = { caucao: 'Caução', fiador: 'Fiador', seguro_fianca: 'Seguro Fiança' }

  const statusBadge = (status: string, vencimento: string) => {
    const isOverdue = status === 'pendente' && new Date(vencimento) < new Date()
    if (status === 'pago') return <Badge className="bg-green-100 text-green-800">Pago</Badge>
    if (isOverdue || status === 'vencido') return <Badge className="bg-red-100 text-red-800">Vencido</Badge>
    if (status === 'pendente') return <Badge className="bg-yellow-100 text-yellow-800">Pendente</Badge>
    return <Badge className="bg-gray-100 text-gray-800">{status}</Badge>
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-24 bg-gray-100 rounded-lg animate-pulse" />
        <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    )
  }

  const activeContract = contracts.find(c => c.ativo)

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Welcome */}
      <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
        <CardContent className="p-6">
          <h1 className="text-2xl font-bold">Olá, {profile?.nome}!</h1>
          <p className="text-blue-100 mt-1">Bem-vindo ao portal do inquilino — EXATA Negócios Imobiliários</p>
        </CardContent>
      </Card>

      {/* Active Contract */}
      {activeContract && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Meu Contrato
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Imóvel</p>
                <p className="font-medium">{(activeContract.imovel as any)?.endereco}, {(activeContract.imovel as any)?.numero}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Valor do Aluguel</p>
                <p className="font-medium text-green-600">{formatBRL(activeContract.valor_aluguel)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Vigência</p>
                <p className="font-medium flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {formatDate(activeContract.data_inicio)} a {formatDate(activeContract.data_fim)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Garantia</p>
                <p className="font-medium flex items-center gap-1">
                  <Shield className="h-4 w-4" />
                  {garantiaLabel[activeContract.tipo_garantia] || activeContract.tipo_garantia}
                </p>
              </div>
            </div>
            {activeContract.arquivo_url && (
              <a href={activeContract.arquivo_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="mt-4">
                  <Download className="h-4 w-4 mr-1" /> Baixar Contrato PDF
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* Boletos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5" /> Meus Boletos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {boletos.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nenhum boleto encontrado.</p>
          ) : (
            <div className="space-y-3">
              {boletos.map(boleto => {
                const isOverdue = boleto.status === 'pendente' && new Date(boleto.data_vencimento) < new Date()
                return (
                  <div
                    key={boleto.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${isOverdue ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Ref: {boleto.referencia_mes}</span>
                        {statusBadge(boleto.status, boleto.data_vencimento)}
                      </div>
                      <div className="flex gap-4 mt-1 text-sm text-gray-500">
                        <span>Valor: {formatBRL(boleto.valor)}</span>
                        <span>Vencimento: {formatDate(boleto.data_vencimento)}</span>
                      </div>
                    </div>
                    {boleto.url_pdf && (
                      <a href={boleto.url_pdf} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-1" /> PDF
                        </Button>
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notas Fiscais */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" /> Minhas Notas Fiscais
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nenhuma nota fiscal encontrada.</p>
          ) : (
            <div className="space-y-3">
              {invoices.map(nf => (
                <div key={nf.id} className="flex items-center justify-between p-4 rounded-lg border border-gray-200">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">NF {nf.numero_nf}</span>
                      <Badge variant="secondary">{nf.referencia_mes}</Badge>
                    </div>
                    <div className="flex gap-4 mt-1 text-sm text-gray-500">
                      <span>Valor: {formatBRL(nf.valor)}</span>
                      <span>Emissão: {formatDate(nf.data_emissao)}</span>
                    </div>
                  </div>
                  <a href={nf.arquivo_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-1" /> PDF
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
