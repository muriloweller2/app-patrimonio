const VERSAO_SCRIPT = '2026-11-27c';
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
  try {
    return responder(processar((e && e.parameter) || {}));
  } catch (err) {
    return responder({ ok: false, erro: 'Erro no script: ' + err.message });
  }
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, erro: 'Requisição inválida (JSON).' });
  }
  try {
    return responder(processar(req));
  } catch (err) {
    // Nunca devolve página de erro HTML: o app sempre recebe JSON e mantém os itens na fila
    return responder({ ok: false, erro: 'Erro no script: ' + err.message });
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function processar(req) {
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || req.token !== token) return { ok: false, erro: 'Token inválido.' };

  // Foto só lê o Drive: não precisa esperar a vez na planilha
  if (req.action === 'foto') return executarSeguro(req);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, erro: 'Planilha ocupada. O app tenta de novo sozinho.', versao: VERSAO_SCRIPT };
  try {
    const ops = req.action === 'lote' ? (req.ops || []) : [req];
    const resultados = ops.map(executarSeguro);
    // Se mexeu em bens, atualiza as abas Consulta e Por Setor
    if (ops.some(o => ['incorporar', 'alterar', 'desincorporar'].includes(o.action))) {
      try { atualizarVisoes(planilha()); } catch (err) { /* não impede o envio */ }
    }
    return req.action === 'lote' ? { ok: true, versao: VERSAO_SCRIPT, resultados } : resultados[0];
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
    case 'ping': return { msg: 'Conectado', planilha: planilha().getName(), versao: VERSAO_SCRIPT };
    case 'dados': return lerDados();
    case 'incorporar': return incorporar(op);
    case 'alterar': return alterar(op);
    case 'foto': return lerFoto(op.url);
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
  if (b.patrimonioAlt) conferirAlternativo(b.patrimonioAlt, b.patrimonio);

  if (op.foto) b.foto = salvarFoto(op.foto, b.patrimonio);
  const m = momento(op.quando);
  const valores = CAMPOS.map(c => b[c[0]] || '');

  aba(ABAS.BENS).appendRow([...valores, 'ATIVO', m.dataHora, ''].map(fixo));
  registrar(ABAS.INC, [m.data, m.hora, ...valores, false, op.id || '']);
  return { msg: 'Incorporado', foto: b.foto || '' };
}

function alterar(op) {
  const novo = normalizarBem(op.bem);
  if (!novo.patrimonio) throw new Error('Informe o nº de patrimônio.');
  if (jaProcessado(ABAS.ALT, op.id)) return { msg: 'Já enviado antes', duplicado: true };
  // `anterior` = nº antes da alteração (permite trocar o próprio nº de patrimônio)
  const antigo = texto(op.anterior) || novo.patrimonio;
  const linha = acharLinhaBem(antigo);
  if (!linha) throw new Error('Patrimônio ' + antigo + ' não encontrado em Bens.');
  if (novo.patrimonio !== antigo) conferirLivre(novo.patrimonio, linha, 'Nº ');
  if (novo.patrimonioAlt) {
    if (novo.patrimonioAlt === novo.patrimonio) throw new Error('O nº alternativo não pode ser igual ao nº de patrimônio.');
    conferirLivre(novo.patrimonioAlt, linha, 'Nº alternativo ');
  }

  if (op.foto) novo.foto = salvarFoto(op.foto, novo.patrimonio);
  const sh = aba(ABAS.BENS);
  const atual = sh.getRange(linha, 1, 1, CAMPOS.length).getDisplayValues()[0];
  const m = momento(op.quando);
  const descricao = novo.descricao || atual[CAMPOS.findIndex(c => c[0] === 'descricao')];
  let mudancas = 0;

  CAMPOS.forEach(([chave, rotulo], i) => {
    if (!(chave in novo)) return;
    const antes = String(atual[i] || '');
    const depois = String(novo[chave] || '');
    if (antes === depois) return;
    sh.getRange(linha, i + 1).setValue(fixo(depois));
    registrar(ABAS.ALT, [m.data, m.hora, novo.patrimonio, descricao, rotulo, antes, depois, false, op.id || '']);
    mudancas++;
  });

  if (mudancas) sh.getRange(linha, CABECALHOS[ABAS.BENS].length).setValue(m.dataHora);
  return { msg: mudancas ? mudancas + ' campo(s) alterado(s)' : 'Nada mudou', mudancas, foto: novo.foto || '' };
}

/** Na alteração: o número não pode pertencer a OUTRO bem (a própria linha pode). */
function conferirLivre(numero, linhaPropria, rotulo) {
  const linha = acharLinhaBem(numero);
  if (linha && linha !== linhaPropria) throw new Error(rotulo + numero + ' já é o nº de patrimônio de outro bem.');
  if (acharDesincorporado(numero)) throw new Error(rotulo + numero + ' já foi usado num bem desincorporado.');
  const dono = acharPorAlternativo(numero);
  if (dono && dono.linha !== linhaPropria) throw new Error(rotulo + numero + ' já é o nº alternativo do bem ' + dono.patrimonio + ' (' + dono.descricao + ').');
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
  const dono = acharPorAlternativo(patrimonio);
  if (dono) throw new Error('Nº ' + patrimonio + ' já é o nº alternativo do bem ' + dono.patrimonio + ' (' + dono.descricao + ').');
}

/** Um número só pode pertencer a um bem: o nº alternativo não pode existir como nº normal nem como alternativo de outro bem. */
function conferirAlternativo(alt, patrimonio) {
  if (texto(alt) === texto(patrimonio)) throw new Error('O nº alternativo não pode ser igual ao nº de patrimônio.');
  const linha = acharLinhaBem(alt);
  if (linha) throw new Error('Nº alternativo ' + alt + ' já é o nº de patrimônio de outro bem.');
  if (acharDesincorporado(alt)) throw new Error('Nº alternativo ' + alt + ' já foi usado num bem desincorporado.');
  const dono = acharPorAlternativo(alt);
  if (dono) throw new Error('Nº alternativo ' + alt + ' já pertence ao bem ' + dono.patrimonio + ' (' + dono.descricao + ').');
}

function acharPorAlternativo(numero) {
  const sh = aba(ABAS.BENS);
  if (sh.getLastRow() < 2) return null;
  const cab = CABECALHOS[ABAS.BENS];
  const col = cab.indexOf('Nº Patrimônio Alt.') + 1;
  const achado = sh.getRange(2, col, sh.getLastRow() - 1, 1).createTextFinder(numero).matchEntireCell(true).findNext();
  if (!achado) return null;
  const r = sh.getRange(achado.getRow(), 1, 1, cab.length).getDisplayValues()[0];
  return { linha: achado.getRow(), patrimonio: r[0], descricao: r[cab.indexOf('Descrição')] };
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
  let linhaAntiga = anterior ? acharLinhaAux(nome, anterior) : 0;
  const linhaExistente = acharLinhaAux(nome, chaveNova);
  // Renomear: se o nome antigo não existe mais e o novo já existe, é reenvio de algo que já deu certo
  if (anterior && !linhaAntiga && linhaExistente) linhaAntiga = linhaExistente;
  if (linhaExistente && linhaExistente !== linhaAntiga && anterior) throw new Error('Já existe um cadastro com esse nome.');

  const sh = aba(nome);
  const linha = linhaAntiga || linhaExistente;
  if (linha) sh.getRange(linha, 1, 1, valores.length).setValues([valores.map(fixo)]);
  else sh.appendRow(valores.map(fixo));
  sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), sh.getLastColumn()).sort(Array.from({ length: nChave }, (_, i) => i + 1));
  return { msg: 'Salvo' };
}

function excluirAux(nome, chave) {
  const linha = acharLinhaAux(nome, chave);
  if (!linha) return { msg: 'Já não existia' }; // reenvio ou apagado direto na planilha: nada a fazer
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

/** Devolve a aba; se faltar (ou estiver vazia com cabeçalho antigo), cria/acerta sozinha. */
function aba(nome) {
  const ss = planilha();
  let sh = ss.getSheetByName(nome);
  const cab = CABECALHOS[nome];
  if (!sh) {
    if (!cab) throw new Error('Aba "' + nome + '" não existe. Rode configurarPlanilha.');
    sh = ss.insertSheet(nome);
    if ([ABAS.GRUPOS, ABAS.SUBGRUPOS, ABAS.LOCAIS, ABAS.SITUACOES].includes(nome)) sh.hideSheet();
  }
  if (cab && sh.getLastRow() <= 1) {
    const atual = sh.getRange(1, 1, 1, cab.length).getDisplayValues()[0];
    if (atual.join('|') !== cab.join('|')) {
      sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#1f4e5f').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

/** Grava texto exatamente como digitado: o apóstrofo (invisível) impede o Sheets de tirar zeros (001733 → 1733) ou virar data. */
function fixo(v) {
  return typeof v === 'string' && v !== '' ? "'" + v : v;
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
  sh.appendRow(linha.map(fixo));
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

/** Devolve a foto do bem (só arquivos da pasta do app) para o app mostrar na ficha. */
function lerFoto(url) {
  const m = String(url || '').match(/\/d\/([-\w]{20,})/) || String(url || '').match(/[?&]id=([-\w]{20,})/);
  if (!m) throw new Error('Link de foto inválido.');
  const arq = DriveApp.getFileById(m[1]);
  const pastaId = PropertiesService.getScriptProperties().getProperty('PASTA_FOTOS_ID');
  let daPasta = false;
  const pais = arq.getParents();
  while (pais.hasNext()) if (pais.next().getId() === pastaId) daPasta = true;
  if (!daPasta) throw new Error('Essa foto não está na pasta do app.');
  const b = arq.getBlob();
  return { base64: Utilities.base64Encode(b.getBytes()), mime: b.getContentType() || 'image/jpeg' };
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
  cabecalhoEntrada(sh, 'Nº Patrimônio:', '← digite o nº (completo ou parte dele), o nº da plaqueta antiga ou parte da descrição e tecle Enter');
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
  const bens = linhasDe(ss, ABAS.BENS);
  let bem = bens.find(r => chaveNum(r[0]) === busca || (r[iAlt] && chaveNum(r[iAlt]) === busca));

  // Sem número exato: procura parte do número (1733 acha 001733, 017331...) ou parte da descrição
  if (!bem) {
    const iDesc = cab.indexOf('Descrição');
    const soNumero = /^\d+$/.test(busca);
    const achados = bens.filter(r => chaveNum(r[0]).includes(busca) || (r[iAlt] && chaveNum(r[iAlt]).includes(busca))
      || (!soNumero && r[iDesc].toLowerCase().includes(busca)));
    if (achados.length === 1) bem = achados[0];
    else if (achados.length > 1) {
      const cols = ['Nº Patrimônio', 'Nº Patrimônio Alt.', 'Descrição', 'Localização', 'Status'].map(c => cab.indexOf(c));
      sh.getRange(3, 1).setValue(achados.length + ' bens encontrados. Digite o nº completo em B1 para ver o histórico de um deles.')
        .setFontColor('#888888');
      escreverBloco(sh, 4, 'RESULTADOS DA BUSCA', ['Nº Patrimônio', 'Nº Alt.', 'Descrição', 'Setor', 'Status'],
        achados.slice(0, 200).map(r => cols.map(i => r[i])), 5);
      return;
    }
  }
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
