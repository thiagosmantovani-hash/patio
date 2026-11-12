# Pátio · protótipo navegável

Protótipo de um sistema de gestão para revendas de veículos (garagens de seminovos), usado para validar telas, fluxos e regras antes de construir a versão definitiva.

**Abra o protótipo:** use o link do GitHub Pages que aparece na descrição deste repositório.

Tudo roda no navegador, sem login e sem servidor. Os dados são fictícios e ficam salvos só no seu navegador. Para recomeçar, use **Restaurar exemplo** no canto inferior esquerdo.

## O que dá para testar

| Área | O que existe |
| --- | --- |
| **Painel** | Indicadores do estoque, valor de estoque x custo em gráfico, origem dos atendimentos, veículos parados há mais tempo e agenda |
| **Estoque** | Veículos com a esteira de 8 etapas (avaliação, precificação, negociação de entrada, perícia, recebimento, serviços, anúncios, negociação de saída), avaliação em 9 passos, serviços em quadro, consulta veicular e anúncios por portal |
| **Precificação** | Extrato FIPE dos últimos 6 meses com variação mês a mês, consulta de mercado do modelo (média, mediana, faixa e média ajustada pela KM) e valor sugerido de compra calculado pela FIPE, pelo mercado ou por valor manual |
| **Fotos** | Sessão guiada de fotos de entrada no recebimento (14 fotos, KM, combustível e avarias) e galeria do anúncio reordenável arrastando com o mouse, com envio de fotos reais |
| **Comercial** | Atendimentos (CRM) por etapa com distribuição por fila, negociações (venda, troca, compra, consignação) com geração de contratos em PDF e Word, minuta antes da aprovação e NF-e, intermediação entre particulares, clientes e site da loja |
| **Financeiro** | Títulos a pagar e a receber, recorrência, extrato por conta bancária, adiantamentos, documentação e serviços agregados, ordens de serviço, retorno de financiamento e notas fiscais |
| **Configurações** | Usuários e perfis de acesso, fornecedores, portais de anúncio, CRM (origens, motivos, tags, quadros), plano de contas, custos, contas bancárias, bancos, notas fiscais, consulta veicular e exportação |
| **Integrações › Chaves** | Controle de chaves com etiqueta QR: quem está com cada chave, por qual motivo e desde quando. Retirada e devolução, leitura do QR pela câmera do celular, checklist de vistoria com avarias, fotos e assinaturas, agenda de reservas da frota, painel de test drive, cadastro de tags, quadros, motivos e regras por usuário |
| **Integrações › Conexões** | Liga o módulo de chaves, escolhe entre etiquetas QR ou claviculário IdentKey, automações com Serviços, CRM e Negociações, e chaves de API para parceiros |

### Roteiro rápido do módulo de chaves

1. Pelo celular, abra **Chaves › Ler etiqueta › Ler com a câmera** e aponte para um QR impresso em **Tags e etiquetas › Imprimir etiquetas**. Sem câmera, digite o código (ex.: PT-0003).
2. Retire a chave para **Test drive**: o atendimento do cliente aparece no CRM e o checklist abre com fotos e assinaturas.
3. Devolva a chave e marque uma avaria que não existia na retirada: ela vira item em **Serviços** do veículo.
4. Retire outra chave para **Lavagem** e veja a ordem de serviço começar sozinha.
5. Finalize uma negociação de venda e confira que a tag foi liberada.

Dica: no topo à direita, troque o usuário para ver o sistema como um vendedor, um avaliador ou o financeiro. Cada perfil enxerga módulos diferentes.

## O que é simulado

Envio de convites, assinatura digital, emissão de NF-e, certificado digital, publicação nos portais, resultados da consulta veicular, a amostra de anúncios da consulta de mercado e a conexão com o claviculário IdentKey. As fotos (entrada, anúncio e avarias) ficam só no seu navegador. Na versão definitiva essas partes se conectam aos serviços reais.

## Como ajudar

1. Navegue como se estivesse trabalhando numa loja: avalie um carro, crie uma negociação, mova um atendimento, dê baixa num título.
2. Anote o que ficou confuso, o que falta e o que sobra.
3. Abra uma **Issue** neste repositório (aba Issues › New issue) com:
   - a tela (ex.: Negociações › etapa Pagamento)
   - o que você tentou fazer
   - o que esperava e o que aconteceu
   - um print, se ajudar

Sugestões de regra de negócio de quem trabalha em revenda são as mais valiosas.
