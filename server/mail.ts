// Envio de e-mails pelo Resend (https://resend.com). Sem RESEND_API_KEY o sistema funciona no modo manual:
// nada é enviado e o administrador repassa senhas e links à mão.

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  readonly enabled: boolean;
  send(mail: Mail): Promise<boolean>;
}

export const noMailer: Mailer = { enabled: false, send: async () => false };

export function resendMailer(apiKey: string | undefined, from: string, fetchImpl: typeof fetch = fetch): Mailer {
  if (!apiKey) return noMailer;
  return {
    enabled: true,
    async send(mail) {
      try {
        const res = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) console.error(`[e-mail] falha ao enviar para ${mail.to}: ${res.status} ${await res.text().catch(() => '')}`);
        return res.ok;
      } catch (err) {
        console.error(`[e-mail] falha ao enviar para ${mail.to}:`, (err as Error).message);
        return false;
      }
    },
  };
}

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Modelo único dos e-mails do Pátio: título, texto, botão e link escrito por extenso. */
export function mailTemplate(o: { to: string; subject: string; title: string; lines: string[]; button: string; url: string; foot?: string }): Mail {
  const p = o.lines.map((l) => `<p style="margin:0 0 12px;line-height:1.5">${escHtml(l)}</p>`).join('');
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f2f3f5;font-family:Arial,Helvetica,sans-serif;color:#0f1113">
<div style="max-width:520px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border-radius:14px;padding:28px">
<div style="font-weight:800;font-size:20px;margin-bottom:18px">Pátio<span style="color:#16a34a">.</span></div>
<h1 style="font-size:20px;margin:0 0 14px">${escHtml(o.title)}</h1>${p}
<p style="margin:22px 0"><a href="${escHtml(o.url)}" style="background:#15803d;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px;display:inline-block">${escHtml(o.button)}</a></p>
<p style="font-size:12px;color:#5b626b;margin:0">Se o botão não funcionar, copie este endereço no navegador:<br>${escHtml(o.url)}</p>
${o.foot ? `<p style="font-size:12px;color:#5b626b;margin:16px 0 0">${escHtml(o.foot)}</p>` : ''}
</div></div></body></html>`;
  const text = `${o.title}\n\n${o.lines.join('\n')}\n\n${o.button}: ${o.url}\n${o.foot ? `\n${o.foot}\n` : ''}`;
  return { to: o.to, subject: o.subject, html, text };
}
