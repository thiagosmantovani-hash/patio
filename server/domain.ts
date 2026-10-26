// Regras de negócio puras (sem acesso a banco), cobertas por testes.

export const VEHICLE_STATUSES = ['preparacao', 'disponivel', 'reservado', 'vendido'] as const;
export const LEAD_STAGES = ['novo', 'contato', 'visita', 'proposta', 'ganho', 'perdido'] as const;
export const LEAD_SOURCES = ['loja', 'site', 'telefone', 'whatsapp', 'indicacao', 'portal', 'redes_sociais'] as const;
export const COST_CATEGORIES = ['mecanica', 'funilaria', 'pintura', 'estetica', 'pneus', 'documentacao', 'outros'] as const;
export const PAYMENT_METHODS = ['a_vista', 'financiamento', 'consorcio', 'misto'] as const;
export const DEFAULT_CHANNELS = ['Site próprio', 'OLX', 'Webmotors', 'iCarros', 'Mercado Livre', 'Facebook Marketplace'];

/** Checklist da avaliação: seções percorridas na ordem em que o avaliador anda em volta do carro. */
export const APPRAISAL_CHECKLIST: Record<string, string[]> = {
  Frente: ['Para-choque dianteiro', 'Capô', 'Faróis', 'Grade', 'Para-brisa'],
  'Lateral esquerda': ['Para-lama dianteiro esq.', 'Portas esquerdas', 'Retrovisor esq.', 'Soleira esq.', 'Para-lama traseiro esq.'],
  Traseira: ['Para-choque traseiro', 'Tampa do porta-malas', 'Lanternas', 'Vidro traseiro'],
  'Lateral direita': ['Para-lama dianteiro dir.', 'Portas direitas', 'Retrovisor dir.', 'Soleira dir.', 'Para-lama traseiro dir.'],
  'Rodas e pneus': ['Pneus dianteiros', 'Pneus traseiros', 'Estepe', 'Rodas'],
  Interior: ['Bancos', 'Painel', 'Volante', 'Forro do teto', 'Ar-condicionado', 'Central multimídia', 'Vidros elétricos'],
  'Motor e mecânica': ['Motor (ruídos/vazamentos)', 'Câmbio', 'Embreagem', 'Suspensão', 'Freios', 'Direção', 'Bateria'],
  Documentação: ['Manual e chave reserva', 'Revisões em dia', 'Débitos/multas', 'Restrições (gravame)'],
};

export type ItemCondition = 'ok' | 'atencao' | 'ruim' | 'na';

export interface AppraisalInput {
  market_price: number;
  margin_percent: number;
  items: { repair_cost: number }[];
}

export interface AppraisalSummary {
  repair_total: number;
  margin_value: number;
  suggested_price: number;
}

/**
 * Preço sugerido de compra = referência de mercado − margem desejada − reparos previstos.
 * Nunca negativo.
 */
export function appraisalSummary(a: AppraisalInput): AppraisalSummary {
  const repair_total = round2(a.items.reduce((s, i) => s + (Number(i.repair_cost) || 0), 0));
  const margin_value = round2(a.market_price * (a.margin_percent / 100));
  const suggested_price = Math.max(0, round2(a.market_price - margin_value - repair_total));
  return { repair_total, margin_value, suggested_price };
}

export interface CostLike {
  estimated: number;
  actual: number | null;
}

/** Custo efetivo de preparação: usa o valor real quando lançado, senão o previsto. */
export function preparationTotals(costs: CostLike[]) {
  let estimated = 0;
  let actual = 0;
  let effective = 0;
  for (const c of costs) {
    estimated += c.estimated || 0;
    if (c.actual != null) actual += c.actual;
    effective += c.actual ?? c.estimated ?? 0;
  }
  return { estimated: round2(estimated), actual: round2(actual), effective: round2(effective), variance: round2(actual - estimated) };
}

export interface ProfitInput {
  purchase_price: number;
  sale_price: number;
  preparation: number;
  commission: number;
}

export function vehicleProfit(p: ProfitInput) {
  const total_cost = round2(p.purchase_price + p.preparation + p.commission);
  const profit = round2(p.sale_price - total_cost);
  const margin_percent = p.sale_price > 0 ? round2((profit / p.sale_price) * 100) : 0;
  return { total_cost, profit, margin_percent };
}

/** Dias em estoque entre a entrada e a venda (ou hoje). */
export function daysInStock(entry: string | null | undefined, exit?: string | null, today = new Date()): number {
  if (!entry) return 0;
  const start = Date.parse(entry.slice(0, 10));
  const end = exit ? Date.parse(exit.slice(0, 10)) : Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

/** Uma venda precisa fechar: entrada + financiado + troca = preço de venda. */
export function validateSalePayment(s: { sale_price: number; down_payment: number; financed_amount: number; trade_in_value: number }): string | null {
  if (!(s.sale_price > 0)) return 'Informe o valor da venda.';
  const parts = [s.down_payment, s.financed_amount, s.trade_in_value];
  if (parts.some((v) => v < 0)) return 'Valores de pagamento não podem ser negativos.';
  const total = round2(parts.reduce((a, b) => a + b, 0));
  if (Math.abs(total - s.sale_price) > 0.01) {
    return `A soma de entrada, financiamento e troca (${total.toFixed(2)}) deve ser igual ao valor da venda (${s.sale_price.toFixed(2)}).`;
  }
  return null;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
