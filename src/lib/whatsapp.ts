/**
 * WhatsApp Web integration helpers for EXATA Negocios Imobiliarios.
 */

function cleanPhone(telefone: string): string {
  // Remove everything that is not a digit
  const digits = telefone.replace(/\D/g, '')
  // If it already starts with 55, return as-is; otherwise prepend country code
  if (digits.startsWith('55')) return digits
  return `55${digits}`
}

export function generateWhatsAppUrl(telefone: string, mensagem: string): string {
  const phone = cleanPhone(telefone)
  const text = encodeURIComponent(mensagem)
  return `https://web.whatsapp.com/send?phone=${phone}&text=${text}`
}

export function generateBoletoMessage(
  inquilinoNome: string,
  imovelEndereco: string,
  referenciaMes: string,
  valor: number,
  linkBoleto?: string,
): string {
  const valorFormatado = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)

  const linkLine = linkBoleto ? `\n📎 Boleto: ${linkBoleto}` : ''

  return (
    `*EXATA Negócios Imobiliários*\n\n` +
    `Olá, ${inquilinoNome}! Segue seu boleto referente ao aluguel de ${referenciaMes} do imóvel ${imovelEndereco}.\n\n` +
    `💰 Valor: ${valorFormatado}\n` +
    `📅 Vencimento: dia 10/${referenciaMes}` +
    `${linkLine}\n\n` +
    `Em caso de dúvidas, entre em contato.`
  )
}

export function generateInvoiceMessage(
  inquilinoNome: string,
  imovelEndereco: string,
  referenciaMes: string,
  valor: number,
  linkNF?: string,
): string {
  const valorFormatado = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)

  const linkLine = linkNF ? `\n📎 Nota Fiscal: ${linkNF}` : ''

  return (
    `*EXATA Negócios Imobiliários*\n\n` +
    `Olá, ${inquilinoNome}! Segue sua Nota Fiscal referente ao aluguel de ${referenciaMes} do imóvel ${imovelEndereco}.\n\n` +
    `💰 Valor: ${valorFormatado}\n` +
    `📅 Referência: ${referenciaMes}` +
    `${linkLine}\n\n` +
    `Em caso de dúvidas, entre em contato.`
  )
}
