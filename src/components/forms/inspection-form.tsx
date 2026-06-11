'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, FileText, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Inspection, Contract, InspectionType } from '@/types/database'

interface ContractWithDetails extends Omit<Contract, 'imovel' | 'inquilino'> {
  imovel?: { endereco: string; numero: string; bairro: string } | null
  inquilino?: { nome: string } | null
}

interface InspectionFormProps {
  contratoId?: string
  onSuccess?: (inspection: Inspection) => void
  onCancel?: () => void
}

export function InspectionForm({ contratoId: fixedContratoId, onSuccess, onCancel }: InspectionFormProps) {
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(!fixedContratoId)
  const [contracts, setContracts] = useState<ContractWithDetails[]>([])

  const [contratoId, setContratoId] = useState(fixedContratoId ?? '')
  const [tipo, setTipo] = useState<InspectionType>('entrada')
  const [data, setData] = useState(() => new Date().toISOString().split('T')[0])
  const [observacoes, setObservacoes] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [photoFiles, setPhotoFiles] = useState<FileList | null>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // When a fixed contract ID is provided, fetch only that contract for imovel_id lookup
    if (fixedContratoId) {
      async function fetchSingleContract() {
        const { data, error } = await supabase
          .from('contracts')
          .select('*, imovel:properties(endereco, numero, bairro), inquilino:profiles!inquilino_id(nome)')
          .eq('id', fixedContratoId)
          .single()

        if (error) {
          toast.error('Erro ao carregar contrato')
          console.error(error)
        } else if (data) {
          setContracts([data as ContractWithDetails])
        }
        setLoadingData(false)
      }
      fetchSingleContract()
      return
    }

    async function fetchContracts() {
      const { data, error } = await supabase
        .from('contracts')
        .select('*, imovel:properties(endereco, numero, bairro), inquilino:profiles!inquilino_id(nome)')
        .eq('ativo', true)
        .order('created_at', { ascending: false })

      if (error) {
        toast.error('Erro ao carregar contratos')
        console.error(error)
      } else {
        setContracts((data ?? []) as ContractWithDetails[])
      }
      setLoadingData(false)
    }
    fetchContracts()
  }, [fixedContratoId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!contratoId) {
      toast.error('Selecione um contrato')
      return
    }

    const selectedContract = contracts.find((c) => c.id === contratoId)
    if (!selectedContract) {
      toast.error('Contrato inválido')
      return
    }

    setLoading(true)

    try {
      // 1. Create inspection record
      const payload: Record<string, unknown> = {
        imovel_id: selectedContract.imovel_id,
        contrato_id: contratoId,
        tipo,
        data,
        observacoes: observacoes.trim() || null,
      }

      const { data: created, error } = await supabase
        .from('inspections')
        .insert(payload)
        .select()
        .single()

      if (error) throw error

      const inspectionId = created.id

      // 1b. Saida guided by entrada: copy the entrada checklist into this vistoria
      if (tipo === 'saida') {
        try {
          const { data: entrada } = await supabase
            .from('inspections')
            .select('id')
            .eq('contrato_id', contratoId)
            .eq('tipo', 'entrada')
            .order('data', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (entrada) {
            const { data: entradaItems, error: itemsError } = await supabase
              .from('inspection_items')
              .select('comodo, item, descricao, ordem')
              .eq('vistoria_id', entrada.id)
              .order('comodo')
              .order('ordem')

            if (!itemsError && entradaItems && entradaItems.length > 0) {
              const rows = entradaItems.map((it) => ({
                vistoria_id: inspectionId,
                comodo: it.comodo,
                item: it.item,
                descricao: it.descricao ?? null,
                estado: 'bom',
                observacao: null,
                ordem: it.ordem ?? 0,
              }))

              const { error: copyError } = await supabase
                .from('inspection_items')
                .insert(rows)

              if (copyError) {
                console.error('Erro ao copiar checklist da entrada:', copyError)
                toast.error('Vistoria criada, mas erro ao copiar checklist da entrada')
              } else {
                toast.success('Checklist da entrada carregado')
              }
            }
          }
        } catch (copyError) {
          console.error('Erro ao copiar checklist da entrada:', copyError)
        }
      }

      // 2. Upload PDF if provided
      if (pdfFile) {
        const pdfExt = pdfFile.name.split('.').pop() || 'pdf'
        const pdfPath = `${inspectionId}/laudo.${pdfExt}`

        const { error: pdfUploadError } = await supabase.storage
          .from('vistorias')
          .upload(pdfPath, pdfFile)

        if (pdfUploadError) {
          console.error('Erro ao enviar PDF:', pdfUploadError)
          toast.error('Vistoria criada, mas erro ao enviar PDF')
        } else {
          const { data: pdfUrl } = supabase.storage
            .from('vistorias')
            .getPublicUrl(pdfPath)

          const { error: pdfLinkError } = await supabase
            .from('inspections')
            .update({ pdf_url: pdfUrl.publicUrl })
            .eq('id', inspectionId)

          if (pdfLinkError) {
            console.error('Erro ao vincular PDF à vistoria:', pdfLinkError)
            toast.error('PDF enviado, mas não foi vinculado à vistoria. Tente editar e reenviar.')
          }
        }
      }

      // 3. Upload photos if provided
      if (photoFiles && photoFiles.length > 0) {
        let photoCount = 0
        const failedPhotos: string[] = []
        for (let i = 0; i < photoFiles.length; i++) {
          const file = photoFiles[i]
          const fileExt = file.name.split('.').pop()
          const fileName = `${crypto.randomUUID()}.${fileExt}`
          const filePath = `${inspectionId}/${fileName}`

          const { error: uploadError } = await supabase.storage
            .from('vistorias')
            .upload(filePath, file)

          if (uploadError) {
            console.error(`Erro no upload de ${file.name}:`, uploadError)
            failedPhotos.push(file.name)
            continue
          }

          const { data: urlData } = supabase.storage
            .from('vistorias')
            .getPublicUrl(filePath)

          const { error: insertError } = await supabase
            .from('inspection_photos')
            .insert({
              vistoria_id: inspectionId,
              url: urlData.publicUrl,
              comodo: 'Geral',
              descricao: null,
            })

          if (insertError) {
            console.error(`Erro ao registrar foto ${file.name}:`, insertError)
            failedPhotos.push(file.name)
          } else {
            photoCount++
          }
        }

        if (photoCount > 0) {
          toast.success(`${photoCount} foto(s) adicionada(s)`)
        }
        if (failedPhotos.length > 0) {
          toast.error(`${failedPhotos.length} foto(s) falharam: ${failedPhotos.slice(0, 3).join(', ')}${failedPhotos.length > 3 ? '…' : ''}`)
        }
      }

      toast.success('Vistoria cadastrada com sucesso')
      onSuccess?.(created as Inspection)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Erro desconhecido'
      toast.error(`Erro ao salvar vistoria: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!fixedContratoId && (
        <div>
          <Label>Contrato *</Label>
          <Select value={contratoId} onValueChange={(v) => setContratoId(v ?? '')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o contrato" />
            </SelectTrigger>
            <SelectContent>
              {contracts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.imovel?.endereco ?? '-'}, {c.imovel?.numero ?? ''} - {c.inquilino?.nome ?? 'Sem inquilino'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {contracts.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Nenhum contrato ativo encontrado. Cadastre um contrato antes.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>Tipo *</Label>
          <Select value={tipo} onValueChange={(v) => v && setTipo(v as InspectionType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="saida">Saída</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="data_vistoria">Data *</Label>
          <Input
            id="data_vistoria"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
          />
        </div>
      </div>

      {/* PDF Upload */}
      <div>
        <Label>Laudo / PDF da Vistoria</Label>
        <div className="mt-1">
          {pdfFile ? (
            <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted/30">
              <FileText className="h-5 w-5 text-red-600 shrink-0" />
              <span className="text-sm truncate flex-1">{pdfFile.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  setPdfFile(null)
                  if (pdfInputRef.current) pdfInputRef.current.value = ''
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => pdfInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                Selecionar PDF
              </Button>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Photos Upload */}
      <div>
        <Label>Fotos da Vistoria</Label>
        <div className="mt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => photoInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Selecionar Fotos
          </Button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => setPhotoFiles(e.target.files)}
          />
          {photoFiles && photoFiles.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {photoFiles.length} foto(s) selecionada(s)
            </p>
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="observacoes_vistoria">Observações</Label>
        <Textarea
          id="observacoes_vistoria"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Observações gerais sobre a vistoria..."
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Cadastrar Vistoria
        </Button>
      </div>
    </form>
  )
}
