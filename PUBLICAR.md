# Como colocar o Pátio no ar

Guia para publicar o sistema na internet e mandar o link para as lojas se cadastrarem.
Leva uns 20 minutos. Não precisa saber programar.

## O que você vai ter no final

- Um endereço como `https://patio-production.up.railway.app` (depois dá para usar um domínio seu, como `app.patio.com.br`).
- Qualquer loja abre `<endereço>/cadastro`, cria a conta e entra direto no sistema completo, com todos os módulos. Cada loja tem um banco de dados separado.
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
   | `RESEND_API_KEY` | a chave criada no Resend (veja abaixo) | Envia convites, "esqueci minha senha" e confirmação de e-mail. Sem ela, tudo funciona no modo manual. |
   | `MAIL_FROM` | `Pátio <nao-responda@seudominio.com.br>` | Remetente dos e-mails. Só depois de verificar o domínio no Resend. |

   As demais (`NODE_ENV`, `DATA_DIR`, `PORT`) já vêm prontas no `Dockerfile`.
6. **Endereço público:** em **Settings › Networking**, clique em **Generate Domain**. Esse é o link do sistema.
7. Abra `<endereço>/cadastro` e cadastre a **sua** loja de teste com o e-mail que pôs em `PLATFORM_ADMINS`. Você cai no sistema; no rodapé do menu lateral aparece **Plataforma**.
8. Mande para a loja piloto o link `<endereço>/cadastro`.

### E-mails (Resend)

1. Crie uma conta grátis em **resend.com** (até 3.000 e-mails por mês).
2. Em **API Keys › Create API Key**, crie uma chave com permissão de envio e cole em `RESEND_API_KEY` no Railway.
3. **Enquanto não tiver domínio próprio**, o Resend só entrega e-mails para o endereço da sua própria conta Resend. Para a loja piloto, o sistema mostra a senha provisória na tela para você repassar por WhatsApp, como antes.
4. **Com domínio próprio:** em **Domains › Add Domain**, cadastre o domínio (ex.: `patio.com.br`), crie no Registro.br os registros que o Resend mostrar e espere ficar "Verified". Depois ponha `MAIL_FROM` com um endereço desse domínio. A partir daí os convites e a recuperação de senha chegam para qualquer pessoa.

O endereço usado nos links dos e-mails vem sozinho do Railway. Se usar domínio próprio para o sistema, defina também `APP_URL` (ex.: `https://app.patio.com.br`).

### Consulta FIPE

A consulta usa a API pública da parallelum (v2), gratuita. Sem chave são 500 consultas por dia para o sistema inteiro (todas as lojas somadas); o Pátio guarda as respostas por algumas horas para economizar. Crie a chave grátis em **fipe.api.br/register** e ponha em `FIPE_TOKEN` para subir para 1.000 por dia. Se o limite acabar, a loja digita o valor à mão até o dia seguinte.

### Backup fora do servidor

O backup diário fica no mesmo disco do servidor. Uma vez por semana, entre no menu **Plataforma** e clique em **Baixar backup** em cada loja: guarde o arquivo no seu computador ou no Google Drive. Se o seu plano do Railway oferecer backup do volume, ative também.

### Aviso de sistema fora do ar

Crie um monitor grátis em **uptimerobot.com** apontando para `<endereço>/api/health`. Se o sistema cair, você recebe um e-mail.

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
| `RESEND_API_KEY` | vazio | Liga o envio de e-mails (convite, esqueci minha senha, confirmação) |
| `MAIL_FROM` | `Pátio <onboarding@resend.dev>` | Remetente dos e-mails |
| `APP_URL` | endereço do Railway | Endereço público usado nos links dos e-mails |
| `FIPE_TOKEN` | vazio | Chave grátis da API FIPE (cadastro em fipe.api.br/register): sobe de 500 para 1.000 consultas por dia, somando todas as lojas |
| `FIPE_API_URL` | `https://fipe.parallelum.com.br/api/v2` | Endereço da API FIPE (formato v2) |

> **Importante (segurança):** o cadastro não confirma o e-mail. Logo depois de publicar, e antes de divulgar o link de cadastro, crie a sua conta com o mesmo e-mail que está em `PLATFORM_ADMINS`. Assim ninguém consegue cadastrar esse e-mail antes de você e ganhar acesso ao menu Plataforma.

## Onde ficam os dados

```
/data
├── control.db            empresas cadastradas e qual e-mail pertence a qual empresa
├── empresas/<nº>/patio.db  banco de cada loja (usuários e todos os registros do sistema)
├── uploads/              fotos dos veículos e das avaliações
└── backups/
    ├── AAAA-MM-DD/       cópia diária de todos os bancos (últimos 14 dias)
    └── fotos/            cópia das fotos
```

Os backups ficam no mesmo disco. Para ter uma cópia fora do servidor, baixe o backup de cada loja pelo menu Plataforma (veja acima).

## Como a loja começa

1. O dono cadastra a loja em `<endereço>/cadastro` e entra no sistema (perfil Revenda, acesso a tudo).
2. Em **Configurações › Loja**, completa endereço, telefone e dados fiscais.
3. Em **Configurações › Usuários**, adiciona a equipe: o sistema cria o login e mostra uma senha provisória para mandar por WhatsApp.
4. Os carros entram por **Avaliações › Nova avaliação** e seguem a esteira até o anúncio.
5. Para aparecer na vitrine pública (`<endereço>/v/<endereço-da-loja>`), o carro precisa estar em estoque, com preço, e com o canal **Site da loja** ligado nos anúncios.

## Antes de chamar mais lojas

- Revise com um advogado a página `/termos` (texto-base em `web/src/pages/Terms.tsx`).
- Combine com a loja piloto um canal de suporte (WhatsApp) e uma conversa por semana.
- Problemas e sugestões: aba **Issues** do GitHub, modelo "Problema ou sugestão".

## O que já funciona de verdade e o que ainda é manual

| Funciona | Manual ou em breve |
| --- | --- |
| Estoque, avaliação, precificação, serviços, recebimento, negociações, contratos (PDF e Word), financeiro, CRM, clientes, relatórios, chaves por etiqueta QR, site da loja e feed XML, consulta FIPE, importação de planilha | Publicação nos portais (marque à mão onde o carro está anunciado), consulta veicular, consulta de mercado, NF-e, assinatura digital, claviculário IdentKey, avisos por WhatsApp |
