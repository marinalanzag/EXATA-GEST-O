import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { sendEmail, boletoEmailHtml, createNotification } from '@/lib/notifications'
import { requireGestor } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireGestor(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { boletoId } = await request.json()
    const supabase = createServerClient()

    const { data: boleto } = await supabase
      .from('boletos')
      .select('*, contrato:contracts(*, imovel:properties(*), inquilino:profiles(*))')
      .eq('id', boletoId)
      .single()

    if (!boleto) {
      return NextResponse.json({ error: 'Boleto não encontrado' }, { status: 404 })
    }

    const contrato = boleto.contrato as any
    const inquilino = contrato.inquilino
    const imovel = contrato.imovel

    const valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(boleto.valor)
    const vencimento = new Date(boleto.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')

    await sendEmail({
      to: inquilino.email,
      subject: `Boleto de Aluguel - ${boleto.referencia_mes} | EXATA`,
      html: boletoEmailHtml(
        inquilino.nome,
        `${imovel.endereco}, ${imovel.numero}`,
        boleto.referencia_mes,
        valor,
        vencimento
      ),
    })

    await createNotification(
      inquilino.id,
      'boleto',
      'Novo boleto disponível',
      `Boleto de ${boleto.referencia_mes} no valor de ${valor} com vencimento em ${vencimento}`
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error sending boleto notification:', error)
    return NextResponse.json({ error: 'Erro ao enviar notificação' }, { status: 500 })
  }
}
