'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
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
} from '@/components/ui/dialog'
import { Plus, Camera, Loader2, Image } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { InspectionForm } from '@/components/forms/inspection-form'
import { nomeImovel } from '@/lib/utils'
import type { Inspection, Property } from '@/types/database'

const formatDate = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return dateStr
  }
}

const TIPO_CONFIG: Record<string, { label: string; className: string }> = {
  entrada: {
    label: 'Entrada',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  },
  saida: {
    label: 'Saida',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  },
}

export default function VistoriasPage() {
  const router = useRouter()
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)
  const [tipoFilter, setTipoFilter] = useState<string>('todos')
  const [imovelFilter, setImovelFilter] = useState<string>('todos')
  const [imoveis, setImoveis] = useState<Property[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const [vistoriasRes, imoveisRes] = await Promise.all([
        supabase
          .from('inspections')
          .select('*, imovel:properties(*, proprietario:profiles!proprietario_id(*)), fotos:inspection_photos(*)')
          .order('data', { ascending: false }),
        supabase.from('properties').select('*').order('endereco'),
      ])

      if (vistoriasRes.error) {
        console.error('Erro ao buscar vistorias:', vistoriasRes.error)
      } else {
        setInspections((vistoriasRes.data ?? []) as Inspection[])
      }

      setImoveis((imoveisRes.data ?? []) as Property[])
      setLoading(false)
    }

    fetchData()
  }, [])

  const filtered = inspections.filter((v) => {
    const matchTipo = tipoFilter === 'todos' || v.tipo === tipoFilter
    const matchImovel = imovelFilter === 'todos' || v.imovel_id === imovelFilter
    return matchTipo && matchImovel
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vistorias</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as vistorias dos imoveis
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Nova Vistoria
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={tipoFilter} onValueChange={(v) => setTipoFilter(v ?? 'todos')}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="entrada">Entrada</SelectItem>
                <SelectItem value="saida">Saida</SelectItem>
              </SelectContent>
            </Select>
            <Select value={imovelFilter} onValueChange={(v) => setImovelFilter(v ?? 'todos')}>
              <SelectTrigger className="w-full sm:w-[250px]">
                <SelectValue placeholder="Imóvel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os imoveis</SelectItem>
                {imoveis.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {nomeImovel(i)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Camera className="h-12 w-12 text-muted-foreground/40" />
            <h3 className="mt-4 text-lg font-medium">Nenhuma vistoria encontrada</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {inspections.length === 0
                ? 'Cadastre a primeira vistoria para comecar.'
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
                    <TableHead>Imovel</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-center">Fotos</TableHead>
                    <TableHead>Observacoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((vistoria) => {
                    const tipoConf = TIPO_CONFIG[vistoria.tipo] ?? TIPO_CONFIG.entrada
                    const fotoCount = vistoria.fotos?.length ?? 0
                    return (
                      <TableRow
                        key={vistoria.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/vistorias/${vistoria.id}`)}
                      >
                        <TableCell>
                          <span className="font-medium">
                            {nomeImovel(vistoria.imovel)}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {vistoria.imovel?.bairro ?? ''}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={tipoConf.className}>
                            {tipoConf.label}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(vistoria.data)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Image className="h-4 w-4 text-muted-foreground" />
                            <span>{fotoCount}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                          {vistoria.observacoes || '-'}
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
            {filtered.map((vistoria) => {
              const tipoConf = TIPO_CONFIG[vistoria.tipo] ?? TIPO_CONFIG.entrada
              const fotoCount = vistoria.fotos?.length ?? 0
              return (
                <Card
                  key={vistoria.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => router.push(`/vistorias/${vistoria.id}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm">
                        {nomeImovel(vistoria.imovel)}
                      </CardTitle>
                      <Badge variant="secondary" className={tipoConf.className}>
                        {tipoConf.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Data</span>
                        <span>{formatDate(vistoria.data)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fotos</span>
                        <div className="flex items-center gap-1">
                          <Image className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{fotoCount}</span>
                        </div>
                      </div>
                      {vistoria.observacoes && (
                        <p className="text-xs text-muted-foreground pt-1 line-clamp-2">
                          {vistoria.observacoes}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {!loading && inspections.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Exibindo {filtered.length} de {inspections.length} vistorias
        </p>
      )}

      {/* New Inspection Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Vistoria</DialogTitle>
          </DialogHeader>
          <InspectionForm
            onSuccess={(inspection) => {
              setDialogOpen(false)
              router.push(`/vistorias/${inspection.id}`)
            }}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
