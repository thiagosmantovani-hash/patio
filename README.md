# Pátio — Gestão de Revendas de Veículos

Sistema web completo para lojas de seminovos: estoque, avaliação de usados, anúncios, CRM de leads, vendas,
financeiro e relatórios, com vitrine pública para os clientes.

**Multiempresa:** qualquer loja se cadastra em `/cadastro` e começa a usar na hora. Cada empresa tem o próprio
banco de dados. Para colocar no ar, siga o guia [PUBLICAR.md](PUBLICAR.md).

## Funcionalidades

| Módulo | O que faz |
| --- | --- |
| **Painel** | Estoque, valor investido, vendas e lucro do mês, gráfico de 6 meses, carros parados há 60+ dias, funil e retornos do dia |
| **Estoque** | Cadastro completo do veículo, fotos (ordem e capa), opcionais, situação (preparação → disponível → reservado → vendido), dias em estoque e lucro previsto/realizado |
| **Preparação** | Custos por veículo com valor previsto × real e desvio |
| **Avaliações** | Checklist guiado em 8 seções (frente, laterais, traseira, pneus, interior, mecânica, documentação), fotos por seção (abre a câmera no celular) e preço sugerido = referência − margem − reparos. Com um clique a avaliação vai para o estoque, e os reparos viram custos previstos |
| **Anúncios** | Matriz veículo × canal (OLX, Webmotors, iCarros etc., configuráveis), publicação em lote, visualizações e contatos por canal, feed XML do estoque |
| **Leads** | Funil kanban com arrastar e soltar, origem, vendedor, próximo contato, histórico de interações, motivo de perda e WhatsApp em um clique. Leads da vitrine entram sozinhos |
| **Clientes** | Ficha com compras, leads e avaliações |
| **Vendas** | Entrada + financiamento + troca, com validação de que o pagamento fecha o valor da venda. O carro da troca entra no estoque, a comissão é calculada pelo % do vendedor e os lançamentos financeiros são gerados automaticamente. Inclui recibo para impressão e cancelamento com estorno |
| **Financeiro** | Contas a pagar e a receber, baixa e estorno, vencidos |
| **Relatórios** | Vendas e lucro por veículo, vendedor e forma de pagamento; conversão por origem de lead; motivos de perda; preparação prevista × real; desempenho por canal; idade do estoque; exportação CSV |
| **Usuários** | Perfis administrador, gerente e vendedor (vendedor não vê custos, financeiro nem relatórios), com % de comissão |
| **Vitrine** | Site público de cada loja em `/v/<endereço-da-loja>`, com os veículos disponíveis, galeria, ficha técnica e formulário de interesse |
| **Cadastro de empresas** | Cadastro aberto com aceite dos termos, 30 dias de teste, primeiros passos no painel e e-mail único por usuário em toda a plataforma |
| **Plataforma** | Menu do dono do Pátio (e-mails em `PLATFORM_ADMINS`): empresas cadastradas, último uso, volume de uso e suspensão de acesso |

## Tecnologia

- **Servidor:** Node.js 22.18+ (TypeScript executado nativamente), Express 5, SQLite embutido (`node:sqlite`). Não há dependências nativas para compilar.
- **Interface:** React 19 + Vite, CSS próprio com tema claro/escuro e layout responsivo.
- Um banco central (`data/control.db`) guarda as empresas e o e-mail de login de cada usuário; cada empresa tem o
  próprio banco em `data/empresas/<nº>/patio.db`. As fotos ficam em `data/uploads/`.
- Backup diário de todos os bancos em `data/backups/`, cookie seguro em produção, limite de tentativas de login e de cadastro.

## Como rodar

```bash
npm install
npm run seed      # opcional: cria uma empresa de demonstração com dados de exemplo
npm run build     # compila a interface
npm start         # http://localhost:3000  → cadastre uma loja em /cadastro
```

Desenvolvimento com recarga automática: `npm run dev` (interface em http://localhost:5173).

Não existe mais usuário padrão: a primeira conta é criada pelo cadastro da loja. Instalações antigas (banco único em
`data/patio.db`) são migradas sozinhas para a empresa nº 1 na primeira execução, com os mesmos usuários.

Acessos da empresa de demonstração (após `npm run seed`):

- `admin@patio.local` / `admin12345` (administrador)
- `carla@patio.local` / `patio123` (gerente)
- `rafael@patio.local` / `patio123` (vendedor)

Variáveis de ambiente: veja a tabela em [PUBLICAR.md](PUBLICAR.md). As principais: `PORT` (padrão 3000),
`DATA_DIR` (padrão `./data`) e `PLATFORM_ADMINS` (seu e-mail, para ver o menu Plataforma).

## Testes

```bash
npm test          # regras de negócio e fluxo completo da API
npm run typecheck
```

## Integração com portais

A publicação automática em portais de terceiros exige credenciais e contrato de API de cada portal. O sistema
já oferece:

- o feed XML de cada loja em `/api/public/<endereço-da-loja>/feed.xml`, para portais e agregadores que importam o estoque por URL;
- o controle manual da situação, do link, das visualizações e dos contatos de cada anúncio.

Conectores diretos podem ser adicionados em `server/routes/vehicles.ts` (rota `listings/bulk`).
