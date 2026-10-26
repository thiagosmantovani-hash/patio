const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const int = new Intl.NumberFormat('pt-BR');

export const money = (v: number | null | undefined) => (v == null ? '—' : brl.format(v));
export const money0 = (v: number | null | undefined) => (v == null ? '—' : brl0.format(v));
export const number = (v: number | null | undefined) => (v == null ? '—' : int.format(v));
export const km = (v: number | null | undefined) => (v == null ? '—' : `${int.format(v)} km`);
export const percent = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`);

export function date(v: string | null | undefined) {
  if (!v) return '—';
  const [y, m, d] = v.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function dateTime(v: string | null | undefined) {
  if (!v) return '—';
  const d = new Date(v.includes('T') ? v : `${v.replace(' ', 'T')}Z`);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

export const vehicleName = (v: { brand?: string; model?: string; version?: string | null; year_model?: number | null }) =>
  [v.brand, v.model, v.version].filter(Boolean).join(' ') + (v.year_model ? ` ${v.year_model}` : '');

export const VEHICLE_STATUS: Record<string, { label: string; tone: string }> = {
  preparacao: { label: 'Em preparação', tone: 'warn' },
  disponivel: { label: 'Disponível', tone: 'ok' },
  reservado: { label: 'Reservado', tone: 'info' },
  vendido: { label: 'Vendido', tone: 'muted' },
};

export const LEAD_STAGE: Record<string, { label: string; tone: string }> = {
  novo: { label: 'Novo', tone: 'info' },
  contato: { label: 'Em contato', tone: 'info' },
  visita: { label: 'Visita agendada', tone: 'warn' },
  proposta: { label: 'Proposta', tone: 'warn' },
  ganho: { label: 'Ganho', tone: 'ok' },
  perdido: { label: 'Perdido', tone: 'bad' },
};

export const LEAD_SOURCE: Record<string, string> = {
  loja: 'Loja', site: 'Site / vitrine', telefone: 'Telefone', whatsapp: 'WhatsApp', indicacao: 'Indicação', portal: 'Portal', redes_sociais: 'Redes sociais',
};

export const APPRAISAL_STATUS: Record<string, { label: string; tone: string }> = {
  em_andamento: { label: 'Em andamento', tone: 'info' },
  concluida: { label: 'Concluída', tone: 'warn' },
  aprovada: { label: 'Aprovada', tone: 'ok' },
  recusada: { label: 'Recusada', tone: 'bad' },
  convertida: { label: 'No estoque', tone: 'muted' },
};

export const COST_CATEGORY: Record<string, string> = {
  mecanica: 'Mecânica', funilaria: 'Funilaria', pintura: 'Pintura', estetica: 'Estética', pneus: 'Pneus', documentacao: 'Documentação', outros: 'Outros',
};

export const PAYMENT_METHOD: Record<string, string> = {
  a_vista: 'À vista', financiamento: 'Financiamento', consorcio: 'Consórcio', misto: 'Misto',
};

export const TX_CATEGORY: Record<string, string> = {
  venda_veiculo: 'Venda de veículo', financiamento: 'Repasse de financiamento', compra_veiculo: 'Compra de veículo', preparacao: 'Preparação',
  comissao: 'Comissão', aluguel: 'Aluguel', salarios: 'Salários', marketing: 'Marketing', impostos: 'Impostos', documentacao: 'Documentação',
  servicos: 'Serviços', outros: 'Outros',
};

export const ROLE: Record<string, string> = { admin: 'Administrador', gerente: 'Gerente', vendedor: 'Vendedor' };
