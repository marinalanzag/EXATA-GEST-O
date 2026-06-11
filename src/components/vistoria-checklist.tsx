'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  ClipboardList,
  Plus,
  Trash2,
  Loader2,
  ListChecks,
  Sofa,
} from 'lucide-react'
import { toast } from 'sonner'
import type { InspectionItem, InspectionItemEstado, PropertyInventoryItem } from '@/types/database'

const ESTADO_CONFIG: Record<InspectionItemEstado, { label: string; className: string }> = {
  bom: {
    label: 'Bom',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  regular: {
    label: 'Regular',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  danificado: {
    label: 'Danificado',
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
}

const DEFAULT_COMODOS = ['Sala', 'Cozinha', 'Quarto', 'Banho', 'Área de Serviço']

const DEFAULT_ITEMS = [
  'Soleira',
  'Piso',
  'Rodapé',
  'Paredes e Teto',
  'Luminária',
  'Janela',
  'Porta',
  'Interruptores',
  'Tomadas',
  'Diversos',
]

interface VistoriaChecklistProps {
  vistoriaId: string
  imovelId: string
  /** Itens da vistoria de entrada (quando esta vistoria for de saída) */
  entradaItems?: InspectionItem[]
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : (error as { message?: string })?.message || 'Erro desconhecido'
}

export function VistoriaChecklist({ vistoriaId, imovelId, entradaItems }: VistoriaChecklistProps) {
  const [items, setItems] = useState<InspectionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [addComodoOpen, setAddComodoOpen] = useState(false)
  const [newComodoName, setNewComodoName] = useState('')
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('inspection_items')
      .select('*')
      .eq('vistoria_id', vistoriaId)
      .order('comodo')
      .order('ordem')
      .order('created_at')

    if (error) {
      console.error('Erro ao buscar checklist:', error)
      toast.error('Erro ao carregar checklist')
    } else {
      setItems((data ?? []) as InspectionItem[])
    }
    setLoading(false)
  }, [vistoriaId])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  function nextOrdem(comodo: string): number {
    const inComodo = items.filter((i) => i.comodo === comodo)
    return inComodo.length > 0 ? Math.max(...inComodo.map((i) => i.ordem ?? 0)) + 1 : 0
  }

  // ----- Local edits + per-row save -----

  function updateLocal(itemId: string, patch: Partial<InspectionItem>) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)))
  }

  async function saveRow(itemId: string, patch: Partial<InspectionItem>) {
    try {
      const { error } = await supabase
        .from('inspection_items')
        .update(patch)
        .eq('id', itemId)
      if (error) throw error
    } catch (error: unknown) {
      toast.error(`Erro ao salvar item: ${getErrorMessage(error)}`)
    }
  }

  function handleEstadoChange(item: InspectionItem, estado: InspectionItemEstado) {
    updateLocal(item.id, { estado })
    saveRow(item.id, { estado })
  }

  // ----- Add / delete -----

  async function handleAddItem(comodo: string) {
    try {
      const { data, error } = await supabase
        .from('inspection_items')
        .insert({
          vistoria_id: vistoriaId,
          comodo,
          item: '',
          descricao: null,
          estado: 'bom',
          observacao: null,
          ordem: nextOrdem(comodo),
        })
        .select()
        .single()

      if (error) throw error
      setItems((prev) => [...prev, data as InspectionItem])
    } catch (error: unknown) {
      toast.error(`Erro ao adicionar item: ${getErrorMessage(error)}`)
    }
  }

  async function handleAddComodo() {
    const name = newComodoName.trim()
    if (!name) {
      toast.error('Informe o nome do cômodo')
      return
    }
    setAddComodoOpen(false)
    setNewComodoName('')
    await handleAddItem(name)
  }

  async function handleDeleteItem() {
    if (!deleteItemId) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('inspection_items')
        .delete()
        .eq('id', deleteItemId)
      if (error) throw error
      setItems((prev) => prev.filter((i) => i.id !== deleteItemId))
      setDeleteItemId(null)
    } catch (error: unknown) {
      toast.error(`Erro ao remover item: ${getErrorMessage(error)}`)
    } finally {
      setDeleting(false)
    }
  }

  // ----- Bulk loads -----

  async function handleLoadDefault() {
    setBusy(true)
    try {
      const rows = DEFAULT_COMODOS.flatMap((comodo) =>
        DEFAULT_ITEMS.map((item, idx) => ({
          vistoria_id: vistoriaId,
          comodo,
          item,
          descricao: null,
          estado: 'bom' as InspectionItemEstado,
          observacao: null,
          ordem: nextOrdem(comodo) + idx,
        }))
      )

      const { error } = await supabase.from('inspection_items').insert(rows)
      if (error) throw error

      toast.success('Checklist padrão EXATA carregado')
      await fetchItems()
    } catch (error: unknown) {
      toast.error(`Erro ao carregar padrão: ${getErrorMessage(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleLoadInventory() {
    setBusy(true)
    try {
      const { data, error } = await supabase
        .from('property_inventory')
        .select('*')
        .eq('imovel_id', imovelId)
        .order('comodo')
        .order('ordem')

      if (error) throw error

      const inventory = (data ?? []) as PropertyInventoryItem[]
      if (inventory.length === 0) {
        toast.info('Este imóvel não possui inventário cadastrado')
        return
      }

      const rows = inventory.map((inv) => ({
        vistoria_id: vistoriaId,
        comodo: inv.comodo,
        item: inv.item,
        descricao: inv.descricao ?? null,
        estado: 'bom' as InspectionItemEstado,
        observacao: null,
        ordem: inv.ordem ?? 0,
      }))

      const { error: insertError } = await supabase.from('inspection_items').insert(rows)
      if (insertError) throw insertError

      toast.success(`${rows.length} item(ns) do inventário carregado(s)`)
      await fetchItems()
    } catch (error: unknown) {
      toast.error(`Erro ao carregar inventário: ${getErrorMessage(error)}`)
    } finally {
      setBusy(false)
    }
  }

  // ----- Render -----

  const grouped: Record<string, InspectionItem[]> = {}
  for (const item of items) {
    if (!grouped[item.comodo]) grouped[item.comodo] = []
    grouped[item.comodo].push(item)
  }
  const comodos = Object.keys(grouped)

  function findEntradaMatch(item: InspectionItem): InspectionItem | undefined {
    if (!entradaItems || entradaItems.length === 0) return undefined
    return entradaItems.find(
      (e) =>
        e.comodo.trim().toLowerCase() === item.comodo.trim().toLowerCase() &&
        e.item.trim().toLowerCase() === item.item.trim().toLowerCase() &&
        e.item.trim() !== ''
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Checklist
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleLoadDefault} disabled={busy || loading}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
              Carregar padrão EXATA
            </Button>
            <Button variant="outline" size="sm" onClick={handleLoadInventory} disabled={busy || loading}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sofa className="h-4 w-4" />}
              Carregar inventário do imóvel
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddComodoOpen(true)} disabled={loading}>
              <Plus className="h-4 w-4" />
              Adicionar cômodo
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : comodos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum item no checklist. Use &quot;Carregar padrão EXATA&quot;, &quot;Carregar
            inventário do imóvel&quot; ou adicione cômodos manualmente.
          </p>
        ) : (
          <div className="space-y-6">
            {comodos.map((comodo) => (
              <div key={comodo}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold border-b pb-1 flex-1">{comodo}</h3>
                </div>
                <div className="space-y-2">
                  {/* Column labels (desktop) */}
                  <div className="hidden lg:grid grid-cols-[1fr_1.5fr_140px_1.5fr_36px] gap-2 px-1">
                    <span className="text-[11px] font-medium text-muted-foreground">Item</span>
                    <span className="text-[11px] font-medium text-muted-foreground">Descrição</span>
                    <span className="text-[11px] font-medium text-muted-foreground">Estado</span>
                    <span className="text-[11px] font-medium text-muted-foreground">Observação</span>
                    <span />
                  </div>
                  {grouped[comodo].map((item) => {
                    const entradaMatch = findEntradaMatch(item)
                    const estadoConf = ESTADO_CONFIG[item.estado] ?? ESTADO_CONFIG.bom
                    return (
                      <div key={item.id} className="rounded-lg border p-2 lg:border-0 lg:p-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_140px_1.5fr_36px] gap-2 items-center">
                          <Input
                            value={item.item}
                            placeholder="Item"
                            onChange={(e) => updateLocal(item.id, { item: e.target.value })}
                            onBlur={() => saveRow(item.id, { item: item.item })}
                          />
                          <Input
                            value={item.descricao ?? ''}
                            placeholder="Descrição"
                            onChange={(e) => updateLocal(item.id, { descricao: e.target.value })}
                            onBlur={() => saveRow(item.id, { descricao: item.descricao?.trim() || null })}
                          />
                          <Select
                            value={item.estado}
                            onValueChange={(v) => v && handleEstadoChange(item, v as InspectionItemEstado)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue>
                                <Badge variant="secondary" className={estadoConf.className}>
                                  {estadoConf.label}
                                </Badge>
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ESTADO_CONFIG) as InspectionItemEstado[]).map((estado) => (
                                <SelectItem key={estado} value={estado}>
                                  <Badge variant="secondary" className={ESTADO_CONFIG[estado].className}>
                                    {ESTADO_CONFIG[estado].label}
                                  </Badge>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={item.observacao ?? ''}
                            placeholder="Observação (opcional)"
                            onChange={(e) => updateLocal(item.id, { observacao: e.target.value })}
                            onBlur={() => saveRow(item.id, { observacao: item.observacao?.trim() || null })}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive justify-self-end"
                            onClick={() => setDeleteItemId(item.id)}
                            title="Remover item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {entradaMatch && (
                          <p className="mt-1 text-xs text-muted-foreground italic px-1">
                            Entrada: {entradaMatch.descricao?.trim() || 'sem descrição'} (
                            {ESTADO_CONFIG[entradaMatch.estado]?.label ?? entradaMatch.estado})
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-muted-foreground"
                  onClick={() => handleAddItem(comodo)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar item
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add comodo dialog */}
      <Dialog open={addComodoOpen} onOpenChange={setAddComodoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar cômodo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="novo_comodo">Nome do cômodo</Label>
              <Input
                id="novo_comodo"
                value={newComodoName}
                onChange={(e) => setNewComodoName(e.target.value)}
                placeholder="Ex.: Quarto 2, Garagem..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddComodo()
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddComodoOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddComodo}>
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete item confirmation */}
      <Dialog open={!!deleteItemId} onOpenChange={(open) => !open && setDeleteItemId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover este item do checklist?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteItemId(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteItem} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
