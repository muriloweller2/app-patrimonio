# App Patrimônio — Controle patrimonial hospitalar (mobile)

App de uso pessoal do responsável pelo patrimônio de um hospital. Objetivo: ir aos setores com o
celular, conferir e cadastrar bens, e mandar tudo organizado para uma planilha Google Sheets que
facilita o lançamento no sistema oficial (Wareline, desktop e fechado — **sem integração direta**).

## Regras de trabalho
- Responder sempre em **português do Brasil**.
- Construir **por etapas**; o usuário define e aprova cada uma. Não adiantar etapas sem pedir.
- Diagnosticar antes de mudar. Nunca dizer que algo foi testado se não foi.
- **Custo zero**: só serviços gratuitos. Não introduzir nada pago nem com risco de cobrança.
- Economizar tokens: respostas objetivas, avisar o usuário quando for bom usar /compact ou /clear.
- Layout bonito, limpo e intuitivo, pensado para uso com **uma mão, em pé, no celular**.

## Arquitetura (decidida em 2026-11-26)
| Parte | Tecnologia | Motivo |
|---|---|---|
| App | PWA em HTML/CSS/JS puro (ES modules, sem build) | Instala na tela inicial, funciona offline, fácil de manter |
| Hospedagem | GitHub Pages (repo público) | Grátis, HTTPS (necessário para câmera e PWA) |
| Backend | Google Apps Script (Web App) vinculado à planilha | Grátis, escreve direto no Sheets e no Drive |
| Banco de dados | A própria planilha Google Sheets | Uso de 1 pessoa; a planilha já é o produto final |
| Offline | IndexedDB (fila de envio + cache dos bens) | Internet instável em alguns setores |
| Código de barras | `BarcodeDetector` nativo, com fallback ZXing (local, sem CDN) | Plaquetas têm número + código de barras (leitura ainda não confirmada) |
| Fotos | Opcionais; comprimidas no celular, salvas numa pasta do Drive, link na planilha | 15 GB grátis |

Conta Google: **conta institucional do hospital criada pelo usuário** (dona da planilha, do script e do Drive).

### Segurança (repo é público)
- **Nunca** colocar no código a URL do Web App nem o token. Ficam salvos só no celular (tela de Configurações).
- O Apps Script valida um token secreto em toda requisição.
- POST com `Content-Type: text/plain` para evitar preflight CORS do Apps Script.

## Campos do bem (definidos em 2026-11-26, a partir da tela "Bens de Patrimônio Imobilizado" do Wareline)
Ordem igual à do Wareline, para facilitar o lançamento:
Nº de Patrimônio, Nº de Patrimônio (alternativo), Grupo (cód + nome), Subgrupo (cód + nome),
Descrição do Bem, Marca, Modelo, Nº de Série, Especificação (cor, dimensões etc.),
Situação (valores pendentes), Incorporado por doação (sim/não), Localização, Foto (opcional).
- Fora do app: Tipo, Estado de Conservação, aquisição/NF, valores/depreciação, responsável, moeda, rateio, filial, operador.
- **Desincorporação**: só Nº de Patrimônio + Descrição (data automática). Se o bem existe em Bens, vira status DESINCORPORADO.
- Grupos/subgrupos/localizações: o usuário cadastra aos poucos pelo app (não há como exportar do Wareline).
- Data/hora de cadastro e alteração: automáticas.

## Cadastros auxiliares (gerenciados no próprio app)
- **Grupos**: código + nome.
- **Subgrupos**: código + nome, ligados a um grupo (a lista filtra pelo grupo escolhido).
- **Localizações**: **só o nome** (sem código, sem centro de custo). Seleção com **campo de busca**, nada de rolar listas longas.
## Planilha (implementada em `apps-script/Codigo.gs`, função `configurarPlanilha`)
- **Por Dia**: data em B1 + uma fórmula VSTACK/FILTER com os blocos Incorporações / Alterações / Desincorporações do dia.
- **Bens**: estado atual, 1 linha por nº de patrimônio (Status ATIVO/DESINCORPORADO).
- **Incorporações**, **Alterações** (1 linha por campo alterado, com valor anterior/novo), **Desincorporações**:
  registros com Data, Hora, checkbox "Lançado no Wareline" e ID da operação (evita duplicar reenvios da fila offline).
- **Grupos**, **Subgrupos**, **Localizações**: cadastros auxiliares.
- Data/hora = momento em que foi feito no celular (`quando`), não o do envio.

## API do Apps Script
POST (text/plain, JSON) `{token, action, ...}` ou `{token, action:'lote', ops:[...]}`. GET aceita o mesmo via query (usado no ping).
Ações: `ping`, `dados`, `incorporar {id,quando,bem,foto?}`, `alterar {id,quando,bem,foto?}`, `desincorporar {id,quando,patrimonio,descricao}`,
`salvarGrupo/excluirGrupo`, `salvarSubgrupo/excluirSubgrupo`, `salvarLocal/excluirLocal` (salvar aceita `anterior` = chave antiga para renomear).
`foto = {base64, mime}` → pasta "Patrimônio - Fotos" no Drive, link na coluna Foto.

## Etapas
1. Campos e planilha (definir campos iguais ao Wareline) + Apps Script + teste de conexão
2. Esqueleto do app (PWA, design system, tela de configurações)
3. Incorporação + fila offline
4. Leitura do código de barras
5. Fotos
6. Busca, alteração e transferência de setor
7. Desincorporação
8. Visões por data e conferência para lançar no Wareline

## Estado atual
- Etapa 0 concluída: arquitetura definida.
- Etapa 1 concluída (2026-11-26): planilha configurada e ping OK na conta do hospital.
  Dica de suporte: autorização em branco = várias contas Google no Chrome → usar janela anônima.
- Etapa 2 (base do app): feita em `index.html`, `css/`, `js/` (app.js = rotas por hash; telas em `js/telas/`), `sw.js`, `manifest.webmanifest`, `icons/`.
  Tela de Ajustes (URL + token + Testar) pronta; demais telas são "em breve". Visual em `DESIGN.md`.
  **Ao adicionar arquivo JS/CSS, incluir na lista do `sw.js` e subir o número de `CACHE`.**
  Publicado: repo github.com/muriloweller2/app-patrimonio (público, branch main, usuário usa GitHub Desktop)
  → https://muriloweller2.github.io/app-patrimonio/  Usuário publica com GitHub Desktop (commit + push).
- Etapa 3 (2026-11-26): fila offline (`js/db.js`, `js/sync.js`, `js/dados.js` = cache local + `aplicarLocal`),
  janelas `js/componentes.js` (escolher com busca / formulario), `js/cadastros.js`, telas incorporar/cadastros/pendencias.
  Decisões: **Situação, Grupo, Subgrupo e Localização são listas fixas cadastradas SÓ na aba Cadastros** (na Incorporar apenas se escolhe).
  Grupo/Subgrupo: **nome obrigatório, código opcional**; identificação pelo nome; subgrupo liga ao grupo pelo nome (renomear grupo propaga).
  Abas: Grupos [Nome, Código], Subgrupos [Grupo, Nome, Código], Situações [Nome].
  Obrigatórios na incorporação: nº patrimônio, descrição, grupo, subgrupo, localização. Após salvar mantém só a localização.
  Fila: envia em lote ao abrir, ao voltar internet/app e a cada 1 min se houver pendente; erros da planilha ficam em #/pendencias.
  Só verificado com node (sintaxe/imports) — **aguardando teste real do usuário**.
