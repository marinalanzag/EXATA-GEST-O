import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { sendEmail, contratoVencendoEmailHtml, createNotification } from '@/lib/notifications'

export async function GET() {
  try {
    const supabase = createServerClient()

    const { data: contracts } = await supabase
      .from('contracts')
      .select('*, imovel:properties(*), inquilino:profiles(*)')
      .eq('ativo', true)

    const { data: gestores } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'gestor')

    if (!contracts || !gestores) {
      return NextResponse.json({ message: 'No data' })
    }

    const now = new Date()
    const alertDays = [30, 60, 90]
    let notificationsSent = 0

    for (const contract of contracts) {
      const dataFim = new Date(contract.data_fim + 'T00:00:00')
      const diffDays = Math.ceil((dataFim.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      if (alertDays.includes(diffDays)) {
        const imovel = contract.imovel as any
        const inquilino = contract.inquilino as any
        const dataFimFormatted = dataFim.toLocaleDateString('pt-BR')

        for (const gestor of gestores) {
          await sendEmail({
            to: gestor.email,
            subject: `⚠️ Contrato vencendo em ${diffDays} dias | EXATA`,
            html: contratoVencendoEmailHtml(
              gestor.nome,
              `${imovel.endereco}, ${imovel.numero}`,
              inquilino.nome,
              dataFimFormatted,
              diffDays
            ),
          })

          await createNotification(
            gestor.id,
            'contrato_vencendo',
            `Contrato vencendo em ${diffDays} dias`,
            `O contrato do imóvel ${imovel.endereco}, ${imovel.numero} (inquilino: ${inquilino.nome}) vence em ${dataFimFormatted}`
          )

          notificationsSent++
        }
      }
    }

    // Check overdue boletos
    const { data: boletos } = await supabase
      .from('boletos')
      .select('*, contrato:contracts(*, imovel:properties(*), inquilino:profiles(*))')
      .eq('status', 'pendente')
      .lt('data_vencimento', now.toISOString().split('T')[0])

    if (boletos) {
      for (const boleto of boletos) {
        await supabase.from('boletos').update({ status: 'vencido' }).eq('id', boleto.id)

        const contrato = boleto.contrato as any
        for (const gestor of gestores) {
          await createNotification(
            gestor.id,
            'boleto_vencido',
            'Boleto vencido',
            `Boleto de ${contrato.inquilino.nome} ref. ${boleto.referencia_mes} está vencido`
          )
        }
      }
    }

    return NextResponse.json({ success: true, notificationsSent })
  } catch (error) {
    console.error('Error checking contracts:', error)
    return NextResponse.json({ error: 'Erro ao verificar contratos' }, { status: 500 })
  }
}
