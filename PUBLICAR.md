# Como colocar o Pátio no ar

Guia para publicar o sistema na internet e mandar o link para as lojas se cadastrarem.
Leva uns 20 minutos. Não precisa saber programar.

## O que você vai ter no final

- Um endereço como `https://patio-production.up.railway.app` (depois dá para usar um domínio seu, como `app.patio.com.br`).
- Qualquer loja abre `<endereço>/cadastro`, cria a conta e começa a usar. Cada loja tem um banco de dados separado.
- Você entra com seu e-mail e vê o menu **Plataforma**: lista de lojas cadastradas, último acesso e quanto cada uma está usando, com opção de suspender o acesso.
- Cópia de segurança automática de todos os bancos, uma vez por dia (guarda os últimos 14 dias).

## Passo a passo no Railway (recomendado)

1. Crie uma conta em **railway.com** entrando com sua conta do GitHub. Escolha um plano pago de entrada: o gratuito não garante disco permanente.
2. Clique em **New Project › Deploy from GitHub repo** e escolha o repositório **patio**. Se o Railway pedir, autorize o acesso a esse repositório.
3. O Railway lê o arquivo `railway.json` e monta o sistema pelo `Dockerfile` sozinho. Espere o primeiro deploy terminar (uns 3 minutos).
4. **Disco (obrigatório):** no serviço criado, abra **Settings › Volumes › Add Volume** e use o caminho de montagem **`/data`**. Sem isso, os dados somem a cada atualização.
5. **Variáveis:** em **Variables**, adicione:

   | Nome | Valor | Para quê |
   | --- | --- | --- |
   | `PLATFORM_ADMINS` | seu e-mail (o mesmo que vai usar no cadastro) | Libera o menu Plataforma só para você. Separe vários e-mails com vírgula. |

   As demais (`NODE_ENV`, `DATA_DIR`, `PORT`) já vêm prontas no `Dockerfile`.
6. **Endereço público:** em **Settings › Networking**, clique em **Generate Domain**. Esse é o link do sistema.
7. Abra `<endereço>/cadastro` e cadastre a **sua** loja de teste com o e-mail que pôs em `PLATFORM_ADMINS`. Confira se aparece o menu **Plataforma**.
8. Mande para a loja piloto o link `<endereço>/cadastro`.

### Domínio próprio (opcional)

Em **Settings › Networking › Custom Domain**, digite o domínio (ex.: `app.patio.com.br`). O Railway mostra um registro CNAME: crie esse registro no painel do Registro.br (ou de quem gerencia seu domínio). O certificado HTTPS é emitido automaticamente.

### Atualizações

Cada vez que o branch `main` do GitHub recebe uma mudança, o Railway publica de novo sozinho. Os dados ficam no volume `/data` e não são apagados.

## Outras hospedagens

Qualquer serviço que rode um `Dockerfile` e ofereça disco permanente serve (Render, Fly.io, um servidor próprio). Regras:

- monte o disco permanente em `/data`;
- rode **uma única instância** (o banco é SQLite, não pode ter duas cópias do servidor escrevendo ao mesmo tempo);
- sirva por HTTPS (o login usa cookie seguro em produção).

Num servidor próprio com Docker:

```bash
docker build -t patio .
docker run -d --name patio --restart unless-stopped -p 3000:3000 -v /srv/patio:/data -e PLATFORM_ADMINS=seu@email.com patio
```

## Variáveis de ambiente

| Nome | Padrão | O que faz |
| --- | --- | --- |
| `PLATFORM_ADMINS` | vazio | E-mails com acesso ao menu Plataforma |
| `DATA_DIR` | `/data` na imagem | Pasta dos bancos, fotos e backups |
| `PORT` | `3000` | Porta do servidor |
| `BACKUP_DAYS` | `14` | Quantos dias de backup manter |
| `BACKUPS` | ligado | `0` desliga o backup automático |
| `COOKIE_SECURE` | `1` em produção | `0` só se for testar sem HTTPS |
| `TRUST_PROXY` | `1` em produção | Quantos proxies há na frente do servidor (para identificar o IP real) |

## Onde ficam os dados

```
/data
├── control.db            empresas cadastradas e qual e-mail pertence a qual empresa
├── empresas/<nº>/patio.db  banco de cada loja
├── uploads/              fotos dos veículos e das avaliações
└── backups/AAAA-MM-DD/   cópia diária de todos os bancos
```

Os backups ficam no mesmo disco. Se a hospedagem oferecer backup do volume (o Railway oferece), ative também: assim há uma cópia fora do servidor. As fotos não entram no backup diário; ficam só no volume.

## Antes de chamar mais lojas

- Revise com um advogado a página `/termos` (texto-base em `web/src/pages/Terms.tsx`).
- Combine com a loja piloto um canal de suporte (WhatsApp) e uma conversa por semana.
- Problemas e sugestões: aba **Issues** do GitHub, modelo "Problema ou sugestão".
