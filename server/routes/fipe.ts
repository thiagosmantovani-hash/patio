import { Router } from 'express';
import { HttpError } from '../http.ts';

// Consulta da Tabela FIPE pelo servidor do Pátio, na API v2 da parallelum (https://deividfortuna.github.io/fipe/v2/).
// O navegador nunca chama a API de fora: a política de segurança fica fechada, nenhum dado de cliente sai do Pátio
// (só códigos de marca, modelo e ano) e o cache vale para todas as lojas, poupando o limite diário.
// Limites do provedor: 500 consultas/dia sem chave, 1.000/dia com a chave grátis (FIPE_TOKEN); plano pago sem limite.
// FIPE_API_URL troca o endereço (mesmo formato da v2).

const TIPOS: Record<string, string> = { carros: 'cars', motos: 'motorcycles', caminhoes: 'trucks' };
const ID_RE = /^[0-9A-Za-z-]{1,16}$/;
const FIPE_CODE_RE = /^\d{6}-\d$/;
const LIST_TTL = 12 * 60 * 60_000;
const PRICE_TTL = 6 * 60 * 60_000;
const MAX_BYTES = 2_000_000;
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

type Fetch = typeof fetch;

export interface FipePrice {
  valor: number;
  texto: string;
  codigo: string;
  mes: string;
  /** Mês de referência como AAAA-MM (vazio se não der para entender). */
  ref: string;
  marca: string;
  modelo: string;
  ano: number | null;
  combustivel: string;
  /** Histórico oficial de preços, quando o provedor devolve (mais antigo primeiro). */
  historico: { m: string; val: number }[];
}

/** "R$ 85.608,00" → 85608 */
export function parseValor(s: unknown): number {
  const n = Number(String(s ?? '').replace(/[^\d,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** "novembro de 2026" → "2026-11" */
export function parseMes(s: unknown): string {
  const t = String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const m = /([a-z]+)\s+de\s+(\d{4})/.exec(t);
  const i = m ? MESES.indexOf(m[1]!) : -1;
  return i >= 0 ? `${m![2]}-${String(i + 1).padStart(2, '0')}` : '';
}

/** Converte a resposta de preço (v2, ou v1 por compatibilidade) para o formato do Pátio. */
export function toPrice(d: any): FipePrice {
  const texto = String(d?.price ?? d?.Valor ?? '');
  const mes = String(d?.referenceMonth ?? d?.MesReferencia ?? '').trim();
  const hist = (Array.isArray(d?.priceHistory) ? d.priceHistory : [])
    .map((h: any) => ({ m: parseMes(h?.month), val: parseValor(h?.price) }))
    .filter((h: { m: string; val: number }) => h.m && h.val > 0)
    .sort((a: { m: string }, b: { m: string }) => a.m.localeCompare(b.m));
  return {
    valor: parseValor(texto),
    texto,
    codigo: String(d?.codeFipe ?? d?.CodigoFipe ?? ''),
    mes,
    ref: parseMes(mes),
    marca: String(d?.brand ?? d?.Marca ?? ''),
    modelo: String(d?.model ?? d?.Modelo ?? ''),
    ano: Number(d?.modelYear ?? d?.AnoModelo) || null,
    combustivel: String(d?.fuel ?? d?.Combustivel ?? ''),
    historico: hist.slice(-24),
  };
}

export function fipeRoutes(opts: { fetchImpl?: Fetch; baseUrl?: string; token?: string } = {}) {
  const r = Router();
  const doFetch = opts.fetchImpl ?? fetch;
  const base = (opts.baseUrl ?? process.env.FIPE_API_URL ?? 'https://fipe.parallelum.com.br/api/v2').replace(/\/$/, '');
  const token = opts.token ?? process.env.FIPE_TOKEN ?? '';
  const cache = new Map<string, { at: number; data: unknown }>();
  const indisponivel = 'Não foi possível consultar a FIPE agora. Tente de novo em alguns minutos ou digite o valor.';

  async function get(path: string, ttl: number): Promise<any> {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < ttl) return hit.data;
    let res: Response;
    try {
      res = await doFetch(base + path, {
        headers: {
          accept: 'application/json',
          ...(token ? { 'X-Subscription-Token': token, authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
    } catch {
      if (hit) return hit.data;
      throw new HttpError(502, indisponivel);
    }
    if (res.status === 404) throw new HttpError(404, 'Não encontrado na Tabela FIPE.');
    if (!res.ok) {
      if (hit) return hit.data;
      throw new HttpError(502, res.status === 429 ? 'Limite diário de consultas à FIPE atingido. Tente amanhã ou digite o valor.' : indisponivel);
    }
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_BYTES) throw new HttpError(502, indisponivel);
    let data: unknown;
    try {
      const txt = await res.text();
      if (txt.length > MAX_BYTES) throw new Error('grande demais');
      data = JSON.parse(txt);
    } catch {
      if (hit) return hit.data;
      throw new HttpError(502, indisponivel);
    }
    cache.set(path, { at: Date.now(), data });
    if (cache.size > 5000) cache.delete(cache.keys().next().value!);
    return data;
  }

  const tipo = (v: unknown) => {
    const t = TIPOS[String(v)];
    if (!t) throw new HttpError(400, 'Tipo de veículo inválido.');
    return t;
  };
  const id = (v: unknown) => {
    if (typeof v !== 'string' || !ID_RE.test(v)) throw new HttpError(400, 'Código inválido.');
    return v;
  };
  const fipeCode = (v: unknown) => {
    if (typeof v !== 'string' || !FIPE_CODE_RE.test(v)) throw new HttpError(400, 'Código FIPE inválido. Use o formato 000000-0.');
    return v;
  };
  /** Listas: v2 usa {code, name}; v1 usava {codigo, nome}. */
  const list = (x: any) =>
    (Array.isArray(x) ? x : [])
      .map((i) => ({ codigo: i?.code ?? i?.codigo, nome: i?.name ?? i?.nome }))
      .filter((i) => i.codigo != null && ID_RE.test(String(i.codigo)))
      .map((i) => ({ codigo: String(i.codigo), nome: String(i.nome ?? '') }));
  const price = (d: unknown) => {
    const p = toPrice(d);
    if (!p.valor) throw new HttpError(502, 'A FIPE não devolveu um valor para este veículo.');
    return p;
  };

  // Caminho por marca, modelo e ano
  r.get('/:tipo/marcas', async (req, res) => {
    res.json(list(await get(`/${tipo(req.params.tipo)}/brands`, LIST_TTL)));
  });
  r.get('/:tipo/marcas/:m/modelos', async (req, res) => {
    const d = await get(`/${tipo(req.params.tipo)}/brands/${id(req.params.m)}/models`, LIST_TTL);
    res.json(list(d?.modelos ?? d));
  });
  r.get('/:tipo/marcas/:m/modelos/:mo/anos', async (req, res) => {
    res.json(list(await get(`/${tipo(req.params.tipo)}/brands/${id(req.params.m)}/models/${id(req.params.mo)}/years`, LIST_TTL)));
  });
  r.get('/:tipo/marcas/:m/modelos/:mo/anos/:a', async (req, res) => {
    res.json(price(await get(`/${tipo(req.params.tipo)}/brands/${id(req.params.m)}/models/${id(req.params.mo)}/years/${id(req.params.a)}`, PRICE_TTL)));
  });

  // Caminho pelo código FIPE (está no CRLV, em anúncios e no site da FIPE)
  r.get('/:tipo/codigo/:c/anos', async (req, res) => {
    res.json(list(await get(`/${tipo(req.params.tipo)}/${fipeCode(req.params.c)}/years`, LIST_TTL)));
  });
  r.get('/:tipo/codigo/:c/anos/:a', async (req, res) => {
    res.json(price(await get(`/${tipo(req.params.tipo)}/${fipeCode(req.params.c)}/years/${id(req.params.a)}`, PRICE_TTL)));
  });

  return r;
}
