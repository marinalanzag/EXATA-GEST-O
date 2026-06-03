'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UserPlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile } from '@/types/database'

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

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  }
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

interface TenantFormProps {
  onSuccess?: (tenant: Profile) => void
}

export function TenantFormDialog({ onSuccess }: TenantFormProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [residente, setResidente] = useState('')

  function resetForm() {
    setNome('')
    setEmail('')
    setTelefone('')
    setSenha('')
    setCpfCnpj('')
    setResidente('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!nome.trim() || !email.trim() || !senha.trim()) {
      toast.error('Preencha nome, email e senha')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim(),
          telefone: telefone.trim(),
          senha,
          role: 'inquilino',
          cpf_cnpj: cpfCnpj.replace(/\D/g, '').trim() || null,
          residente: residente.trim() || null,
        }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      toast.success(`Inquilino ${nome} cadastrado com sucesso!`)
      setOpen(false)
      resetForm()
      if (result.user) onSuccess?.(result.user as Profile)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      toast.error(`Erro ao cadastrar inquilino: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" type="button" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4 mr-1" /> Novo Inquilino
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Inquilino</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="tenant-nome">Nome *</Label>
              <Input
                id="tenant-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome completo"
                required
              />
            </div>
            <div>
              <Label htmlFor="tenant-email">Email *</Label>
              <Input
                id="tenant-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tenant-telefone">Telefone (WhatsApp)</Label>
                <Input
                  id="tenant-telefone"
                  value={telefone}
                  onChange={(e) => setTelefone(formatPhone(e.target.value))}
                  placeholder="(31) 99999-9999"
                  maxLength={15}
                />
              </div>
              <div>
                <Label htmlFor="tenant-cpfcnpj">CPF / CNPJ</Label>
                <Input
                  id="tenant-cpfcnpj"
                  value={cpfCnpj ? formatCpfCnpj(cpfCnpj) : ''}
                  onChange={(e) => setCpfCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
                  placeholder="000.000.000-00"
                  maxLength={18}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="tenant-residente">Residente no Imóvel</Label>
              <Input
                id="tenant-residente"
                value={residente}
                onChange={(e) => setResidente(e.target.value)}
                placeholder="Nome de quem reside no imóvel (se diferente do inquilino)"
              />
            </div>
            <div>
              <Label htmlFor="tenant-senha">Senha de acesso *</Label>
              <Input
                id="tenant-senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Senha para o inquilino acessar o portal"
                required
                minLength={6}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Cadastrar Inquilino
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
