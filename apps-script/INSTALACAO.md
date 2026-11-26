# Instalação da planilha + backend (faça uma vez)

Use a **conta Google do hospital**.

## 1. Criar a planilha
1. Acesse sheets.google.com → **Em branco**.
2. Dê o nome **Controle Patrimonial**.
3. Menu **Arquivo → Configurações** → Fuso horário: **(GMT-03:00) São Paulo** → Salvar.

## 2. Colar o código
1. Menu **Extensões → Apps Script**.
2. No topo, renomeie o projeto para **Patrimônio API**.
3. Apague tudo que estiver em `Código.gs` e cole o conteúdo de `Codigo.gs`.
4. Clique no disquete (Salvar).

## 3. Configurar a planilha
1. Na barra de cima, escolha a função **configurarPlanilha** e clique **Executar**.
2. Vai pedir autorização: **Revisar permissões** → escolha a conta →
   aparece "O Google não verificou este app" → **Avançado** → **Acessar Patrimônio API (não seguro)** → **Permitir**.
   (É normal: o app é seu e o Google só não o revisou.)
3. Embaixo, no **Registro de execução**, aparece o **token**. Copie e guarde.
   Você também pode ver depois pela planilha: menu **Patrimônio → Mostrar token do app**.

## 4. Publicar como Web App
1. Botão azul **Implantar → Nova implantação**.
2. Na engrenagem, escolha **App da Web**.
3. Descrição: `v1` · Executar como: **Eu** · Quem pode acessar: **Qualquer pessoa**.
4. **Implantar** → copie a **URL do app da Web** (termina em `/exec`).

> Se a opção "Qualquer pessoa" não aparecer (bloqueio do TI na conta do hospital), me avise que ajustamos.

## 5. Testar
Abra no navegador (troque URL e TOKEN):
```
URL_DO_APP?action=ping&token=TOKEN
```
Deve aparecer: `{"ok":true,...,"msg":"Conectado","planilha":"Controle Patrimonial"}`

## Quando eu mudar o código depois
Cole o novo código → Salvar → **Implantar → Gerenciar implantações** → lápis → Versão: **Nova versão** → Implantar.
Assim a URL continua a mesma.
