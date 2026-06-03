import { NextRequest, NextResponse } from 'next/server'
import { generateWhatsAppUrl } from '@/lib/whatsapp'

export async function POST(request: NextRequest) {
  try {
    const { telefone, mensagem } = await request.json()

    if (!telefone || !mensagem) {
      return NextResponse.json(
        { error: 'Telefone e mensagem são obrigatórios.' },
        { status: 400 },
      )
    }

    const url = generateWhatsAppUrl(telefone, mensagem)

    return NextResponse.json({ url })
  } catch {
    return NextResponse.json(
      { error: 'Erro ao gerar link do WhatsApp.' },
      { status: 500 },
    )
  }
}
