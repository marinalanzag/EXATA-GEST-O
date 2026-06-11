'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Camera,
  Plus,
  Trash2,
  ArrowLeft,
  Eye,
  Upload,
  Image,
  Loader2,
  X,
  FileText,
  Download,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import type { Inspection, InspectionPhoto } from '@/types/database'

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

const COMODOS = [
  'Sala',
  'Quarto 1',
  'Quarto 2',
  'Quarto 3',
  'Cozinha',
  'Banheiro 1',
  'Banheiro 2',
  'Area de Servico',
  'Garagem',
  'Varanda',
  'Fachada',
  'Outros',
]

export default function VistoriaDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [photos, setPhotos] = useState<InspectionPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [savingObs, setSavingObs] = useState(false)
  const [observacoes, setObservacoes] = useState('')
  const [obsChanged, setObsChanged] = useState(false)

  // Upload dialog state
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadComodo, setUploadComodo] = useState('Sala')
  const [uploadDescricao, setUploadDescricao] = useState('')
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  // Lightbox state
  const [lightboxPhoto, setLightboxPhoto] = useState<InspectionPhoto | null>(null)

  // Delete confirmation state
  const [deletePhotoId, setDeletePhotoId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Comparison state
  const [compareOpen, setCompareOpen] = useState(false)
  const [otherInspection, setOtherInspection] = useState<Inspection | null>(null)
  const [otherPhotos, setOtherPhotos] = useState<InspectionPhoto[]>([])
  const [hasCompanion, setHasCompanion] = useState(false)

  const fetchInspection = useCallback(async () => {
    const { data, error } = await supabase
      .from('inspections')
      .select('*, imovel:properties(*, proprietario:profiles!proprietario_id(*))')
      .eq('id', id)
      .single()

    if (error) {
      console.error('Erro ao buscar vistoria:', error)
      toast.error('Vistoria nao encontrada')
      router.push('/vistorias')
      return
    }

    setInspection(data as Inspection)
    setObservacoes(data.observacoes ?? '')
  }, [id, router])

  const fetchPhotos = useCallback(async () => {
    const { data, error } = await supabase
      .from('inspection_photos')
      .select('*')
      .eq('vistoria_id', id)
      .order('comodo')
      .order('created_at')

    if (error) {
      console.error('Erro ao buscar fotos:', error)
    } else {
      setPhotos((data ?? []) as InspectionPhoto[])
    }
  }, [id])

  const checkCompanionInspection = useCallback(async (vistoria: Inspection) => {
    const otherTipo = vistoria.tipo === 'entrada' ? 'saida' : 'entrada'
    const { data, error } = await supabase
      .from('inspections')
      .select('*')
      .eq('contrato_id', vistoria.contrato_id)
      .eq('tipo', otherTipo)
      .limit(1)
      .single()

    if (!error && data) {
      setHasCompanion(true)
      setOtherInspection(data as Inspection)
    }
  }, [])

  useEffect(() => {
    async function load() {
      await fetchInspection()
      await fetchPhotos()
      setLoading(false)
    }
    load()
  }, [fetchInspection, fetchPhotos])

  useEffect(() => {
    if (inspection) {
      checkCompanionInspection(inspection)
    }
  }, [inspection, checkCompanionInspection])

  async function handleSaveObservacoes() {
    if (!inspection) return
    setSavingObs(true)
    try {
      const { error } = await supabase
        .from('inspections')
        .update({ observacoes: observacoes.trim() || null })
        .eq('id', inspection.id)

      if (error) throw error
      toast.success('Observacoes salvas')
      setObsChanged(false)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Erro desconhecido'
      toast.error(`Erro ao salvar: ${message}`)
    } finally {
      setSavingObs(false)
    }
  }

  async function handleUploadPhotos() {
    if (!uploadFiles || uploadFiles.length === 0) {
      toast.error('Selecione ao menos um arquivo')
      return
    }

    setUploading(true)
    let successCount = 0

    try {
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i]
        const fileExt = file.name.split('.').pop()
        const fileName = `${crypto.randomUUID()}.${fileExt}`
        const filePath = `${id}/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('vistorias')
          .upload(filePath, file)

        if (uploadError) {
          console.error(`Erro no upload de ${file.name}:`, uploadError)
          toast.error(`Erro no upload: ${file.name}`)
          continue
        }

        const { data: urlData } = supabase.storage
          .from('vistorias')
          .getPublicUrl(filePath)

        const { error: insertError } = await supabase
          .from('inspection_photos')
          .insert({
            vistoria_id: id,
            url: urlData.publicUrl,
            comodo: uploadComodo,
            descricao: uploadDescricao.trim() || null,
          })

        if (insertError) {
          console.error('Erro ao registrar foto:', insertError)
          toast.error(`Erro ao registrar foto: ${file.name}`)
        } else {
          successCount++
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} foto(s) adicionada(s)`)
        await fetchPhotos()
      }

      setUploadOpen(false)
      setUploadComodo('Sala')
      setUploadDescricao('')
      setUploadFiles(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Erro desconhecido'
      toast.error(`Erro no upload: ${message}`)
    } finally {
      setUploading(false)
    }
  }

  async function handleDeletePhoto() {
    if (!deletePhotoId) return
    setDeleting(true)

    try {
      const photo = photos.find((p) => p.id === deletePhotoId)
      if (!photo) throw new Error('Foto nao encontrada')

      // Extract path from URL for storage deletion
      const urlParts = photo.url.split('/vistorias/')
      if (urlParts.length > 1) {
        const storagePath = urlParts[urlParts.length - 1]
        await supabase.storage.from('vistorias').remove([storagePath])
      }

      const { error } = await supabase
        .from('inspection_photos')
        .delete()
        .eq('id', deletePhotoId)

      if (error) throw error

      toast.success('Foto removida')
      setPhotos((prev) => prev.filter((p) => p.id !== deletePhotoId))
      setDeletePhotoId(null)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Erro desconhecido'
      toast.error(`Erro ao remover foto: ${message}`)
    } finally {
      setDeleting(false)
    }
  }

  async function handleOpenComparison() {
    if (!otherInspection) return

    const { data, error } = await supabase
      .from('inspection_photos')
      .select('*')
      .eq('vistoria_id', otherInspection.id)
      .order('comodo')
      .order('created_at')

    if (error) {
      toast.error('Erro ao carregar fotos da outra vistoria')
      return
    }

    setOtherPhotos((data ?? []) as InspectionPhoto[])
    setCompareOpen(true)
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !inspection) return

    setUploadingPdf(true)
    try {
      const pdfExt = file.name.split('.').pop() || 'pdf'
      const pdfPath = `${inspection.id}/laudo.${pdfExt}`

      // Remove old PDF if exists
      if (inspection.pdf_url) {
        const oldParts = inspection.pdf_url.split('/inspections/')
        if (oldParts.length > 1) {
          await supabase.storage.from('vistorias').remove([oldParts[oldParts.length - 1]])
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('vistorias')
        .upload(pdfPath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: pdfUrl } = supabase.storage
        .from('vistorias')
        .getPublicUrl(pdfPath)

      const { error: updateError } = await supabase
        .from('inspections')
        .update({ pdf_url: pdfUrl.publicUrl })
        .eq('id', inspection.id)

      if (updateError) throw updateError

      setInspection({ ...inspection, pdf_url: pdfUrl.publicUrl })
      toast.success('PDF enviado com sucesso')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Erro desconhecido'
      toast.error(`Erro ao enviar PDF: ${message}`)
    } finally {
      setUploadingPdf(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  // Group photos by comodo for comparison
  function groupByComodo(photoList: InspectionPhoto[]) {
    const groups: Record<string, InspectionPhoto[]> = {}
    for (const photo of photoList) {
      if (!groups[photo.comodo]) groups[photo.comodo] = []
      groups[photo.comodo].push(photo)
    }
    return groups
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!inspection) return null

  const tipoConf = TIPO_CONFIG[inspection.tipo] ?? TIPO_CONFIG.entrada

  // Group photos by comodo for display
  const photosByComodo = groupByComodo(photos)
  const comodoKeys = Object.keys(photosByComodo).sort()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/vistorias')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">
                {inspection.imovel?.endereco ?? '-'}, {inspection.imovel?.numero ?? ''}
              </h1>
              <Badge variant="secondary" className={tipoConf.className}>
                {tipoConf.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {inspection.imovel?.bairro ?? ''} - {formatDate(inspection.data)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasCompanion && (
            <Button variant="outline" onClick={handleOpenComparison}>
              <Eye className="h-4 w-4" />
              Comparar Vistorias
            </Button>
          )}
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4" />
            Adicionar Fotos
          </Button>
        </div>
      </div>

      {/* PDF Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Laudo / PDF da Vistoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inspection.pdf_url ? (
            <div className="flex items-center gap-3">
              <a
                href={inspection.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                <FileText className="h-4 w-4 text-red-600" />
                Visualizar PDF
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingPdf}
                  onClick={() => pdfInputRef.current?.click()}
                >
                  {uploadingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Substituir PDF
                </Button>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handlePdfUpload}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">Nenhum PDF anexado.</p>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploadingPdf}
                  onClick={() => pdfInputRef.current?.click()}
                >
                  {uploadingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Enviar PDF
                </Button>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handlePdfUpload}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Photo Gallery */}
      <div className="space-y-6">
        {photos.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Camera className="h-12 w-12 text-muted-foreground/40" />
              <h3 className="mt-4 text-lg font-medium">Nenhuma foto adicionada</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Clique em &quot;Adicionar Fotos&quot; para registrar a vistoria.
              </p>
            </CardContent>
          </Card>
        ) : (
          comodoKeys.map((comodo) => (
            <div key={comodo}>
              <h2 className="text-lg font-semibold mb-3">{comodo}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {photosByComodo[comodo].map((photo) => (
                  <Card
                    key={photo.id}
                    className="group overflow-hidden cursor-pointer"
                    onClick={() => setLightboxPhoto(photo)}
                  >
                    <div className="relative aspect-square">
                      <img
                        src={photo.url}
                        alt={photo.descricao ?? photo.comodo}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <Eye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <button
                        className="absolute top-1.5 right-1.5 rounded-full bg-red-500/80 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeletePhotoId(photo.id)
                        }}
                        title="Remover foto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {photo.descricao && (
                      <CardContent className="p-2">
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {photo.descricao}
                        </p>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Observacoes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Observacoes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={observacoes}
            onChange={(e) => {
              setObservacoes(e.target.value)
              setObsChanged(true)
            }}
            placeholder="Observacoes gerais sobre a vistoria..."
            rows={4}
          />
          {obsChanged && (
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                onClick={handleSaveObservacoes}
                disabled={savingObs}
              >
                {savingObs && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Observacoes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Fotos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Comodo *</Label>
              <Select value={uploadComodo} onValueChange={(v) => v && setUploadComodo(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMODOS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="upload_descricao">Descricao</Label>
              <Input
                id="upload_descricao"
                value={uploadDescricao}
                onChange={(e) => setUploadDescricao(e.target.value)}
                placeholder="Descricao das fotos..."
              />
            </div>
            <div>
              <Label htmlFor="upload_files">Fotos *</Label>
              <Input
                id="upload_files"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setUploadFiles(e.target.files)}
              />
              {uploadFiles && uploadFiles.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {uploadFiles.length} arquivo(s) selecionado(s)
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setUploadOpen(false)}
                disabled={uploading}
              >
                Cancelar
              </Button>
              <Button onClick={handleUploadPhotos} disabled={uploading}>
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox Dialog */}
      <Dialog
        open={!!lightboxPhoto}
        onOpenChange={(open) => !open && setLightboxPhoto(null)}
      >
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          {lightboxPhoto && (
            <div>
              <div className="relative bg-black flex items-center justify-center min-h-[300px] max-h-[80vh]">
                <img
                  src={lightboxPhoto.url}
                  alt={lightboxPhoto.descricao ?? lightboxPhoto.comodo}
                  className="max-w-full max-h-[80vh] object-contain"
                />
              </div>
              <div className="p-4 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{lightboxPhoto.comodo}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(lightboxPhoto.created_at)}
                  </span>
                </div>
                {lightboxPhoto.descricao && (
                  <p className="text-sm">{lightboxPhoto.descricao}</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletePhotoId}
        onOpenChange={(open) => !open && setDeletePhotoId(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar exclusao</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover esta foto? Esta acao nao pode ser desfeita.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeletePhotoId(null)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePhoto}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Comparison Dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comparacao de Vistorias</DialogTitle>
          </DialogHeader>
          {otherInspection && (
            <ComparisonView
              currentInspection={inspection}
              currentPhotos={photos}
              otherInspection={otherInspection}
              otherPhotos={otherPhotos}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ------ Comparison Sub-Component ------

interface ComparisonViewProps {
  currentInspection: Inspection
  currentPhotos: InspectionPhoto[]
  otherInspection: Inspection
  otherPhotos: InspectionPhoto[]
}

function ComparisonView({
  currentInspection,
  currentPhotos,
  otherInspection,
  otherPhotos,
}: ComparisonViewProps) {
  // Determine which is entrada and which is saida
  const isCurrentEntrada = currentInspection.tipo === 'entrada'
  const entradaPhotos = isCurrentEntrada ? currentPhotos : otherPhotos
  const saidaPhotos = isCurrentEntrada ? otherPhotos : currentPhotos
  const entradaInspection = isCurrentEntrada ? currentInspection : otherInspection
  const saidaInspection = isCurrentEntrada ? otherInspection : currentInspection

  // Get all unique comodos
  const allComodos = new Set<string>()
  entradaPhotos.forEach((p) => allComodos.add(p.comodo))
  saidaPhotos.forEach((p) => allComodos.add(p.comodo))
  const sortedComodos = Array.from(allComodos).sort()

  function groupByComodo(photoList: InspectionPhoto[]) {
    const groups: Record<string, InspectionPhoto[]> = {}
    for (const photo of photoList) {
      if (!groups[photo.comodo]) groups[photo.comodo] = []
      groups[photo.comodo].push(photo)
    }
    return groups
  }

  const entradaByComodo = groupByComodo(entradaPhotos)
  const saidaByComodo = groupByComodo(saidaPhotos)

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            Entrada
          </Badge>
          <span className="text-muted-foreground">{formatDate(entradaInspection.data)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
            Saida
          </Badge>
          <span className="text-muted-foreground">{formatDate(saidaInspection.data)}</span>
        </div>
      </div>

      {sortedComodos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhuma foto encontrada para comparacao.
        </p>
      ) : (
        sortedComodos.map((comodo) => (
          <div key={comodo}>
            <h3 className="text-base font-semibold mb-3 border-b pb-1">{comodo}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Entrada column */}
              <div>
                <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-2">Entrada</p>
                <div className="grid grid-cols-2 gap-2">
                  {(entradaByComodo[comodo] ?? []).map((photo) => (
                    <div key={photo.id} className="aspect-square rounded-md overflow-hidden border">
                      <img
                        src={photo.url}
                        alt={photo.descricao ?? comodo}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                  {!entradaByComodo[comodo] && (
                    <div className="aspect-square rounded-md border border-dashed flex items-center justify-center">
                      <p className="text-xs text-muted-foreground">Sem fotos</p>
                    </div>
                  )}
                </div>
              </div>
              {/* Saida column */}
              <div>
                <p className="text-xs font-medium text-orange-700 dark:text-orange-400 mb-2">Saida</p>
                <div className="grid grid-cols-2 gap-2">
                  {(saidaByComodo[comodo] ?? []).map((photo) => (
                    <div key={photo.id} className="aspect-square rounded-md overflow-hidden border">
                      <img
                        src={photo.url}
                        alt={photo.descricao ?? comodo}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                  {!saidaByComodo[comodo] && (
                    <div className="aspect-square rounded-md border border-dashed flex items-center justify-center">
                      <p className="text-xs text-muted-foreground">Sem fotos</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
