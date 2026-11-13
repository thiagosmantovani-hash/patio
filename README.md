# Pátio — Gestão de Revendas de Veículos

Sistema web para lojas de seminovos. Qualquer loja se cadastra em `/cadastro`, entra no sistema completo e começa a usar.
Cada empresa tem o próprio banco de dados. Para colocar no ar, siga o guia [PUBLICAR.md](PUBLICAR.md).

## O que tem

Todos os módulos estão liberados para todas as lojas:

| Área | Módulos |
| --- | --- |
| **Operação** | Painel, avaliações (9 passos), veículos com a esteira de 8 etapas, precificação (extrato FIPE, consulta de mercado, valor sugerido de compra), sessão de fotos de entrada, serviços, consulta veicular, anúncios por portal com galeria arrastável |
| **Comercial** | Atendimentos (CRM com quadros e fila), negociações (venda, troca, compra, consignação) com contratos em PDF e Word, intermediação, clientes, site da loja |
| **Gestão** | Financeiro (títulos, recorrência, extrato, adiantamentos, retornos), relatórios, configurações (usuários, perfis e permissões, fornecedores, portais, CRM, plano de contas, custos, contas bancárias, notas fiscais) |
| **Integrações** | Chaves (etiquetas QR, retirada e devolução, checklist com fotos, reservas, test drive) e conexões |
| **Em volta do sistema** | Cadastro de lojas com 30 dias de teste, login, vitrine pública de cada loja em `/v/<endereço-da-loja>`, feed XML, menu Plataforma para o dono do Pátio |

O que ainda é **simulado** dentro do sistema: publicação automática nos portais, emissão de NF-e e certificado digital, assinatura digital, resultados da consulta veicular, amostra de anúncios da consulta de mercado, conexão com o claviculário IdentKey e envio de convites por e-mail (o administrador recebe uma senha provisória para repassar).

## Como funciona por dentro

- **Servidor:** Node.js 22.18+ (TypeScript executado nativamente), Express 5, SQLite embutido (`node:sqlite`).
- **Sistema da loja (`/app`):** a interface completa vem de `prototipo/index.html`. Aberta pelo servidor, ela recebe os dados da
  loja embutidos na página e passa a salvar no servidor: cada veículo, cliente, negociação e atendimento é um registro próprio,
  gravado alguns instantes depois de cada alteração. A cada 8 segundos o navegador busca o que os colegas mudaram. Os números de
  registro vêm em blocos reservados pelo servidor, então duas pessoas nunca criam o mesmo número. Fotos vão para `/uploads`.
  Aberto direto como arquivo (ou no GitHub Pages), o mesmo HTML continua funcionando como protótipo com dados de exemplo.
- **Em volta (React + Vite, pasta `web`):** login, cadastro, termos, vitrine pública e o painel da plataforma.
- **Dados:** banco central `data/control.db` (empresas e e-mail de login de cada usuário) e um banco por empresa em
  `data/empresas/<nº>/patio.db` (usuários, sessões e os registros do sistema). Backup diário em `data/backups/`.
- **Usuários:** o login é real (senha cifrada, sessão por cookie). Perfil e permissões de cada pessoa são definidos dentro do
  sistema, em Configurações › Usuários e Perfis. Criar um usuário ali gera o login e mostra uma senha provisória.

## Como rodar

```bash
npm install
npm run build     # compila as telas em volta do sistema
npm start         # http://localhost:3000  → cadastre uma loja em /cadastro
```

Desenvolvimento com recarga automática: `npm run dev` (telas em volta em http://localhost:5173; o sistema em http://localhost:3000/app).

Variáveis de ambiente: veja a tabela em [PUBLICAR.md](PUBLICAR.md). As principais: `PORT` (padrão 3000),
`DATA_DIR` (padrão `./data`) e `PLATFORM_ADMINS` (seu e-mail, para ver o menu Plataforma).

## Testes

```bash
npm test          # cadastro, isolamento entre empresas, gravação do sistema, vitrine e regras da API
npm run typecheck
```

## Integração com portais

A publicação automática em portais de terceiros exige credenciais e contrato de API de cada portal. Por enquanto o sistema
oferece o feed XML de cada loja em `/api/public/<endereço-da-loja>/feed.xml`, com os veículos em estoque marcados para o site,
para portais e agregadores que importam o estoque por URL.
