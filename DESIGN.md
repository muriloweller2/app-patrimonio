# Design system — App Patrimônio

Tokens vivem em `css/estilo.css` (`:root`). Tema claro e escuro automáticos (segue o celular).

## Cores
| Token | Valor | Uso |
|---|---|---|
| `--cor-primaria` | #1f4e5f | Topo, botões principais, cabeçalho da planilha |
| `--cor-destaque` | #2bb39a | Foco, item ativo (escuro), status online |
| `--cor-incorporar` | #1e9e6a | Incorporar / sucesso |
| `--cor-alterar` | #2f6fdb | Alterar / transferir |
| `--cor-desincorporar` | #d9483b | Desincorporar / erro |
| `--cor-aviso` | #e0a100 | Offline, pendências |

Mesmas cores de ação nos blocos da aba "Por Dia" da planilha (verde/amarelo/vermelho claros).

## Tipografia e medidas
- Fonte do sistema (sem download, funciona offline). Base 16px; títulos 22px.
- Raio 16px (cartões) / 10px (campos e botões). Espaçamento base 16px.
- Alvos de toque ≥ 48px; campos e botões com 50px de altura (uso com uma mão, em pé).
- Navegação: 4 abas fixas embaixo (Início, Bens, Cadastros, Ajustes).

## Componentes (classes)
`.cartao`, `.acao` (botão grande com ícone colorido via `--c`), `.aviso`, `.resumo`,
`.campo` + `.entrada`, `.botao` (`--sec`, `--icone`, `--bloco`), `.resultado.ok/.erro`, `.toast`, `.vazio`.
Ícones: `js/icones.js` (SVG de traço 24px).
