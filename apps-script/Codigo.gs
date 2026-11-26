/**
 * App Patrimônio — backend (Google Apps Script vinculado à planilha)
 *
 * Instalação: veja apps-script/INSTALACAO.md
 * Toda requisição precisa do token salvo nas Propriedades do script (gerado por configurarPlanilha).
 */

const ABAS = {
  BENS: 'Bens',
  INC: 'Incorporações',
  ALT: 'Alterações',
  DES: 'Desincorporações',
  CONSULTA: 'Consulta',
  SETOR: 'Por Setor',
  GRUPOS: 'Grupos',
  SUBGRUPOS: 'Subgrupos',
  LOCAIS: 'Localizações',
  SITUACOES: 'Situações',
};

// Campos do bem, na ordem do Wareline: [chave usada pelo app, cabeçalho na planilha]
const CAMPOS = [
  ['patrimonio', 'Nº Patrimônio'],
  ['patrimonioAlt', 'Nº Patrimônio Alt.'],
  ['grupoCod', 'Cód. Grupo'],
  ['grupo', 'Grupo'],
  ['subgrupoCod', 'Cód. Subgrupo'],
  ['subgrupo', 'Subgrupo'],
  ['descricao', 'Descrição'],
  ['marca', 'Marca'],
  ['modelo', 'Modelo'],
  ['serie', 'Nº Série'],
  ['especificacao', 'Especificação'],
  ['situacao', 'Situação'],
  ['doacao', 'Doação'],
  ['localizacao', 'Localização'],
  ['foto', 'Foto'],
];
const ROTULOS = CAMPOS.map(c => c[1]);
const LANCADO = 'Lançado no Wareline';

const CABECALHOS = {
  [ABAS.BENS]: [...ROTULOS, 'Status', 'Cadastrado em', 'Atualizado em'],
  [ABAS.INC]: ['Data', 'Hora', ...ROTULOS, LANCADO, 'ID'],
  [ABAS.ALT]: ['Data', 'Hora', 'Nº Patrimônio', 'Descrição', 'Campo', 'Valor anterior', 'Novo valor', LANCADO, 'ID'],
  [ABAS.DES]: ['Data', 'Hora', 'Nº Patrimônio', 'Descrição', LANCADO, 'ID'],
  [ABAS.GRUPOS]: ['Nome', 'Código'],
  [ABAS.SUBGRUPOS]: ['Grupo', 'Nome', 'Código'],
  [ABAS.LOCAIS]: ['Nome'],
  [ABAS.SITUACOES]: ['Nome'],
};

// ───────────────────────── Entrada HTTP ─────────────────────────

function doGet(e) {
  return responder(processar((e && e.parameter) || {}));
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, erro: 'Requisição inválida (JSON).' });
  }
  return responder(processar(req));
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function processar(req) {
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || req.token !== token) return { ok: false, erro: 'Token inválido.' };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ops = req.action === 'lote' ? (req.ops || []) : [req];
    const resultados = ops.map(executarSeguro);
    // Se mexeu em bens, atualiza as abas Consulta e Por Setor
    if (ops.some(o => ['incorporar', 'alterar', 'desincorporar'].includes(o.action))) {
      try { atualizarVisoes(planilha()); } catch (err) { /* não impede o envio */ }
    }
    return req.action === 'lote' ? { ok: true, resultados } : resultados[0];
  } finally {
    lock.releaseLock();
  }
}

function executarSeguro(op) {
  try {
    return Object.assign({ ok: true, id: op.id || null }, executar(op));
  } catch (err) {
    return { ok: false, id: op.id || null, erro: err.message };
  }
}

function executar(op) {
  switch (op.action) {
    case 'ping': return { msg: 'Conectado', planilha: planilha().getName() };
    case 'dados': return lerDados();
    case 'incorporar': return incorporar(op);
    case 'alterar': return alterar(op);
    case 'desincorporar': return desincorporar(op);
    case 'salvarGrupo': return salvarGrupo(op);
    case 'excluirGrupo': return excluirAux(ABAS.GRUPOS, [op.nome]);
    case 'salvarSubgrupo': return salvarAux(ABAS.SUBGRUPOS, 2, [op.grupo, op.nome, op.codigo], op.anterior);
    case 'excluirSubgrupo': return excluirAux(ABAS.SUBGRUPOS, [op.grupo, op.nome]);
    case 'salvarLocal': return salvarAux(ABAS.LOCAIS, 1, [op.nome], op.anterior);
    case 'excluirLocal': return excluirAux(ABAS.LOCAIS, [op.nome]);
    case 'salvarSituacao': return salvarAux(ABAS.SITUACOES, 1, [op.nome], op.anterior);
    case 'excluirSituacao': return excluirAux(ABAS.SITUACOES, [op.nome]);
    default: throw new Error('Ação desconhecida: ' + op.action);
  }
}

// ───────────────────────── Operações com bens ─────────────────────────

function incorporar(op) {
  const b = normalizarBem(op.bem);
  if (!b.patrimonio) throw new Error('Informe o nº de patrimônio.');
  if (!b.descricao) throw new Error('Informe a descrição do bem.');
  if (jaProcessado(ABAS.INC, op.id)) return { msg: 'Já enviado antes', duplicado: true };
  conferirNovo(b.patrimonio);

  if (op.foto) b.foto = salvarFoto(op.foto, b.patrimonio);
  const m = momento(op.quando);
  const valores = CAMPOS.map(c => b[c[0]] || '');

  aba(ABAS.BENS).appendRow([...valores, 'ATIVO', m.dataHora, '']);
  registrar(ABAS.INC, [m.data, m.hora, ...valores, false, op.id || '']);
  return { msg: 'Incorporado', foto: b.foto || '' };
}

function alterar(op) {
  const novo = normalizarBem(op.bem);
  if (!novo.patrimonio) throw new Error('Informe o nº de patrimônio.');
  if (jaProcessado(ABAS.ALT, op.id)) return { msg: 'Já enviado antes', duplicado: true };
  const linha = acharLinhaBem(novo.patrimonio);
  if (!linha) throw new Error('Patrimônio ' + novo.patrimonio + ' não encontrado em Bens.');

  if (op.foto) novo.foto = salvarFoto(op.foto, novo.patrimonio);
  const sh = aba(ABAS.BENS);
  const atual = sh.getRange(linha, 1, 1, CAMPOS.length).getDisplayValues()[0];
  const m = momento(op.quando);
  const descricao = novo.descricao || atual[CAMPOS.findIndex(c => c[0] === 'descricao')];
  let mudancas = 0;

  CAMPOS.forEach(([chave, rotulo], i) => {
    if (chave === 'patrimonio' || !(chave in novo)) return;
    const antes = String(atual[i] || '');
    const depois = String(novo[chave] || '');
    if (antes === depois) return;
    sh.getRange(linha, i + 1).setValue(depois);
    registrar(ABAS.ALT, [m.data, m.hora, novo.patrimonio, descricao, rotulo, antes, depois, false, op.id || '']);
    mudancas++;
  });

  if (mudancas) sh.getRange(linha, CABECALHOS[ABAS.BENS].length).setValue(m.dataHora);
  return { msg: mudancas ? mudancas + ' campo(s) alterado(s)' : 'Nada mudou', mudancas };
}

function desincorporar(op) {
  const patrimonio = texto(op.patrimonio);
  if (!patrimonio) throw new Error('Informe o nº de patrimônio.');
  if (jaProcessado(ABAS.DES, op.id)) return { msg: 'Já enviado antes', duplicado: true };

  const m = momento(op.quando);
  let descricao = texto(op.descricao);
  const linha = acharLinhaBem(patrimonio);
  if (linha) {
    const sh = aba(ABAS.BENS);
    const cab = CABECALHOS[ABAS.BENS];
    const status = sh.getRange(linha, cab.indexOf('Status') + 1);
    if (status.getValue() === 'DESINCORPORADO') throw new Error('Patrimônio ' + patrimonio + ' já foi desincorporado.');
    if (!descricao) descricao = sh.getRange(linha, cab.indexOf('Descrição') + 1).getDisplayValue();
    status.setValue('DESINCORPORADO');
    sh.getRange(linha, cab.length).setValue(m.dataHora);
  }
  else {
    const des = acharDesincorporado(patrimonio);
    if (des) throw new Error('Patrimônio ' + patrimonio + ' já foi desincorporado em ' + des.data + '.');
  }
  if (!descricao) throw new Error('Informe a descrição do bem.');

  registrar(ABAS.DES, [m.data, m.hora, patrimonio, descricao, false, op.id || '']);
  return { msg: 'Desincorporado' };
}

function lerDados() {
  const linhas = (nome) => {
    const sh = aba(nome);
    return sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getDisplayValues();
  };
  const cabBens = CABECALHOS[ABAS.BENS];
  return {
    bens: linhas(ABAS.BENS).map(r => {
      const o = {};
      CAMPOS.forEach(([chave], i) => (o[chave] = r[i]));
      o.status = r[cabBens.indexOf('Status')];
      o.cadastradoEm = r[cabBens.indexOf('Cadastrado em')];
      o.atualizadoEm = r[cabBens.indexOf('Atualizado em')];
      return o;
    }),
    grupos: linhas(ABAS.GRUPOS).map(r => ({ nome: r[0], codigo: r[1] })),
    subgrupos: linhas(ABAS.SUBGRUPOS).map(r => ({ grupo: r[0], nome: r[1], codigo: r[2] })),
    locais: linhas(ABAS.LOCAIS).map(r => r[0]),
    situacoes: linhas(ABAS.SITUACOES).map(r => r[0]),
    desincorporados: linhas(ABAS.DES).map(r => ({ data: r[0], patrimonio: r[2], descricao: r[3] })),
  };
}

/** Recusa incorporar nº que já existe em Bens ou que já foi desincorporado. */
function conferirNovo(patrimonio) {
  const linha = acharLinhaBem(patrimonio);
  if (linha) {
    const cab = CABECALHOS[ABAS.BENS];
    const r = aba(ABAS.BENS).getRange(linha, 1, 1, cab.length).getDisplayValues()[0];
    const col = (c) => r[cab.indexOf(c)];
    if (col('Status') === 'DESINCORPORADO') {
      throw new Error('Patrimônio ' + patrimonio + ' foi desincorporado em ' + col('Atualizado em').slice(0, 10) + '. Não pode ser incorporado de novo.');
    }
    throw new Error('Patrimônio ' + patrimonio + ' já está incorporado: ' + col('Descrição') + ' – ' + col('Localização') + '.');
  }
  const des = acharDesincorporado(patrimonio);
  if (des) throw new Error('Patrimônio ' + patrimonio + ' foi desincorporado em ' + des.data + '. Não pode ser incorporado de novo.');
}

function acharDesincorporado(patrimonio) {
  const sh = aba(ABAS.DES);
  if (sh.getLastRow() < 2) return null;
  const achado = sh.getRange(2, 3, sh.getLastRow() - 1, 1).createTextFinder(patrimonio).matchEntireCell(true).findNext();
  return achado ? { data: sh.getRange(achado.getRow(), 1).getDisplayValue() } : null;
}

// ───────────────────────── Cadastros auxiliares ─────────────────────────

/** Insere ou atualiza uma linha identificada pelas primeiras `nChave` colunas (obrigatórias; as demais são opcionais). */
function salvarAux(nome, nChave, valores, anterior) {
  valores = valores.map(texto);
  if (valores.slice(0, nChave).some(v => !v)) throw new Error('Preencha o nome.');
  const chaveNova = valores.slice(0, nChave);
  const linhaAntiga = anterior ? acharLinhaAux(nome, anterior) : 0;
  const linhaExistente = acharLinhaAux(nome, chaveNova);
  if (linhaExistente && linhaExistente !== linhaAntiga && anterior) throw new Error('Já existe um cadastro com esse nome.');

  const sh = aba(nome);
  const linha = linhaAntiga || linhaExistente;
  if (linha) sh.getRange(linha, 1, 1, valores.length).setValues([valores]);
  else sh.appendRow(valores);
  sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), sh.getLastColumn()).sort(Array.from({ length: nChave }, (_, i) => i + 1));
  return { msg: 'Salvo' };
}

function excluirAux(nome, chave) {
  const linha = acharLinhaAux(nome, chave);
  if (!linha) throw new Error('Cadastro não encontrado.');
  aba(nome).deleteRow(linha);
  return { msg: 'Excluído' };
}

function acharLinhaAux(nome, chave) {
  const sh = aba(nome);
  if (sh.getLastRow() < 2) return 0;
  const dados = sh.getRange(2, 1, sh.getLastRow() - 1, chave.length).getDisplayValues();
  const alvo = chave.map(v => texto(v).toLowerCase());
  const i = dados.findIndex(r => r.every((v, j) => v.trim().toLowerCase() === alvo[j]));
  return i < 0 ? 0 : i + 2;
}

// ───────────────────────── Utilidades ─────────────────────────

function planilha() {
  const id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function aba(nome) {
  const sh = planilha().getSheetByName(nome);
  if (!sh) throw new Error('Aba "' + nome + '" não existe. Rode configurarPlanilha.');
  return sh;
}

function texto(v) {
  return v === undefined || v === null ? '' : String(v).trim();
}

function normalizarBem(bem) {
  const b = {};
  Object.keys(bem || {}).forEach(k => {
    if (k === 'doacao') b[k] = bem[k] === true || bem[k] === 'Sim' ? 'Sim' : 'Não';
    else b[k] = texto(bem[k]);
  });
  return b;
}

function acharLinhaBem(patrimonio) {
  const sh = aba(ABAS.BENS);
  if (sh.getLastRow() < 2) return 0;
  const achado = sh.getRange(2, 1, sh.getLastRow() - 1, 1)
    .createTextFinder(patrimonio).matchEntireCell(true).findNext();
  return achado ? achado.getRow() : 0;
}

/** Evita duplicar quando o app reenvia uma operação da fila offline. */
function jaProcessado(nome, id) {
  if (!id) return false;
  const sh = aba(nome);
  if (sh.getLastRow() < 2) return false;
  const col = CABECALHOS[nome].indexOf('ID') + 1;
  return !!sh.getRange(2, col, sh.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
}

/** Acrescenta um registro (Incorporações/Alterações/Desincorporações) com data formatada e checkbox. */
function registrar(nome, linha) {
  const sh = aba(nome);
  sh.appendRow(linha);
  const r = sh.getLastRow();
  sh.getRange(r, 1).setNumberFormat('dd/mm/yyyy');
  sh.getRange(r, CABECALHOS[nome].indexOf(LANCADO) + 1).insertCheckboxes();
}

/** Data/hora da operação no fuso da planilha. Usa o horário em que foi feita no celular (mesmo se enviada depois). */
function momento(quando) {
  const d = quando ? new Date(quando) : new Date();
  const tz = planilha().getSpreadsheetTimeZone();
  const [y, mo, dia] = Utilities.formatDate(d, tz, 'yyyy-MM-dd').split('-').map(Number);
  return {
    data: (Date.UTC(y, mo - 1, dia) - Date.UTC(1899, 11, 30)) / 86400000, // número de série de data do Sheets
    hora: Utilities.formatDate(d, tz, 'HH:mm'),
    dataHora: Utilities.formatDate(d, tz, 'dd/MM/yyyy HH:mm'),
  };
}

function salvarFoto(foto, patrimonio) {
  const props = PropertiesService.getScriptProperties();
  let pasta;
  try {
    pasta = DriveApp.getFolderById(props.getProperty('PASTA_FOTOS_ID'));
  } catch (err) {
    pasta = DriveApp.createFolder('Patrimônio - Fotos');
    props.setProperty('PASTA_FOTOS_ID', pasta.getId());
  }
  const nome = patrimonio + '_' + Utilities.formatDate(new Date(), 'GMT', 'yyyyMMdd-HHmmss') + '.jpg';
  const blob = Utilities.newBlob(Utilities.base64Decode(foto.base64), foto.mime || 'image/jpeg', nome);
  return pasta.createFile(blob).getUrl();
}

// ───────────────────────── Configuração (rodar uma vez) ─────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Patrimônio')
    .addItem('Configurar planilha', 'configurarPlanilha')
    .addItem('Atualizar Consulta e Por Setor', 'atualizarVisoesMenu')
    .addItem('Mostrar abas de cadastro', 'mostrarCadastros')
    .addItem('Mostrar token do app', 'mostrarToken')
    .addToUi();
}

function configurarPlanilha() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  props.setProperty('PLANILHA_ID', ss.getId());

  Object.keys(CABECALHOS).forEach(nome => {
    const cab = CABECALHOS[nome];
    const sh = ss.getSheetByName(nome) || ss.insertSheet(nome);
    sh.getRange(1, 1, 1, cab.length).setValues([cab])
      .setFontWeight('bold').setBackground('#1f4e5f').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    // Textos que não podem virar número (zeros à esquerda): nº patrimônio e códigos
    const colsTexto = cab.map((c, i) => (/^(Nº|Cód|Código|ID)/.test(c) ? i + 1 : 0)).filter(Boolean);
    colsTexto.forEach(c => sh.getRange(2, c, sh.getMaxRows() - 1, 1).setNumberFormat('@'));
    if (cab[0] === 'Data') sh.getRange(2, 1, sh.getMaxRows() - 1, 1).setNumberFormat('dd/mm/yyyy');
    sh.autoResizeColumns(1, cab.length);
  });

  configurarConsulta(ss);
  configurarPorSetor(ss);

  // Remove a aba antiga "Por Dia" e a aba padrão vazia
  const antiga = ss.getSheetByName('Por Dia');
  if (antiga) ss.deleteSheet(antiga);
  ['Página1', 'Sheet1', 'Planilha1'].forEach(n => {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });

  // Ordem das abas; cadastros ficam ocultos (são mexidos pelo app)
  const ordem = [ABAS.CONSULTA, ABAS.SETOR, ABAS.BENS, ABAS.INC, ABAS.DES, ABAS.ALT];
  const ocultas = [ABAS.GRUPOS, ABAS.SUBGRUPOS, ABAS.LOCAIS, ABAS.SITUACOES];
  [...ordem, ...ocultas].forEach((nome, i) => {
    const sh = ss.getSheetByName(nome);
    sh.showSheet(); ss.setActiveSheet(sh); ss.moveActiveSheet(i + 1);
  });
  ss.setActiveSheet(ss.getSheetByName(ABAS.CONSULTA));
  ocultas.forEach(nome => ss.getSheetByName(nome).hideSheet());
  atualizarVisoes(ss);

  if (!props.getProperty('TOKEN')) props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  const msg = 'Planilha configurada!\n\nToken do app (guarde, vai na tela de Configurações do app):\n' + props.getProperty('TOKEN');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (err) { /* rodado pelo editor: veja o Registro de execução */ }
}

// ───────────────────────── Abas de consulta (preenchidas pelo script) ─────────────────────────

const COR_TITULO = '#1f4e5f';
const ACAO_COR = { 'Incorporação': '#d9f2e3', 'Alteração': '#fff0c2', 'Desincorporação': '#fbd9d6' };

/** "001733" e "1733" contam como o mesmo número. */
const chaveNum = (v) => texto(v).replace(/^0+(?=\d)/, '').toLowerCase();

function linhasDe(ss, nome) {
  const sh = ss.getSheetByName(nome);
  return !sh || sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getDisplayValues();
}

function cabecalhoEntrada(sh, rotulo, dica) {
  sh.getRange('A1').setValue(rotulo).setFontWeight('bold');
  sh.getRange('B1').setBackground('#fff3c4').setFontWeight('bold').setFontSize(12)
    .setBorder(true, true, true, true, false, false, '#c9a400', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange('C1').setValue(dica).setFontColor('#888888');
  sh.setFrozenRows(1);
}

function configurarConsulta(ss) {
  const sh = ss.getSheetByName(ABAS.CONSULTA) || ss.insertSheet(ABAS.CONSULTA);
  cabecalhoEntrada(sh, 'Nº Patrimônio:', '← digite o nº (ou o nº da plaqueta antiga) e tecle Enter');
  sh.getRange('B1').setNumberFormat('@');
  sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 140); sh.setColumnWidth(3, 150); sh.setColumnWidth(4, 420);
}

function configurarPorSetor(ss) {
  const sh = ss.getSheetByName(ABAS.SETOR) || ss.insertSheet(ABAS.SETOR);
  cabecalhoEntrada(sh, 'Setor:', '← escolha o setor na lista');
  const locais = ss.getSheetByName(ABAS.LOCAIS).getRange('A2:A');
  sh.getRange('B1').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(locais, true).setAllowInvalid(false).build());
  sh.setColumnWidth(2, 180);
}

/** Gatilho simples: ao digitar na célula B1 de Consulta ou Por Setor, preenche a aba. */
function onEdit(e) {
  if (!e || e.range.getA1Notation() !== 'B1') return;
  const nome = e.range.getSheet().getName();
  if (nome === ABAS.CONSULTA) preencherConsulta(e.source);
  if (nome === ABAS.SETOR) preencherPorSetor(e.source);
}

function atualizarVisoes(ss) {
  preencherConsulta(ss);
  preencherPorSetor(ss);
}

function atualizarVisoesMenu() {
  atualizarVisoes(SpreadsheetApp.getActiveSpreadsheet());
}

function mostrarCadastros() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  [ABAS.GRUPOS, ABAS.SUBGRUPOS, ABAS.LOCAIS, ABAS.SITUACOES].forEach(n => ss.getSheetByName(n).showSheet());
}

function limparAbaixo(sh) {
  const n = Math.max(sh.getMaxRows() - 2, 1);
  sh.getRange(3, 1, n, sh.getMaxColumns()).clear().clearDataValidations();
}

/** Escreve um bloco: título (linha colorida), cabeçalho opcional e linhas. Devolve a próxima linha livre. */
function escreverBloco(sh, linha, titulo, cab, linhas, largura) {
  sh.getRange(linha, 1, 1, largura).setBackground(COR_TITULO).setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(linha, 1).setValue(titulo);
  linha++;
  if (cab) {
    sh.getRange(linha, 1, 1, largura).setValues([cab]).setFontWeight('bold').setBackground('#eeeeee');
    linha++;
  }
  if (linhas.length) {
    sh.getRange(linha, 1, linhas.length, largura).setNumberFormat('@').setValues(linhas);
    linha += linhas.length;
  }
  return linha + 1;
}

function preencherConsulta(ss) {
  const sh = ss.getSheetByName(ABAS.CONSULTA);
  if (!sh) return;
  limparAbaixo(sh);
  const busca = chaveNum(sh.getRange('B1').getDisplayValue());
  if (!busca) return;

  const cab = CABECALHOS[ABAS.BENS];
  const iAlt = cab.indexOf('Nº Patrimônio Alt.');
  const bem = linhasDe(ss, ABAS.BENS).find(r => chaveNum(r[0]) === busca || (r[iAlt] && chaveNum(r[iAlt]) === busca));
  const num = bem ? chaveNum(bem[0]) : busca;
  const mesmo = (v) => chaveNum(v) === num;

  // Histórico de tudo que aconteceu com o bem, em ordem de data
  const hist = [];
  const cabInc = CABECALHOS[ABAS.INC];
  linhasDe(ss, ABAS.INC).filter(r => mesmo(r[2])).forEach(r =>
    hist.push([r[0], r[1], 'Incorporação', r[cabInc.indexOf('Descrição')] + ' – ' + r[cabInc.indexOf('Localização')]]));
  linhasDe(ss, ABAS.ALT).filter(r => mesmo(r[2])).forEach(r =>
    hist.push([r[0], r[1], 'Alteração', r[4] + ': ' + (r[5] || '(vazio)') + ' → ' + (r[6] || '(vazio)')]));
  linhasDe(ss, ABAS.DES).filter(r => mesmo(r[2])).forEach(r =>
    hist.push([r[0], r[1], 'Desincorporação', r[3]]));
  const ordem = (r) => r[0].split('/').reverse().join('') + r[1];
  hist.sort((a, b) => ordem(a).localeCompare(ordem(b)));

  let linha = 3;
  if (bem) {
    const fichas = cab.map((c, i) => [c, bem[i], '', '']).filter(r => r[1]);
    const ini = linha + 1;
    linha = escreverBloco(sh, linha, 'SITUAÇÃO ATUAL', null, fichas, 4);
    sh.getRange(ini, 1, fichas.length, 1).setFontWeight('bold');
    const iSt = fichas.findIndex(r => r[0] === 'Status');
    if (iSt >= 0) {
      sh.getRange(ini + iSt, 2).setFontWeight('bold')
        .setFontColor(fichas[iSt][1] === 'DESINCORPORADO' ? '#c0392b' : '#1e8449');
    }
  } else {
    linha = escreverBloco(sh, linha, 'SITUAÇÃO ATUAL', null,
      [[hist.length ? 'Não está na aba Bens (bem antigo do Wareline)' : 'Nenhum registro com esse número', '', '', '']], 4);
  }
  const ini = linha + 2;
  escreverBloco(sh, linha, 'HISTÓRICO', ['Data', 'Hora', 'Movimento', 'Detalhe'],
    hist.length ? hist : [['—', '', 'Nenhum movimento', '']], 4);
  hist.forEach((r, i) => sh.getRange(ini + i, 1, 1, 4).setBackground(ACAO_COR[r[2]] || null));
}

function preencherPorSetor(ss) {
  const sh = ss.getSheetByName(ABAS.SETOR);
  if (!sh) return;
  limparAbaixo(sh);
  sh.getRange('D1').clearContent();
  const setor = texto(sh.getRange('B1').getDisplayValue()).toLowerCase();
  if (!setor) return;

  const cab = CABECALHOS[ABAS.BENS];
  const cols = ['Nº Patrimônio', 'Nº Patrimônio Alt.', 'Descrição', 'Grupo', 'Subgrupo', 'Marca', 'Modelo', 'Nº Série', 'Situação', 'Foto'];
  const idx = cols.map(c => cab.indexOf(c));
  const iLocal = cab.indexOf('Localização');
  const iStatus = cab.indexOf('Status');
  const bens = linhasDe(ss, ABAS.BENS)
    .filter(r => r[iLocal].trim().toLowerCase() === setor && r[iStatus] !== 'DESINCORPORADO')
    .map(r => idx.map(i => r[i]))
    .sort((a, b) => a[2].localeCompare(b[2], 'pt-BR'));

  sh.getRange('D1').setValue(bens.length + ' bem(ns) ativo(s)').setFontWeight('bold');
  const vazio = [cols.map((c, i) => (i ? '' : 'Nenhum bem ativo neste setor'))];
  escreverBloco(sh, 3, 'BENS DO SETOR', cols, bens.length ? bens : vazio, cols.length);
}

function mostrarToken() {
  SpreadsheetApp.getUi().alert('Token do app:\n' + PropertiesService.getScriptProperties().getProperty('TOKEN'));
}

/** Salva o grupo; se foi renomeado, atualiza o nome do grupo nos subgrupos dele. */
function salvarGrupo(op) {
  const r = salvarAux(ABAS.GRUPOS, 1, [op.nome, op.codigo], op.anterior);
  const antigo = op.anterior && texto(op.anterior[0]);
  if (antigo && antigo.toLowerCase() !== texto(op.nome).toLowerCase()) {
    const sh = aba(ABAS.SUBGRUPOS);
    if (sh.getLastRow() > 1) {
      const col = sh.getRange(2, 1, sh.getLastRow() - 1, 1);
      col.setValues(col.getDisplayValues().map(([g]) => [g.trim().toLowerCase() === antigo.toLowerCase() ? texto(op.nome) : g]));
    }
  }
  return r;
}
