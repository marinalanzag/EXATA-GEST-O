'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, FileText } from 'lucide-react'
import { ContractForm } from '@/components/forms/contract-form'
import type { Contract } from '@/types/database'

export function NovoContratoClient() {
  const router = useRouter()

  function handleSuccess(contract: Contract) {
    router.push(`/contratos/${contract.id}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/contratos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Novo Contrato</h1>
          <p className="text-sm text-muted-foreground">
            Preencha os dados para cadastrar um novo contrato de locacao
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Dados do Contrato
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ContractForm
            onSuccess={handleSuccess}
            onCancel={() => router.push('/contratos')}
          />
        </CardContent>
      </Card>
    </div>
  )
}
