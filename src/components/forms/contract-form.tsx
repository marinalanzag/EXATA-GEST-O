'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Upload, User } from 'lucide-react'
import { toast } from 'sonner'
import { TenantFormDialog } from './tenant-form'
import type { Contract, Property, Profile, GuaranteeType, CaucaoFormaPagamento } from '@/types/database'

interface ContractFormProps {
  contract?: Contract | null
  onSuccess?: (contract: Contract) => void
  onCancel?: () => void
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function parseCurrencyInput(raw: string): number {
  const cleaned = raw.replace(/[^\d,]/g, '').replace(',', '.')
  return parseFloat(cleaned) || 0
}

const CAUCAO_FORMA_LABELS: Record<CaucaoFormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência/PIX',
  cheque: 'Cheque',
  deposito: 'Depósito',
  outro: 'Outro',
}

export function ContractForm({ contract, onSuccess, onCancel }: ContractFormProps) {
  const [loading, setLoading] = useState(false)
  const [properties, setProperties] = useState<Property[]>([])
  const [inquilinos, setInquilinos] = useState<Profile[]>([])
  const [loadingData, setLoadingData] = useState(true)

  // Contract fields
  const [imovelId, setImovelId] = useState(contract?.imovel_id ?? '')
  const [inquilinoId, setInquilinoId] = useState(contract?.inquilino_id ?? '')
  const [valorAluguel, setValorAluguel] = useState(
    contract ? formatCurrency(contract.valor_aluguel) : ''
  )
  const [dataInicio, setDataInicio] = useState(contract?.data_inicio ?? '')
  const [dataFim, setDataFim] = useState(contract?.data_fim ?? '')
  const [tipoGarantia, setTipoGarantia] = useState<GuaranteeType>(
    contract?.tipo_garantia ?? 'caucao'
  )
  const [caucaoValor, setCaucaoValor] = useState(
    contract?.caucao_valor ? formatCurrency(contract.caucao_valor) : ''
  )
  const [caucaoForma, setCaucaoForma] = useState<CaucaoFormaPagamento>(
    contract?.caucao_forma_pagamento ?? 'transferencia'
  )
  const [observacoes, setObservacoes] = useState(contract?.observacoes ?? '')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)

  // Inquilino inline edit fields
  const [editCpfCnpj, setEditCpfCnpj] = useState('')
  const [editResidente, setEditResidente] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  // When inquilino changes, load their CPF/CNPJ and residente
  useEffect(() => {
    if (inquilinoId) {
      const inq = inquilinos.find((i) => i.id === inquilinoId)
      if (inq) {
        setEditCpfCnpj(inq.cpf_cnpj || '')
        setEditResidente(inq.residente || '')
      }
    } else {
      setEditCpfCnpj('')
      setEditResidente('')
    }
  }, [inquilinoId, inquilinos])

  async function fetchData() {
    const [propsRes, inqRes] = await Promise.all([
      supabase.from('properties').select('*').order('endereco'),
      supabase.from('profiles').select('*').eq('role', 'inquilino').order('nome'),
    ])

    if (!propsRes.error) setProperties((propsRes.data ?? []) as Property[])
    if (!inqRes.error) setInquilinos((inqRes.data ?? []) as Profile[])
    setLoadingData(false)
  }

  function handleTenantCreated(tenant: Profile) {
    setInquilinos((prev) => [...prev, tenant])
    setInquilinoId(tenant.id)
  }

  function handleValorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d]/g, '')
    if (!raw) { setValorAluguel(''); return }
    const numValue = parseInt(raw, 10) / 100
    setValorAluguel(formatCurrency(numValue))
  }

  function handleCaucaoValorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^\d]/g, '')
    if (!raw) { setCaucaoValor(''); return }
    const numValue = parseInt(raw, 10) / 100
    setCaucaoValor(formatCurrency(numValue))
  }

  async function uploadContractPdf(): Promise<string | null> {
    if (!arquivo) return contract?.arquivo_url ?? null

    setUploadingFile(true)
    try {
      const fileExt = arquivo.name.split('.').pop()
      const fileName = `${crypto.randomUUID()}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('Contratos')
        .upload(filePath, arquivo)

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('Contratos')
        .getPublicUrl(filePath)

      return urlData.publicUrl
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      toast.error(`Erro ao fazer upload: ${message}`)
      return null
    } finally {
      setUploadingFile(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!imovelId) { toast.error('Selecione um imóvel'); return }
    if (!inquilinoId) { toast.error('Selecione um inquilino'); return }
    if (!valorAluguel) { toast.error('Informe o valor do aluguel'); return }
    if (!dataInicio) { toast.error('Informe a data de início'); return }
    if (!dataFim) { toast.error('Informe a data de fim'); return }

    setLoading(true)

    try {
      // Save inquilino CPF/CNPJ and residente if changed
      const cpfDigits = editCpfCnpj.replace(/\D/g, '').trim()
      const residenteTrim = editResidente.trim()

      await supabase
        .from('profiles')
        .update({
          cpf_cnpj: cpfDigits || null,
          residente: residenteTrim || null,
        })
        .eq('id', inquilinoId)

      const arquivoUrl = await uploadContractPdf()
      const valor = parseCurrencyInput(valorAluguel)

      const payload: Record<string, unknown> = {
        imovel_id: imovelId,
        inquilino_id: inquilinoId,
        valor_aluguel: valor,
        data_inicio: dataInicio,
        data_fim: dataFim,
        tipo_garantia: tipoGarantia,
        observacoes: observacoes.trim() || null,
        arquivo_url: arquivoUrl,
        ativo: true,
      }

      // Add caução fields only when guarantee type is caução
      if (tipoGarantia === 'caucao') {
        payload.caucao_valor = caucaoValor ? parseCurrencyInput(caucaoValor) : null
        payload.caucao_forma_pagamento = caucaoForma
      } else {
        payload.caucao_valor = null
        payload.caucao_forma_pagamento = null
      }

      if (contract) {
        const { data, error } = await supabase
          .from('contracts')
          .update(payload)
          .eq('id', contract.id)
          .select()
          .single()

        if (error) throw error
        toast.success('Contrato atualizado com sucesso')
        onSuccess?.(data as Contract)
      } else {
        const { data, error } = await supabase
          .from('contracts')
          .insert(payload)
          .select()
          .single()

        if (error) throw error

        await supabase
          .from('properties')
          .update({ status: 'locado' })
          .eq('id', imovelId)

        toast.success('Contrato cadastrado com sucesso')
        onSuccess?.(data as Contract)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      toast.error(`Erro ao salvar contrato: ${message}`)
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

  const selectedInquilino = inquilinos.find((i) => i.id === inquilinoId)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Imóvel */}
      <div>
        <Label>Imóvel *</Label>
        <Select value={imovelId} onValueChange={(v) => setImovelId(v ?? '')}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione o imóvel" />
          </SelectTrigger>
          <SelectContent>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.endereco}, {p.numero} - {p.bairro}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Inquilino */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>Inquilino *</Label>
          <TenantFormDialog onSuccess={handleTenantCreated} />
        </div>
        <Select value={inquilinoId} onValueChange={(v) => setInquilinoId(v ?? '')}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={inquilinos.length === 0 ? 'Cadastre um inquilino primeiro' : 'Selecione o inquilino'} />
          </SelectTrigger>
          <SelectContent>
            {inquilinos.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.nome} ({i.email})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Dados do inquilino (CPF/CNPJ + Residente) — aparecem ao selecionar inquilino */}
      {inquilinoId && (
        <div className="rounded-lg border p-3 bg-muted/20 space-y-3">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            Dados do Inquilino — {selectedInquilino?.nome}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="inq-cpfcnpj" className="text-xs">CPF / CNPJ</Label>
              <Input
                id="inq-cpfcnpj"
                value={editCpfCnpj ? formatCpfCnpj(editCpfCnpj) : ''}
                onChange={(e) => setEditCpfCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
                placeholder="000.000.000-00"
                maxLength={18}
              />
            </div>
            <div>
              <Label htmlFor="inq-residente" className="text-xs">Residente no Imóvel</Label>
              <Input
                id="inq-residente"
                value={editResidente}
                onChange={(e) => setEditResidente(e.target.value)}
                placeholder="Se diferente do inquilino"
              />
            </div>
          </div>
        </div>
      )}

      {/* Valores e datas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="valor_aluguel">Valor do Aluguel *</Label>
          <Input
            id="valor_aluguel"
            value={valorAluguel}
            onChange={handleValorChange}
            placeholder="R$ 0,00"
            required
          />
        </div>

        <div>
          <Label>Tipo de Garantia</Label>
          <Select value={tipoGarantia} onValueChange={(v) => v && setTipoGarantia(v as GuaranteeType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="caucao">Caução</SelectItem>
              <SelectItem value="fiador">Fiador</SelectItem>
              <SelectItem value="seguro_fianca">Seguro Fiança</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Campos de Caução (só aparecem se garantia = caução) */}
      {tipoGarantia === 'caucao' && (
        <div className="rounded-lg border p-3 bg-amber-50/50 dark:bg-amber-900/10 space-y-3">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-400">
            Detalhes da Caução
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="caucao_valor" className="text-xs">Valor da Caução</Label>
              <Input
                id="caucao_valor"
                value={caucaoValor}
                onChange={handleCaucaoValorChange}
                placeholder="R$ 0,00"
              />
            </div>
            <div>
              <Label className="text-xs">Forma de Pagamento</Label>
              <Select value={caucaoForma} onValueChange={(v) => v && setCaucaoForma(v as CaucaoFormaPagamento)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(CAUCAO_FORMA_LABELS) as [CaucaoFormaPagamento, string][]).map(
                    ([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="data_inicio">Data de Início *</Label>
          <Input
            id="data_inicio"
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="data_fim">Data de Fim *</Label>
          <Input
            id="data_fim"
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="arquivo">Contrato PDF</Label>
        <div className="flex items-center gap-2">
          <Input
            id="arquivo"
            type="file"
            accept=".pdf"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="flex-1"
          />
          {uploadingFile && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      </div>

      <div>
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Observações sobre o contrato..."
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={loading || uploadingFile}>
          {(loading || uploadingFile) && <Loader2 className="h-4 w-4 animate-spin" />}
          {contract ? 'Salvar Alterações' : 'Cadastrar Contrato'}
        </Button>
      </div>
    </form>
  )
}
