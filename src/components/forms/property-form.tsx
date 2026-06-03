'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
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
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Property, PropertyStatus, ExpensePayer } from '@/types/database'

interface PropertyFormProps {
  property?: Property | null
  onSuccess?: (property: Property) => void
  onCancel?: () => void
}

const PROPERTY_TYPES = ['Residencial', 'Comercial', 'Terreno', 'Galpão']

export function PropertyForm({ property, onSuccess, onCancel }: PropertyFormProps) {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(false)

  const [endereco, setEndereco] = useState(property?.endereco ?? '')
  const [numero, setNumero] = useState(property?.numero ?? '')
  const [complemento, setComplemento] = useState(property?.complemento ?? '')
  const [bairro, setBairro] = useState(property?.bairro ?? '')
  const [cidade, setCidade] = useState(property?.cidade ?? 'Sete Lagoas')
  const [estado, setEstado] = useState(property?.estado ?? 'MG')
  const [cep, setCep] = useState(property?.cep ?? '')
  const [tipo, setTipo] = useState(property?.tipo ?? 'Residencial')
  const [status, setStatus] = useState<PropertyStatus>(property?.status ?? 'disponivel')
  const [despesasPagasPor, setDespesasPagasPor] = useState<ExpensePayer>(property?.despesas_pagas_por ?? 'empresa')
  const [observacoes, setObservacoes] = useState(property?.observacoes ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!endereco.trim() || !numero.trim() || !bairro.trim() || !cidade.trim() || !estado.trim()) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    setLoading(true)

    const payload = {
      endereco: endereco.trim(),
      numero: numero.trim(),
      complemento: complemento.trim() || null,
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      estado: estado.trim(),
      cep: cep.trim(),
      tipo,
      proprietario_id: profile!.id,
      status,
      despesas_pagas_por: despesasPagasPor,
      observacoes: observacoes.trim() || null,
    }

    try {
      if (property) {
        const { data, error } = await supabase
          .from('properties')
          .update(payload)
          .eq('id', property.id)
          .select()
          .single()

        if (error) throw error
        toast.success('Imóvel atualizado com sucesso')
        onSuccess?.(data as Property)
      } else {
        const { data, error } = await supabase
          .from('properties')
          .insert(payload)
          .select()
          .single()

        if (error) throw error
        toast.success('Imóvel cadastrado com sucesso')
        onSuccess?.(data as Property)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      toast.error(`Erro ao salvar imóvel: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="endereco">Endereço *</Label>
          <Input
            id="endereco"
            value={endereco}
            onChange={(e) => setEndereco(e.target.value)}
            placeholder="Rua, Avenida..."
            required
          />
        </div>

        <div>
          <Label htmlFor="numero">Número *</Label>
          <Input
            id="numero"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="123"
            required
          />
        </div>

        <div>
          <Label htmlFor="complemento">Complemento</Label>
          <Input
            id="complemento"
            value={complemento}
            onChange={(e) => setComplemento(e.target.value)}
            placeholder="Apto 101, Sala 2..."
          />
        </div>

        <div>
          <Label htmlFor="bairro">Bairro *</Label>
          <Input
            id="bairro"
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            placeholder="Centro"
            required
          />
        </div>

        <div>
          <Label htmlFor="cep">CEP</Label>
          <Input
            id="cep"
            value={cep}
            onChange={(e) => setCep(e.target.value)}
            placeholder="35700-000"
          />
        </div>

        <div>
          <Label htmlFor="cidade">Cidade *</Label>
          <Input
            id="cidade"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            placeholder="Sete Lagoas"
            required
          />
        </div>

        <div>
          <Label htmlFor="estado">Estado *</Label>
          <Input
            id="estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            placeholder="MG"
            maxLength={2}
            required
          />
        </div>

        <div>
          <Label>Tipo *</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v ?? 'Residencial')}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => v && setStatus(v as PropertyStatus)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disponivel">Disponível</SelectItem>
              <SelectItem value="locado">Locado</SelectItem>
              <SelectItem value="manutencao">Manutenção</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Despesas pagas por</Label>
          <Select value={despesasPagasPor} onValueChange={(v) => v && setDespesasPagasPor(v as ExpensePayer)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="empresa">Empresa</SelectItem>
              <SelectItem value="inquilino">Inquilino</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="observacoes">Observações</Label>
          <Textarea
            id="observacoes"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Observações sobre o imóvel..."
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {property ? 'Salvar Alterações' : 'Cadastrar Imóvel'}
        </Button>
      </div>
    </form>
  )
}
