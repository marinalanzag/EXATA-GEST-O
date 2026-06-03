'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Search, Building2, Loader2 } from 'lucide-react'
import { PropertyForm } from '@/components/forms/property-form'
import { nomeImovel } from '@/lib/utils'
import type { Property, PropertyStatus, Profile } from '@/types/database'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const STATUS_CONFIG: Record<PropertyStatus, { label: string; className: string }> = {
  disponivel: { label: 'Disponível', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  locado: { label: 'Locado', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  manutencao: { label: 'Manutenção', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
}

interface PropertyWithRent extends Property {
  valor_aluguel?: number | null
}

export default function ImoveisPage() {
  const router = useRouter()
  const [properties, setProperties] = useState<PropertyWithRent[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('todos')
  const [proprietarioFilter, setProprietarioFilter] = useState<string>('todos')
  const [proprietarios, setProprietarios] = useState<Profile[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchProperties = useCallback(async () => {
    setLoading(true)

    // Fetch properties with proprietario
    const { data: propsData, error: propsError } = await supabase
      .from('properties')
      .select('*, proprietario:profiles!proprietario_id(*)')
      .order('endereco')

    if (propsError) {
      console.error('Erro ao buscar imoveis:', propsError)
      setLoading(false)
      return
    }

    // Fetch active contracts to get rental values
    const { data: contractsData } = await supabase
      .from('contracts')
      .select('imovel_id, valor_aluguel')
      .eq('ativo', true)

    const rentMap = new Map<string, number>()
    if (contractsData) {
      for (const c of contractsData) {
        rentMap.set(c.imovel_id, c.valor_aluguel)
      }
    }

    const propertiesWithRent: PropertyWithRent[] = (propsData ?? []).map((p) => ({
      ...p,
      valor_aluguel: rentMap.get(p.id) ?? null,
    })) as PropertyWithRent[]

    setProperties(propertiesWithRent)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchProperties()
  }, [fetchProperties])

  useEffect(() => {
    async function fetchProprietarios() {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'proprietario')
        .order('nome')
      setProprietarios((data ?? []) as Profile[])
    }
    fetchProprietarios()
  }, [])

  const filtered = properties.filter((p) => {
    const matchSearch =
      !searchTerm ||
      p.endereco.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.bairro.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.numero.toLowerCase().includes(searchTerm.toLowerCase())

    const matchStatus = statusFilter === 'todos' || p.status === statusFilter
    const matchProprietario =
      proprietarioFilter === 'todos' || p.proprietario_id === proprietarioFilter

    return matchSearch && matchStatus && matchProprietario
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Imóveis</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie todos os imóveis cadastrados
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="h-4 w-4" />
                Novo Imóvel
              </Button>
            }
          />
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Cadastrar Novo Imóvel</DialogTitle>
            </DialogHeader>
            <PropertyForm
              onSuccess={() => {
                setDialogOpen(false)
                fetchProperties()
              }}
              onCancel={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por endereco, bairro..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'todos')}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="disponivel">Disponível</SelectItem>
                <SelectItem value="locado">Locado</SelectItem>
                <SelectItem value="manutencao">Manutenção</SelectItem>
              </SelectContent>
            </Select>
            <Select value={proprietarioFilter} onValueChange={(v) => setProprietarioFilter(v ?? 'todos')}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Proprietário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os proprietários</SelectItem>
                {proprietarios.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Properties table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="mt-4 text-lg font-medium">Nenhum imóvel encontrado</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {properties.length === 0
                ? 'Cadastre o primeiro imóvel para começar.'
                : 'Tente ajustar os filtros de busca.'}
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
                    <TableHead>Endereço</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Proprietário</TableHead>
                    <TableHead className="text-right">Valor Aluguel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((property) => {
                    const statusConf = STATUS_CONFIG[property.status]
                    return (
                      <TableRow
                        key={property.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/imoveis/${property.id}`)}
                      >
                        <TableCell>
                          <div>
                            <span className="font-medium">
                              {nomeImovel(property)}
                            </span>
                            {property.complemento && (
                              <span className="text-muted-foreground"> - {property.complemento}</span>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {property.bairro} - {property.cidade}/{property.estado}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{property.tipo}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusConf.className}>
                            {statusConf.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {property.proprietario?.nome ?? '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {property.valor_aluguel
                            ? formatCurrency(property.valor_aluguel)
                            : '-'}
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
            {filtered.map((property) => {
              const statusConf = STATUS_CONFIG[property.status]
              return (
                <Card
                  key={property.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => router.push(`/imoveis/${property.id}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm">
                        {nomeImovel(property)}
                      </CardTitle>
                      <Badge variant="secondary" className={statusConf.className}>
                        {statusConf.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {property.bairro} | {property.tipo}
                      </span>
                      <span className="font-medium">
                        {property.valor_aluguel
                          ? formatCurrency(property.valor_aluguel)
                          : '-'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Proprietário: {property.proprietario?.nome ?? '-'}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Summary */}
      {!loading && properties.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Exibindo {filtered.length} de {properties.length} imoveis
        </p>
      )}
    </div>
  )
}
