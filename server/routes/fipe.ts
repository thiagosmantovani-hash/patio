import { Router } from 'express';
import { HttpError } from '../http.ts';

// Consulta da Tabela FIPE pelo servidor do Pátio (API pública da parallelum, com cache).
// O navegador nunca chama a API de fora: assim a política de segurança fica fechada e o cache vale para todas as lojas.
// FIPE_API_URL troca o provedor (mesmo formato da API v1) e FIPE_TOKEN envia a chave de assinatura, se houver.

const TIPOS = ['carros', 'motos', 'caminhoes'] as const;
const ID_RE = /^[0-9A-Za-z-]{1,16}$/;
const LIST_TTL = 12 * 60 * 60_000;
const PRICE_TTL = 6 * 60 * 60_000;

type Fetch = typeof fetch;

export interface FipePrice {
  valor: number;
  texto: string;
  codigo: string;
  mes: string;
  marca: string;
  modelo: string;
  ano: number | null;
  combustivel: string;
}

/** "R$ 85.608,00" → 85608 */
export function parseValor(s: unknown): number {
  const n = Number(String(s ?? '').replace(/[^\d,]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function fipeRoutes(opts: { fetchImpl?: Fetch; baseUrl?: string; token?: string } = {}) {
  const r = Router();
  const doFetch = opts.fetchImpl ?? fetch;
  const base = (opts.baseUrl ?? process.env.FIPE_API_URL ?? 'https://parallelum.com.br/fipe/api/v1').replace(/\/$/, '');
  const token = opts.token ?? process.env.FIPE_TOKEN ?? '';
  const cache = new Map<string, { at: number; data: unknown }>();
  const indisponivel = 'Não foi possível consultar a FIPE agora. Tente de novo em alguns minutos ou digite o valor.';

  async function get(path: string, ttl: number): Promise<any> {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < ttl) return hit.data;
    let res: Response;
    try {
      res = await doFetch(base + path, {
        headers: { accept: 'application/json', ...(token ? { 'X-Subscription-Token': token } : {}) },
        signal: AbortSignal.timeout(10_000),
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
    const data = await res.json();
    cache.set(path, { at: Date.now(), data });
    if (cache.size > 5000) cache.delete(cache.keys().next().value!);
    return data;
  }

  const tipo = (v: unknown) => {
    if (!TIPOS.includes(v as any)) throw new HttpError(400, 'Tipo de veículo inválido.');
    return v as string;
  };
  const id = (v: unknown) => {
    if (typeof v !== 'string' || !ID_RE.test(v)) throw new HttpError(400, 'Código inválido.');
    return v;
  };
  const list = (x: any) => (Array.isArray(x) ? x : []).filter((i) => i && i.codigo != null).map((i) => ({ codigo: String(i.codigo), nome: String(i.nome ?? '') }));

  r.get('/:tipo/marcas', async (req, res) => {
    res.json(list(await get(`/${tipo(req.params.tipo)}/marcas`, LIST_TTL)));
  });
  r.get('/:tipo/marcas/:m/modelos', async (req, res) => {
    const d = await get(`/${tipo(req.params.tipo)}/marcas/${id(req.params.m)}/modelos`, LIST_TTL);
    res.json(list(d?.modelos ?? d));
  });
  r.get('/:tipo/marcas/:m/modelos/:mo/anos', async (req, res) => {
    res.json(list(await get(`/${tipo(req.params.tipo)}/marcas/${id(req.params.m)}/modelos/${id(req.params.mo)}/anos`, LIST_TTL)));
  });
  r.get('/:tipo/marcas/:m/modelos/:mo/anos/:a', async (req, res) => {
    const d = await get(`/${tipo(req.params.tipo)}/marcas/${id(req.params.m)}/modelos/${id(req.params.mo)}/anos/${id(req.params.a)}`, PRICE_TTL);
    const p: FipePrice = {
      valor: parseValor(d?.Valor),
      texto: String(d?.Valor ?? ''),
      codigo: String(d?.CodigoFipe ?? ''),
      mes: String(d?.MesReferencia ?? '').trim(),
      marca: String(d?.Marca ?? ''),
      modelo: String(d?.Modelo ?? ''),
      ano: Number(d?.AnoModelo) || null,
      combustivel: String(d?.Combustivel ?? ''),
    };
    if (!p.valor) throw new HttpError(502, 'A FIPE não devolveu um valor para este veículo.');
    res.json(p);
  });

  return r;
}
