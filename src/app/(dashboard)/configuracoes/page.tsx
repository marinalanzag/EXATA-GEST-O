'use client'

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Settings, Users, Building2, Save, UserPlus, Edit, Trash2, Search, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Profile, UserRole } from '@/types/database'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 11) {
    // CPF: 000.000.000-00
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  // CNPJ: 00.000.000/0000-00
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

const roleLabel: Record<string, string> = {
  gestor: 'Gestor',
  proprietario: 'Proprietário',
  inquilino: 'Inquilino',
}

const roleBadgeClass: Record<string, string> = {
  gestor: 'bg-purple-100 text-purple-800',
  proprietario: 'bg-blue-100 text-blue-800',
  inquilino: 'bg-green-100 text-green-800',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ConfiguracoesPage() {
  const { profile } = useAuth()

  // My profile state
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [saving, setSaving] = useState(false)

  // Users list
  const [users, setUsers] = useState<Profile[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('todos')

  // Edit dialog
  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editTelefone, setEditTelefone] = useState('')
  const [editCpfCnpj, setEditCpfCnpj] = useState('')
  const [editResidente, setEditResidente] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('inquilino')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      setNome(profile.nome)
      setTelefone(profile.telefone || '')
    }
    loadUsers()
  }, [profile])

  async function loadUsers() {
    const { data } = await supabase.from('profiles').select('*').order('nome')
    setUsers((data || []) as Profile[])
    setLoadingUsers(false)
  }

  async function handleSaveProfile() {
    if (!profile) return
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ nome, telefone })
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      toast.error('Erro ao salvar perfil')
    } else {
      toast.success('Perfil atualizado com sucesso')
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return
    try {
      const { authHeaders } = await import('@/lib/supabase')
      const res = await fetch('/api/auth/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao excluir usuário')
      } else {
        toast.success('Usuário excluído')
        loadUsers()
      }
    } catch {
      toast.error('Erro ao excluir usuário')
    }
  }

  function openEditDialog(user: Profile) {
    setEditUser(user)
    setEditNome(user.nome)
    setEditTelefone(user.telefone || '')
    setEditCpfCnpj(user.cpf_cnpj || '')
    setEditResidente(user.residente || '')
    setEditRole(user.role)
  }

  async function handleSaveUser() {
    if (!editUser) return
    if (!editNome.trim()) {
      toast.error('Nome é obrigatório')
      return
    }

    setEditSaving(true)

    const updateData: Record<string, unknown> = {
      nome: editNome.trim(),
      telefone: editTelefone.trim() || null,
      cpf_cnpj: editCpfCnpj.replace(/\D/g, '').trim() || null,
      residente: editResidente.trim() || null,
      role: editRole,
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', editUser.id)

    setEditSaving(false)

    if (error) {
      toast.error('Erro ao atualizar usuário')
      console.error(error)
    } else {
      toast.success('Usuário atualizado com sucesso')
      setEditUser(null)
      loadUsers()
    }
  }

  // Filter users
  const filteredUsers = users.filter((user) => {
    const matchSearch =
      searchTerm === '' ||
      user.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.cpf_cnpj && user.cpf_cnpj.includes(searchTerm.replace(/\D/g, '')))
    const matchRole = roleFilter === 'todos' || user.role === roleFilter
    return matchSearch && matchRole
  })

  // Página restrita a gestores (proprietário tem acesso somente leitura ao restante)
  if (profile && profile.role !== 'gestor') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Settings className="h-12 w-12 text-muted-foreground/40" />
        <h3 className="mt-4 text-lg font-medium">Acesso restrito</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          As configurações do sistema são gerenciadas pela gestão da EXATA.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Settings className="h-6 w-6" /> Configurações
      </h1>

      {/* My Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Meu Perfil</CardTitle>
          <CardDescription>Atualize suas informações pessoais</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                value={telefone}
                onChange={(e) => setTelefone(formatPhone(e.target.value))}
                placeholder="(31) 99999-9999"
                maxLength={15}
              />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input value={profile?.email || ''} disabled />
          </div>
          <div>
            <Label>Perfil</Label>
            <div className="mt-1">
              <Badge className={roleBadgeClass[profile?.role || ''] || ''}>
                {roleLabel[profile?.role || ''] || profile?.role}
              </Badge>
            </div>
          </div>
          <Button onClick={handleSaveProfile} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </CardContent>
      </Card>

      {/* Users Management */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> Usuários do Sistema
              </CardTitle>
              <CardDescription>Gerencie os usuários cadastrados</CardDescription>
            </div>
            <Link href="/registro">
              <Button>
                <UserPlus className="h-4 w-4" /> Novo Usuário
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search + Filter */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou CPF/CNPJ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={roleFilter} onValueChange={(v) => { if (v) setRoleFilter(v) }}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os perfis</SelectItem>
                <SelectItem value="gestor">Gestores</SelectItem>
                <SelectItem value="proprietario">Proprietários</SelectItem>
                <SelectItem value="inquilino">Inquilinos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Users List */}
          {loadingUsers ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum usuário encontrado.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{user.nome}</p>
                      <Badge className={roleBadgeClass[user.role] || ''}>
                        {roleLabel[user.role] || user.role}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {user.email}
                      {user.telefone && ` · ${user.telefone}`}
                    </p>
                    {(user.cpf_cnpj || user.residente) && (
                      <div className="flex flex-wrap gap-x-4 mt-0.5">
                        {user.cpf_cnpj && (
                          <p className="text-xs text-muted-foreground">
                            CPF/CNPJ: {formatCpfCnpj(user.cpf_cnpj)}
                          </p>
                        )}
                        {user.residente && (
                          <p className="text-xs text-muted-foreground">
                            Residente: {user.residente}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(user)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {user.id !== profile?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground text-right">
            {filteredUsers.length} de {users.length} usuário(s)
          </p>
        </CardContent>
      </Card>

      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Dados da Empresa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Razão Social</Label>
              <p className="font-medium mt-1">EXATA Negócios Imobiliários</p>
            </div>
            <div>
              <Label>Cidade</Label>
              <p className="font-medium mt-1">Sete Lagoas - MG</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={!!editUser} onOpenChange={(open) => { if (!open) setEditUser(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-nome">Nome *</Label>
                <Input
                  id="edit-nome"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  placeholder="Nome completo"
                />
              </div>

              <div>
                <Label>Email</Label>
                <Input value={editUser.email} disabled />
                <p className="text-xs text-muted-foreground mt-1">O email não pode ser alterado</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-telefone">Telefone</Label>
                  <Input
                    id="edit-telefone"
                    value={editTelefone}
                    onChange={(e) => setEditTelefone(formatPhone(e.target.value))}
                    placeholder="(31) 99999-9999"
                    maxLength={15}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-cpfcnpj">CPF / CNPJ</Label>
                  <Input
                    id="edit-cpfcnpj"
                    value={editCpfCnpj ? formatCpfCnpj(editCpfCnpj) : ''}
                    onChange={(e) => setEditCpfCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
                    placeholder="000.000.000-00"
                    maxLength={18}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="edit-residente">Residente no Imóvel</Label>
                <Input
                  id="edit-residente"
                  value={editResidente}
                  onChange={(e) => setEditResidente(e.target.value)}
                  placeholder="Nome de quem efetivamente reside no imóvel"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Preencha quando o morador for diferente do titular do contrato
                </p>
              </div>

              <div>
                <Label>Perfil</Label>
                <Select value={editRole} onValueChange={(v) => { if (v) setEditRole(v as UserRole) }}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gestor">Gestor</SelectItem>
                    <SelectItem value="proprietario">Proprietário</SelectItem>
                    <SelectItem value="inquilino">Inquilino</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditUser(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveUser} disabled={editSaving}>
                  {editSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Save className="h-4 w-4" />
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
