'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import type {
  Inspection,
  InspectionItem,
  InspectionPhoto,
  Contract,
} from '@/types/database'

const formatDate = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return dateStr
  }
}

const ESTADO_LABELS: Record<string, string> = {
  bom: 'Bom',
  regular: 'Regular',
  danificado: 'Danificado',
}

function groupBy<T extends { comodo: string }>(list: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {}
  for (const entry of list) {
    if (!groups[entry.comodo]) groups[entry.comodo] = []
    groups[entry.comodo].push(entry)
  }
  return groups
}

interface ContractWithInquilino extends Omit<Contract, 'inquilino'> {
  inquilino?: { nome: string; cpf_cnpj?: string | null } | null
}

export default function LaudoPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [contract, setContract] = useState<ContractWithInquilino | null>(null)
  const [items, setItems] = useState<InspectionItem[]>([])
  const [photos, setPhotos] = useState<InspectionPhoto[]>([])
  const [entradaInspection, setEntradaInspection] = useState<Inspection | null>(null)
  const [entradaPhotos, setEntradaPhotos] = useState<InspectionPhoto[]>([])

  const fetchAll = useCallback(async () => {
    setLoading(true)

    const { data: insp, error } = await supabase
      .from('inspections')
      .select('*, imovel:properties(*, proprietario:profiles!proprietario_id(*))')
      .eq('id', id)
      .single()

    if (error || !insp) {
      toast.error('Vistoria não encontrada')
      router.push('/vistorias')
      return
    }

    const inspection = insp as Inspection
    setInspection(inspection)

    const [contractRes, itemsRes, photosRes] = await Promise.all([
      supabase
        .from('contracts')
        .select('*, inquilino:profiles!inquilino_id(nome, cpf_cnpj)')
        .eq('id', inspection.contrato_id)
        .maybeSingle(),
      supabase
        .from('inspection_items')
        .select('*')
        .eq('vistoria_id', id)
        .order('comodo')
        .order('ordem')
        .order('created_at'),
      supabase
        .from('inspection_photos')
        .select('*')
        .eq('vistoria_id', id)
        .order('comodo')
        .order('created_at'),
    ])

    if (!contractRes.error && contractRes.data) {
      setContract(contractRes.data as ContractWithInquilino)
    }
    if (!itemsRes.error) setItems((itemsRes.data ?? []) as InspectionItem[])
    if (!photosRes.error) setPhotos((photosRes.data ?? []) as InspectionPhoto[])

    // Entrada data when this is a saida
    if (inspection.tipo === 'saida') {
      const { data: entrada } = await supabase
        .from('inspections')
        .select('*')
        .eq('contrato_id', inspection.contrato_id)
        .eq('tipo', 'entrada')
        .order('data', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (entrada) {
        setEntradaInspection(entrada as Inspection)
        const { data: ePhotos } = await supabase
          .from('inspection_photos')
          .select('*')
          .eq('vistoria_id', entrada.id)
          .order('comodo')
          .order('created_at')
        setEntradaPhotos((ePhotos ?? []) as InspectionPhoto[])
      }
    }

    setLoading(false)
  }, [id, router])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!inspection) return null

  const imovel = inspection.imovel
  const itemsByComodo = groupBy(items)
  const photosByComodo = groupBy(photos)
  const entradaPhotosByComodo = groupBy(entradaPhotos)
  const apontamentos = items.filter((i) => i.estado === 'regular' || i.estado === 'danificado')
  const apontamentoComodos = Array.from(new Set(apontamentos.map((a) => a.comodo)))

  return (
    <div className="space-y-4">
      {/* Toolbar (hidden when printing) */}
      <div className="flex items-center justify-between print:hidden">
        <Button variant="outline" onClick={() => router.push(`/vistorias/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Imprimir / Salvar PDF
        </Button>
      </div>

      {/* Printable document */}
      <div className="mx-auto max-w-3xl bg-white text-black rounded-lg border p-8 print:border-0 print:rounded-none print:p-0 print:max-w-none print:shadow-none">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold uppercase tracking-wide">
            LAUDO DE VISTORIA DE {inspection.tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA'}
          </h1>
          <p className="mt-2 text-sm">
            {imovel?.endereco ?? '-'}, {imovel?.numero ?? ''}
            {imovel?.complemento ? ` - ${imovel.complemento}` : ''}
          </p>
          <p className="text-sm">
            {imovel?.bairro ?? ''} - {imovel?.cidade ?? ''}/{imovel?.estado ?? ''}
            {imovel?.cep ? ` - CEP ${imovel.cep}` : ''}
          </p>
          <p className="text-sm mt-1">
            Data da vistoria: {formatDate(inspection.data)}
            {contract?.inquilino?.nome ? ` | Locatário(a): ${contract.inquilino.nome}` : ''}
          </p>
          {imovel?.proprietario?.nome && (
            <p className="text-sm">Proprietário(a): {imovel.proprietario.nome}</p>
          )}
        </div>

        {/* Checklist by comodo */}
        {Object.keys(itemsByComodo).length > 0 && (
          <div className="space-y-5 mb-8">
            {Object.entries(itemsByComodo).map(([comodo, comodoItems]) => (
              <div key={comodo} className="break-inside-avoid">
                <h2 className="text-base font-bold uppercase border-b border-black/40 pb-1 mb-2">
                  {comodo}
                </h2>
                <div className="space-y-0.5 text-sm">
                  {comodoItems.map((item) => {
                    const isProblem = item.estado !== 'bom'
                    return (
                      <p key={item.id} className={isProblem ? 'font-bold' : ''}>
                        {item.item || '-'}: {item.descricao?.trim() || 'sem descrição'};
                        {isProblem && (
                          <>
                            {' '}
                            [{ESTADO_LABELS[item.estado] ?? item.estado}
                            {item.observacao?.trim() ? ` - ${item.observacao}` : ''}]
                          </>
                        )}
                      </p>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Observacoes gerais */}
        {inspection.observacoes && (
          <div className="mb-8 break-inside-avoid">
            <h2 className="text-base font-bold uppercase border-b border-black/40 pb-1 mb-2">
              Observações Gerais
            </h2>
            <p className="text-sm whitespace-pre-wrap">{inspection.observacoes}</p>
          </div>
        )}

        {/* Apontamentos */}
        <div className="mb-8">
          <h2 className="text-base font-bold uppercase border-b border-black/40 pb-1 mb-2">
            Apontamentos e Necessidades de Reparo
          </h2>
          {apontamentos.length === 0 ? (
            <p className="text-sm">Nenhum apontamento. Todos os itens em bom estado.</p>
          ) : (
            <div className="space-y-4">
              {apontamentoComodos.map((comodo) => {
                const comodoApontamentos = apontamentos.filter((a) => a.comodo === comodo)
                const eFotos = entradaPhotosByComodo[comodo] ?? []
                const sFotos = photosByComodo[comodo] ?? []
                const showPairs =
                  inspection.tipo === 'saida' &&
                  entradaInspection !== null &&
                  (eFotos.length > 0 || sFotos.length > 0)

                return (
                  <div key={comodo} className="break-inside-avoid">
                    <h3 className="text-sm font-bold mb-1">{comodo}</h3>
                    <ul className="list-disc pl-5 space-y-0.5 text-sm">
                      {comodoApontamentos.map((item) => (
                        <li key={item.id} className="font-bold">
                          {item.item || '-'} ({ESTADO_LABELS[item.estado] ?? item.estado})
                          {item.observacao?.trim() ? `: ${item.observacao}` : ''}
                        </li>
                      ))}
                    </ul>
                    {showPairs && (
                      <div className="mt-2 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs font-semibold mb-1">Entrada</p>
                          <div className="grid grid-cols-2 gap-2">
                            {eFotos.length === 0 ? (
                              <p className="text-xs text-black/60">Sem fotos</p>
                            ) : (
                              eFotos.map((photo) => (
                                <figure key={photo.id} className="break-inside-avoid">
                                  <img
                                    src={photo.url}
                                    alt={photo.descricao ?? comodo}
                                    className="w-full rounded border border-black/20"
                                  />
                                  <figcaption className="text-[10px] text-black/60">
                                    Entrada{photo.descricao ? ` - ${photo.descricao}` : ''}
                                  </figcaption>
                                </figure>
                              ))
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-semibold mb-1">Saída</p>
                          <div className="grid grid-cols-2 gap-2">
                            {sFotos.length === 0 ? (
                              <p className="text-xs text-black/60">Sem fotos</p>
                            ) : (
                              sFotos.map((photo) => (
                                <figure key={photo.id} className="break-inside-avoid">
                                  <img
                                    src={photo.url}
                                    alt={photo.descricao ?? comodo}
                                    className="w-full rounded border border-black/20"
                                  />
                                  <figcaption className="text-[10px] text-black/60">
                                    Saída{photo.descricao ? ` - ${photo.descricao}` : ''}
                                  </figcaption>
                                </figure>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Photo gallery */}
        {photos.length > 0 && (
          <div>
            <h2 className="text-base font-bold uppercase border-b border-black/40 pb-1 mb-3">
              Registro Fotográfico
            </h2>
            <div className="space-y-4">
              {Object.entries(photosByComodo).map(([comodo, comodoPhotos]) => (
                <div key={comodo} className="break-inside-avoid">
                  <h3 className="text-sm font-bold mb-2">{comodo}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {comodoPhotos.map((photo) => (
                      <figure key={photo.id} className="break-inside-avoid">
                        <img
                          src={photo.url}
                          alt={photo.descricao ?? comodo}
                          className="w-full rounded border border-black/20"
                        />
                        {photo.descricao && (
                          <figcaption className="text-[10px] text-black/60">
                            {photo.descricao}
                          </figcaption>
                        )}
                      </figure>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signatures */}
        <div className="mt-12 grid grid-cols-2 gap-8 break-inside-avoid">
          <div className="text-center">
            <div className="border-t border-black/60 pt-1 text-sm">
              Locador / EXATA Negócios Imobiliários
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-black/60 pt-1 text-sm">
              Locatário(a){contract?.inquilino?.nome ? `: ${contract.inquilino.nome}` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
