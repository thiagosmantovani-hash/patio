import { Router } from 'express';
import type { DB } from '../db.ts';
import { tx } from '../db.ts';
import { LEAD_SOURCES, LEAD_STAGES } from '../domain.ts';
import { HttpError, idParam, int, notFound, num, oneOf, str } from '../http.ts';
import { insertCustomer } from './customers.ts';

const ACTIVITY_TYPES = ['nota', 'ligacao', 'whatsapp', 'email', 'visita', 'proposta', 'etapa'] as const;
const STAGE_LABEL: Record<string, string> = {
  novo: 'Novo', contato: 'Em contato', visita: 'Visita agendada', proposta: 'Proposta', ganho: 'Ganho', perdido: 'Perdido',
};

const LEAD_SELECT = `
  SELECT l.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
    v.brand AS vehicle_brand, v.model AS vehicle_model, v.year_model AS vehicle_year, v.sale_price AS vehicle_price,
    u.name AS seller_name
  FROM leads l
  JOIN customers c ON c.id = l.customer_id
  LEFT JOIN vehicles v ON v.id = l.vehicle_id
  LEFT JOIN users u ON u.id = l.seller_id`;

export function leadRoutes(db: DB) {
  const r = Router();
  const getLead = (id: number) => {
    const lead = db.prepare(`${LEAD_SELECT} WHERE l.id = ?`).get(id) as { id: number; stage: string } | undefined;
    if (!lead) throw notFound('Lead');
    return lead;
  };
  const log = db.prepare('INSERT INTO lead_activities (lead_id, user_id, type, description) VALUES (?, ?, ?, ?)');

  r.get('/', (req, res) => {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (typeof req.query.seller_id === 'string' && req.query.seller_id) {
      where.push('l.seller_id = ?');
      params.push(Number(req.query.seller_id));
    }
    if (req.query.mine === '1') {
      where.push('l.seller_id = ?');
      params.push(req.user!.id);
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      where.push("(c.name LIKE ? OR IFNULL(c.phone,'') LIKE ?)");
      params.push(`%${req.query.q.trim()}%`, `%${req.query.q.trim()}%`);
    }
    res.json(db.prepare(`${LEAD_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY l.updated_at DESC`).all(...params));
  });

  r.get('/:id', (req, res) => {
    const lead = getLead(idParam(req));
    res.json({
      ...lead,
      activities: db
        .prepare(
          `SELECT a.*, u.name AS user_name FROM lead_activities a LEFT JOIN users u ON u.id = a.user_id
           WHERE a.lead_id = ? ORDER BY a.created_at DESC, a.id DESC`,
        )
        .all(lead.id),
    });
  });

  r.post('/', (req, res) => {
    const id = tx(db, () => {
      let customerId = int(req.body, 'customer_id');
      if (!customerId) {
        if (!req.body.customer) throw new HttpError(400, 'Selecione ou cadastre um cliente.');
        customerId = insertCustomer(db, req.body.customer);
      }
      const info = db
        .prepare('INSERT INTO leads (customer_id, vehicle_id, seller_id, source, stage, value, notes, next_contact) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          customerId,
          int(req.body, 'vehicle_id'),
          int(req.body, 'seller_id') ?? req.user!.id,
          oneOf(req.body, 'source', LEAD_SOURCES, 'loja'),
          oneOf(req.body, 'stage', LEAD_STAGES, 'novo'),
          num(req.body, 'value', { min: 0 }),
          str(req.body, 'notes'),
          str(req.body, 'next_contact'),
        );
      const leadId = Number(info.lastInsertRowid);
      log.run(leadId, req.user!.id, 'etapa', 'Lead criado');
      return leadId;
    });
    res.status(201).json(getLead(id));
  });

  r.put('/:id', (req, res) => {
    const lead = getLead(idParam(req));
    const stage = oneOf(req.body, 'stage', LEAD_STAGES, lead.stage as (typeof LEAD_STAGES)[number]);
    const lostReason = str(req.body, 'lost_reason');
    if (stage === 'perdido' && !lostReason) throw new HttpError(400, 'Informe o motivo da perda.');
    tx(db, () => {
      db.prepare(
        `UPDATE leads SET vehicle_id = ?, seller_id = ?, source = ?, stage = ?, value = ?, notes = ?, next_contact = ?,
          lost_reason = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(
        int(req.body, 'vehicle_id'),
        int(req.body, 'seller_id'),
        oneOf(req.body, 'source', LEAD_SOURCES, 'loja'),
        stage,
        num(req.body, 'value', { min: 0 }),
        str(req.body, 'notes'),
        str(req.body, 'next_contact'),
        stage === 'perdido' ? lostReason : null,
        lead.id,
      );
      if (stage !== lead.stage) log.run(lead.id, req.user!.id, 'etapa', `Etapa: ${STAGE_LABEL[lead.stage]} → ${STAGE_LABEL[stage]}`);
    });
    res.json(getLead(lead.id));
  });

  r.patch('/:id/stage', (req, res) => {
    const lead = getLead(idParam(req));
    const stage = oneOf(req.body, 'stage', LEAD_STAGES);
    const lostReason = str(req.body, 'lost_reason');
    if (stage === 'perdido' && !lostReason) throw new HttpError(400, 'Informe o motivo da perda.');
    if (stage === lead.stage) {
      res.json(lead);
      return;
    }
    tx(db, () => {
      db.prepare("UPDATE leads SET stage = ?, lost_reason = ?, updated_at = datetime('now') WHERE id = ?").run(
        stage, stage === 'perdido' ? lostReason : null, lead.id,
      );
      log.run(lead.id, req.user!.id, 'etapa', `Etapa: ${STAGE_LABEL[lead.stage]} → ${STAGE_LABEL[stage]}${lostReason && stage === 'perdido' ? ` (${lostReason})` : ''}`);
    });
    res.json(getLead(lead.id));
  });

  r.post('/:id/activities', (req, res) => {
    const lead = getLead(idParam(req));
    tx(db, () => {
      log.run(lead.id, req.user!.id, oneOf(req.body, 'type', ACTIVITY_TYPES, 'nota'), str(req.body, 'description', { required: true, label: 'descrição' }));
      const next = str(req.body, 'next_contact');
      db.prepare(`UPDATE leads SET updated_at = datetime('now')${next ? ', next_contact = ?' : ''} WHERE id = ?`).run(...(next ? [next, lead.id] : [lead.id]));
    });
    res.status(201).json({ ok: true });
  });

  r.delete('/:id', (req, res) => {
    const lead = getLead(idParam(req));
    db.prepare('DELETE FROM leads WHERE id = ?').run(lead.id);
    res.json({ ok: true });
  });

  return r;
}
