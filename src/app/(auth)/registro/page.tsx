'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'
import { Building2, Loader2, ArrowLeft } from 'lucide-react'
import type { UserRole } from '@/types/database'

export default function RegistroPage() {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('inquilino')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!nome || !email || !password || !role) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }

    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, telefone, senha: password, role }),
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      toast.success('Usuário cadastrado com sucesso!', {
        description: `${nome} foi registrado como ${role === 'proprietario' ? 'proprietário' : 'inquilino'}.`,
      })

      setNome('')
      setEmail('')
      setTelefone('')
      setPassword('')
      setRole('inquilino')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido'
      toast.error(`Erro ao cadastrar: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg">
          <Building2 className="h-7 w-7" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">
          Cadastrar Usuário
        </CardTitle>
        <CardDescription>
          Registre um novo proprietário ou inquilino no sistema
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome completo</Label>
            <Input id="nome" placeholder="Nome do usuário" value={nome} onChange={(e) => setNome(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-email">E-mail</Label>
            <Input id="reg-email" type="email" placeholder="email@exemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone">Telefone (WhatsApp)</Label>
            <Input id="telefone" type="tel" placeholder="(31) 99999-9999" value={telefone} onChange={(e) => setTelefone(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-password">Senha</Label>
            <Input id="reg-password" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label>Tipo de usuário</Label>
            <Select value={role} onValueChange={(val) => val && setRole(val as UserRole)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inquilino">Inquilino</SelectItem>
                <SelectItem value="proprietario">Proprietário</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" size="lg" disabled={loading}>
            {loading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Cadastrando...</>) : 'Cadastrar'}
          </Button>
        </form>
        <div className="mt-6 text-center">
          <Link href="/login" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500">
            <ArrowLeft className="h-3 w-3" /> Voltar para o login
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
