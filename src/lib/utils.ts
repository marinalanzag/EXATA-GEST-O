import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Retorna o nome de exibição do imóvel: complemento (se existir) ou endereço + número */
export function nomeImovel(imovel: { complemento?: string; endereco: string; numero: string } | null | undefined): string {
  if (!imovel) return '—'
  return imovel.complemento || `${imovel.endereco}, ${imovel.numero}`
}
