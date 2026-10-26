# Pátio — Gestão de Revendas de Veículos

Sistema web completo para lojas de seminovos: estoque, avaliação de usados, anúncios, CRM de leads, vendas,
financeiro e relatórios, com vitrine pública para os clientes.

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
| **Vitrine** | Site público com os veículos disponíveis, galeria, ficha técnica e formulário de interesse |

## Tecnologia

- **Servidor:** Node.js 22.18+ (TypeScript executado nativamente), Express 5, SQLite embutido (`node:sqlite`). Não há dependências nativas para compilar.
- **Interface:** React 19 + Vite, CSS próprio com tema claro/escuro e layout responsivo.
- Os dados ficam em `data/patio.db` e as fotos em `data/uploads/`.

## Como rodar

```bash
npm install
npm run seed      # opcional: cria dados de demonstração (apaga data/patio.db)
npm run build     # compila a interface
npm start         # http://localhost:3000
```

Desenvolvimento com recarga automática: `npm run dev` (interface em http://localhost:5173).

Na primeira execução sem `seed`, é criado o usuário `admin@patio.local` / `admin123`. Defina outro com
`ADMIN_EMAIL` e `ADMIN_PASSWORD`. Troque a senha em **Configurações** após o primeiro acesso.

Acessos de demonstração (após `npm run seed`):

- `admin@patio.local` / `admin123` (administrador)
- `carla@patio.local` / `patio123` (gerente)
- `rafael@patio.local` / `patio123` (vendedor)

Variáveis de ambiente: `PORT` (padrão 3000), `DATA_DIR` (padrão `./data`), `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

## Testes

```bash
npm test          # regras de negócio e fluxo completo da API
npm run typecheck
```

## Integração com portais

A publicação automática em portais de terceiros exige credenciais e contrato de API de cada portal. O sistema
já oferece:

- o feed XML em `/api/public/feed.xml`, para portais e agregadores que importam o estoque por URL;
- o controle manual da situação, do link, das visualizações e dos contatos de cada anúncio.

Conectores diretos podem ser adicionados em `server/routes/vehicles.ts` (rota `listings/bulk`).
