/**
 * OFX Parser — Extrai transações bancárias de arquivos OFX/QFX
 * Formato OFX é baseado em SGML (não XML padrão)
 */

export interface OFXTransaction {
  id: string           // FITID — identificador único do banco
  type: string         // TRNTYPE: CREDIT, DEBIT, etc
  date: string         // Data formatada YYYY-MM-DD
  amount: number       // Valor (positivo = crédito, negativo = débito)
  description: string  // MEMO ou NAME — descrição do lançamento
  checkNum?: string    // CHECKNUM se disponível
  refNum?: string      // REFNUM se disponível
}

export interface OFXData {
  bankId: string
  accountId: string
  accountType: string
  startDate: string
  endDate: string
  transactions: OFXTransaction[]
  balance?: number
  balanceDate?: string
}

/**
 * Converte data OFX (YYYYMMDDHHMMSS ou YYYYMMDD) para YYYY-MM-DD
 */
function parseOFXDate(dateStr: string): string {
  if (!dateStr) return ''
  // Remove timezone info [x:GMT] se houver
  const clean = dateStr.replace(/\[.*\]/, '').trim()
  if (clean.length >= 8) {
    const year = clean.substring(0, 4)
    const month = clean.substring(4, 6)
    const day = clean.substring(6, 8)
    return `${year}-${month}-${day}`
  }
  return dateStr
}

/**
 * Extrai o valor entre tags OFX: <TAG>valor
 * OFX usa tags auto-fechadas sem / (diferente de XML)
 */
function extractTag(content: string, tag: string): string {
  // Tenta formato <TAG>valor</TAG> primeiro
  const xmlRegex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i')
  const xmlMatch = content.match(xmlRegex)
  if (xmlMatch) return xmlMatch[1].trim()

  // Formato OFX: <TAG>valor\n
  const ofxRegex = new RegExp(`<${tag}>([^\\n<]+)`, 'i')
  const ofxMatch = content.match(ofxRegex)
  if (ofxMatch) return ofxMatch[1].trim()

  return ''
}

/**
 * Extrai todas as transações do bloco BANKTRANLIST
 */
function extractTransactions(content: string): OFXTransaction[] {
  const transactions: OFXTransaction[] = []

  // Encontra todos os blocos STMTTRN
  const stmtRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST))/gi
  let match

  while ((match = stmtRegex.exec(content)) !== null) {
    const block = match[1]

    const type = extractTag(block, 'TRNTYPE')
    const datePosted = extractTag(block, 'DTPOSTED')
    const amount = extractTag(block, 'TRNAMT')
    const fitId = extractTag(block, 'FITID')
    const name = extractTag(block, 'NAME')
    const memo = extractTag(block, 'MEMO')
    const checkNum = extractTag(block, 'CHECKNUM')
    const refNum = extractTag(block, 'REFNUM')

    if (amount) {
      transactions.push({
        id: fitId || `trn-${transactions.length}`,
        type: type || 'OTHER',
        date: parseOFXDate(datePosted),
        amount: parseFloat(amount.replace(',', '.')),
        description: memo || name || 'Sem descrição',
        checkNum: checkNum || undefined,
        refNum: refNum || undefined,
      })
    }
  }

  return transactions
}

/**
 * Faz o parse de um arquivo OFX completo
 */
export function parseOFX(content: string): OFXData {
  // Remove BOM se existir
  const clean = content.replace(/^﻿/, '')

  // Extrai dados da conta
  const bankId = extractTag(clean, 'BANKID')
  const accountId = extractTag(clean, 'ACCTID')
  const accountType = extractTag(clean, 'ACCTTYPE')

  // Extrai período
  const dtStart = extractTag(clean, 'DTSTART')
  const dtEnd = extractTag(clean, 'DTEND')

  // Extrai transações
  const transactions = extractTransactions(clean)

  // Extrai saldo
  const balAmt = extractTag(clean, 'BALAMT')
  const dtAsOf = extractTag(clean, 'DTASOF')

  // Ordena por data
  transactions.sort((a, b) => a.date.localeCompare(b.date))

  return {
    bankId,
    accountId,
    accountType: accountType || 'CHECKING',
    startDate: parseOFXDate(dtStart),
    endDate: parseOFXDate(dtEnd),
    transactions,
    balance: balAmt ? parseFloat(balAmt.replace(',', '.')) : undefined,
    balanceDate: dtAsOf ? parseOFXDate(dtAsOf) : undefined,
  }
}

/**
 * Tipos de conciliação
 */
export type ReconciliationStatus =
  | 'conciliado'       // Lançamento casou com boleto/despesa
  | 'nao_identificado' // Lançamento sem correspondência
  | 'justificado'      // Usuário justificou manualmente

export interface ReconciliationEntry {
  transaction: OFXTransaction
  status: ReconciliationStatus
  matchType?: 'boleto' | 'despesa' | null
  matchId?: string | null
  justificativa?: string | null
  possuiNota?: boolean
  numeroNota?: string | null
}
