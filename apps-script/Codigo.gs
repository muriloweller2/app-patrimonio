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
  DIA: 'Por Dia',
  GRUPOS: 'Grupos',
  SUBGRUPOS: 'Subgrupos',
  LOCAIS: 'Localizações',
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
  [ABAS.GRUPOS]: ['Código', 'Nome'],
  [ABAS.SUBGRUPOS]: ['Cód. Grupo', 'Código', 'Nome'],
  [ABAS.LOCAIS]: ['Nome'],
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
    if (req.action === 'lote') {
      return { ok: true, resultados: (req.ops || []).map(executarSeguro) };
    }
    return executarSeguro(req);
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
    case 'salvarGrupo': return salvarAux(ABAS.GRUPOS, 1, [op.codigo, op.nome], op.anterior);
    case 'excluirGrupo': return excluirAux(ABAS.GRUPOS, [op.codigo]);
    case 'salvarSubgrupo': return salvarAux(ABAS.SUBGRUPOS, 2, [op.grupoCod, op.codigo, op.nome], op.anterior);
    case 'excluirSubgrupo': return excluirAux(ABAS.SUBGRUPOS, [op.grupoCod, op.codigo]);
    case 'salvarLocal': return salvarAux(ABAS.LOCAIS, 1, [op.nome], op.anterior);
    case 'excluirLocal': return excluirAux(ABAS.LOCAIS, [op.nome]);
    default: throw new Error('Ação desconhecida: ' + op.action);
  }
}

// ───────────────────────── Operações com bens ─────────────────────────

function incorporar(op) {
  const b = normalizarBem(op.bem);
  if (!b.patrimonio) throw new Error('Informe o nº de patrimônio.');
  if (!b.descricao) throw new Error('Informe a descrição do bem.');
  if (jaProcessado(ABAS.INC, op.id)) return { msg: 'Já enviado antes', duplicado: true };
  if (acharLinhaBem(b.patrimonio)) throw new Error('Patrimônio ' + b.patrimonio + ' já está cadastrado.');

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
    grupos: linhas(ABAS.GRUPOS).map(r => ({ codigo: r[0], nome: r[1] })),
    subgrupos: linhas(ABAS.SUBGRUPOS).map(r => ({ grupoCod: r[0], codigo: r[1], nome: r[2] })),
    locais: linhas(ABAS.LOCAIS).map(r => r[0]),
  };
}

// ───────────────────────── Cadastros auxiliares ─────────────────────────

/** Insere ou atualiza uma linha identificada pelas primeiras `nChave` colunas. */
function salvarAux(nome, nChave, valores, anterior) {
  valores = valores.map(texto);
  if (valores.some(v => !v)) throw new Error('Preencha todos os campos.');
  const chaveNova = valores.slice(0, nChave);
  const linhaAntiga = anterior ? acharLinhaAux(nome, anterior) : 0;
  const linhaExistente = acharLinhaAux(nome, chaveNova);
  if (linhaExistente && linhaExistente !== linhaAntiga && anterior) throw new Error('Já existe um cadastro com esse código/nome.');

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

  configurarPorDia(ss);

  // Ordem das abas
  [ABAS.DIA, ABAS.BENS, ABAS.INC, ABAS.ALT, ABAS.DES, ABAS.GRUPOS, ABAS.SUBGRUPOS, ABAS.LOCAIS]
    .forEach((nome, i) => { ss.setActiveSheet(ss.getSheetByName(nome)); ss.moveActiveSheet(i + 1); });

  // Remove a aba padrão vazia
  ['Página1', 'Sheet1', 'Planilha1'].forEach(n => {
    const sh = ss.getSheetByName(n);
    if (sh && sh.getLastRow() === 0) ss.deleteSheet(sh);
  });

  if (!props.getProperty('TOKEN')) props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  const msg = 'Planilha configurada!\n\nToken do app (guarde, vai na tela de Configurações do app):\n' + props.getProperty('TOKEN');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (err) { /* rodado pelo editor: veja o Registro de execução */ }
}

function configurarPorDia(ss) {
  const sh = ss.getSheetByName(ABAS.DIA) || ss.insertSheet(ABAS.DIA);
  sh.clear();
  sh.getRange('A1').setValue('Data:').setFontWeight('bold');
  sh.getRange('B1').setFormula('=TODAY()').setNumberFormat('dd/mm/yyyy')
    .setBackground('#fff3c4').setFontWeight('bold')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  sh.getRange('C1').setValue('← digite a data que quer ver').setFontColor('#888888');

  const bloco = (titulo, nome, ultimaCol) =>
    `"${titulo}", '${nome}'!A1:${ultimaCol}1, ` +
    `IFERROR(FILTER('${nome}'!A2:${ultimaCol}, '${nome}'!A2:A=$B$1), "— nenhum registro —")`;
  sh.getRange('A3').setFormula(
    '=IFNA(VSTACK(' +
    bloco('INCORPORAÇÕES', ABAS.INC, 'S') + ', "", ' +
    bloco('ALTERAÇÕES', ABAS.ALT, 'I') + ', "", ' +
    bloco('DESINCORPORAÇÕES', ABAS.DES, 'F') +
    '), "")'
  );
  sh.getRange('A3:A').setNumberFormat('dd/mm/yyyy');

  const destaque = (texto, cor) => SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=$A3="${texto}"`).setBold(true).setBackground(cor)
    .setRanges([sh.getRange('A3:T')]).build();
  sh.setConditionalFormatRules([
    destaque('INCORPORAÇÕES', '#d9f2e3'),
    destaque('ALTERAÇÕES', '#fff0c2'),
    destaque('DESINCORPORAÇÕES', '#fbd9d6'),
    destaque('Data', '#eeeeee'),
  ]);
  sh.setFrozenRows(1);
}

function mostrarToken() {
  SpreadsheetApp.getUi().alert('Token do app:\n' + PropertiesService.getScriptProperties().getProperty('TOKEN'));
}
