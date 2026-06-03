import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Gera um ZIP com as notas fiscais do mês
 * Query params:
 *   - mes: YYYY-MM (obrigatório)
 *   - tipo: 'emitidas' | 'tomador' | 'todas' (default: 'todas')
 *
 * Usa a lib fflate para gerar o ZIP no servidor (leve, sem dependências nativas)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const mes = searchParams.get('mes')
    const tipo = searchParams.get('tipo') || 'todas'

    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return NextResponse.json(
        { error: 'Parâmetro "mes" obrigatório no formato YYYY-MM' },
        { status: 400 }
      )
    }

    // Busca notas fiscais do mês
    let query = supabase
      .from('invoices')
      .select('*, contrato:contracts(*, imovel:properties(endereco, numero), inquilino:profiles(nome))')
      .eq('referencia_mes', mes)

    const { data: invoices, error } = await query

    if (error) {
      console.error('Erro ao buscar notas:', error)
      return NextResponse.json({ error: 'Erro ao buscar notas fiscais' }, { status: 500 })
    }

    if (!invoices || invoices.length === 0) {
      return NextResponse.json(
        { error: `Nenhuma nota fiscal encontrada para ${mes}` },
        { status: 404 }
      )
    }

    // Busca despesas com NF do mês
    const { data: expenses } = await supabase
      .from('expenses')
      .select('*, imovel:properties(endereco, numero)')
      .eq('data_vencimento', `${mes}-01`)
      .not('numero_nf', 'is', null)
      .neq('numero_nf', 'SEM NOTA')

    // Coleta URLs dos arquivos para download
    const files: { name: string; url: string }[] = []

    // Notas emitidas (do sistema)
    if (tipo === 'emitidas' || tipo === 'todas') {
      for (const inv of invoices) {
        const imovel = (inv as any).contrato?.imovel
        const prefix = imovel ? `${imovel.endereco}_${imovel.numero}` : 'sem_imovel'
        const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_')

        if (inv.arquivo_url) {
          files.push({
            name: `emitidas/${cleanPrefix}_NF${inv.numero_nf}.pdf`,
            url: inv.arquivo_url,
          })
        }
        if ((inv as any).xml_url) {
          files.push({
            name: `emitidas/${cleanPrefix}_NF${inv.numero_nf}.xml`,
            url: (inv as any).xml_url,
          })
        }
      }
    }

    // Notas de tomador/fornecedor (das despesas)
    if (tipo === 'tomador' || tipo === 'todas') {
      if (expenses) {
        for (const exp of expenses) {
          const imovel = (exp as any).imovel
          const prefix = imovel ? `${imovel.endereco}_${imovel.numero}` : 'sem_imovel'
          const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_')

          if (exp.xml_nf_url) {
            files.push({
              name: `tomador/${cleanPrefix}_NF${exp.numero_nf}.xml`,
              url: exp.xml_nf_url,
            })
          }
        }
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum arquivo encontrado para download' },
        { status: 404 }
      )
    }

    // Retorna a lista de arquivos (o download real será feito no cliente)
    // Isso evita timeout do servidor ao baixar muitos arquivos
    return NextResponse.json({
      success: true,
      mes,
      tipo,
      files,
      totalFiles: files.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
