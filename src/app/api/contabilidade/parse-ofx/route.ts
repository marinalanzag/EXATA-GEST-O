import { NextRequest, NextResponse } from 'next/server'
import { parseOFX } from '@/lib/ofx-parser'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.ofx') && !fileName.endsWith('.qfx')) {
      return NextResponse.json(
        { error: 'Formato inválido. Envie um arquivo .ofx ou .qfx' },
        { status: 400 }
      )
    }

    const text = await file.text()
    const data = parseOFX(text)

    if (data.transactions.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma transação encontrada no arquivo' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
      summary: {
        totalTransactions: data.transactions.length,
        totalCredits: data.transactions.filter(t => t.amount > 0).length,
        totalDebits: data.transactions.filter(t => t.amount < 0).length,
        sumCredits: data.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
        sumDebits: data.transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
        period: `${data.startDate} a ${data.endDate}`,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao processar arquivo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
