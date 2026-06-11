'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sofa, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { PropertyInventoryItem } from '@/types/database'

interface PropertyInventoryProps {
  imovelId: string
  readOnly?: boolean
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : (error as { message?: string })?.message || 'Erro desconhecido'
}

export function PropertyInventory({ imovelId, readOnly = false }: PropertyInventoryProps) {
  const [items, setItems] = useState<PropertyInventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [addComodoOpen, setAddComodoOpen] = useState(false)
  const [newComodoName, setNewComodoName] = useState('')
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('property_inventory')
      .select('*')
      .eq('imovel_id', imovelId)
      .order('comodo')
      .order('ordem')
      .order('created_at')

    if (error) {
      console.error('Erro ao buscar inventário:', error)
      toast.error('Erro ao carregar inventário')
    } else {
      setItems((data ?? []) as PropertyInventoryItem[])
    }
    setLoading(false)
  }, [imovelId])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  function nextOrdem(comodo: string): number {
    const inComodo = items.filter((i) => i.comodo === comodo)
    return inComodo.length > 0 ? Math.max(...inComodo.map((i) => i.ordem ?? 0)) + 1 : 0
  }

  function updateLocal(itemId: string, patch: Partial<PropertyInventoryItem>) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)))
  }

  async function saveRow(itemId: string, patch: Partial<PropertyInventoryItem>) {
    try {
      const { error } = await supabase
        .from('property_inventory')
        .update(patch)
        .eq('id', itemId)
      if (error) throw error
    } catch (error: unknown) {
      toast.error(`Erro ao salvar item: ${getErrorMessage(error)}`)
    }
  }

  async function handleAddItem(comodo: string) {
    try {
      const { data, error } = await supabase
        .from('property_inventory')
        .insert({
          imovel_id: imovelId,
          comodo,
          item: '',
          descricao: null,
          ordem: nextOrdem(comodo),
        })
        .select()
        .single()

      if (error) throw error
      setItems((prev) => [...prev, data as PropertyInventoryItem])
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
        .from('property_inventory')
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

  const grouped: Record<string, PropertyInventoryItem[]> = {}
  for (const item of items) {
    if (!grouped[item.comodo]) grouped[item.comodo] = []
    grouped[item.comodo].push(item)
  }
  const comodos = Object.keys(grouped)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sofa className="h-4 w-4" />
            Inventário do Imóvel
          </CardTitle>
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={() => setAddComodoOpen(true)} disabled={loading}>
              <Plus className="h-4 w-4" />
              Adicionar cômodo
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Lista de móveis e utensílios do imóvel, reutilizável nas vistorias.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : comodos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum item no inventário.
            {!readOnly && ' Clique em "Adicionar cômodo" para começar.'}
          </p>
        ) : (
          <div className="space-y-6">
            {comodos.map((comodo) => (
              <div key={comodo}>
                <h3 className="text-sm font-semibold border-b pb-1 mb-2">{comodo}</h3>
                <div className="space-y-2">
                  {grouped[comodo].map((item) =>
                    readOnly ? (
                      <div key={item.id} className="flex items-baseline gap-2 text-sm px-1">
                        <span className="font-medium">{item.item || '-'}</span>
                        {item.descricao && (
                          <span className="text-muted-foreground">{item.descricao}</span>
                        )}
                      </div>
                    ) : (
                      <div
                        key={item.id}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_36px] gap-2 items-center"
                      >
                        <Input
                          value={item.item}
                          placeholder="Item (ex.: Sofá, Geladeira...)"
                          onChange={(e) => updateLocal(item.id, { item: e.target.value })}
                          onBlur={() => saveRow(item.id, { item: item.item })}
                        />
                        <Input
                          value={item.descricao ?? ''}
                          placeholder="Descrição (marca, estado, cor...)"
                          onChange={(e) => updateLocal(item.id, { descricao: e.target.value })}
                          onBlur={() => saveRow(item.id, { descricao: item.descricao?.trim() || null })}
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
                    )
                  )}
                </div>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-muted-foreground"
                    onClick={() => handleAddItem(comodo)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar item
                  </Button>
                )}
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
              <Label htmlFor="novo_comodo_inv">Nome do cômodo</Label>
              <Input
                id="novo_comodo_inv"
                value={newComodoName}
                onChange={(e) => setNewComodoName(e.target.value)}
                placeholder="Ex.: Sala, Cozinha, Quarto..."
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

      {/* Delete confirmation */}
      <Dialog open={!!deleteItemId} onOpenChange={(open) => !open && setDeleteItemId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tem certeza que deseja remover este item do inventário?
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
