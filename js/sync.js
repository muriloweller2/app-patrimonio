// Fila offline: tudo é salvo primeiro no celular e enviado à planilha quando há internet.
import { db } from './db.js';
import { chamar } from './api.js';
import { configurado, redeLiberada } from './config.js';
import { lerDados, gravarDados, aplicarLocal, chaveNum } from './dados.js';

const SCRIPT_ANTIGO = 'O Apps Script publicado é uma versão ANTIGA. Cole o Codigo.gs novo e crie uma Nova versão da implantação.';
const ACOES_DE_BEM = ['incorporar', 'alterar', 'desincorporar'];
let enviando = false;
let ultimoErro = null;
let aguardandoWifi = false;

/** Guarda a operação na fila e já aplica na cópia local. Não envia: chame enviar() depois. */
export async function registrar(action, dados) {
  const op = { ...dados, id: crypto.randomUUID(), action, quando: new Date().toISOString(), estado: 'pendente', criado: Date.now() };
  await db.gravar('fila', op);
  if (ACOES_DE_BEM.includes(action)) {
    await db.gravar('historico', {
      id: op.id, action, quando: op.quando,
      patrimonio: op.bem?.patrimonio || op.patrimonio || '',
      descricao: op.bem?.descricao || op.descricao || '',
    });
  }
  await gravarDados(aplicarLocal(await lerDados(), op));
  avisar();
  return op;
}

/**
 * Alteração de um bem (tela Alterar). `anterior` = nº antes da alteração; `foto` = {base64,mime} se trocou, null se tirou, undefined se não mexeu.
 * Se o bem ainda nem foi enviado (incorporação na fila), corrige a própria incorporação em vez de criar uma alteração.
 */
export async function alterarBem(anterior, bem, foto) {
  const fila = await db.todos('fila');
  const inc = fila.find((o) => o.action === 'incorporar' && chaveNum(o.bem?.patrimonio) === chaveNum(anterior));
  if (foto === null) bem = { ...bem, foto: '' };
  if (!inc) return registrar('alterar', foto ? { anterior, bem, foto } : { anterior, bem });
  const op = { ...inc, bem: { ...inc.bem, ...bem }, estado: 'pendente', erro: null };
  if (foto) op.foto = foto;
  else if (foto === null) delete op.foto;
  await db.gravar('fila', op);
  const h = await db.ler('historico', op.id);
  if (h) await db.gravar('historico', { ...h, patrimonio: bem.patrimonio, descricao: bem.descricao });
  await gravarDados(aplicarLocal(await lerDados(), { action: 'alterar', anterior, bem }));
  avisar();
  return op;
}

/** Envia o que estiver pendente e atualiza a cópia local com a planilha. */
/** Recarrega da planilha e reaplica o que ainda não foi aceito. */
async function baixarDados() {
  const r = await chamar('dados');
  if (!r.ok) return false;
  const { ok, id, ...dados } = r;
  // Só o que ainda espera envio; o que a planilha recusou não conta como cadastrado
  const resto = (await db.todos('fila')).filter((o) => o.estado !== 'erro').sort((a, b) => a.criado - b.criado);
  resto.forEach((op) => aplicarLocal(dados, op));
  await gravarDados(dados);
  return true;
}

/** Busca agora os dados atuais da planilha (ex.: um bem apagado direto na planilha libera o nº na hora). */
let ultimaBaixa = 0;
export async function recarregarDados(minimoMs = 0) {
  if (!redeLiberada() || !configurado() || Date.now() - ultimaBaixa < minimoMs) return false;
  ultimaBaixa = Date.now();
  try {
    const ok = await baixarDados();
    if (ok) avisar();
    return ok;
  } catch { return false; }
}

/** `manual` = botão "Enviar agora": envia mesmo com a opção de dados móveis desligada. */
export async function enviar(manual = false) {
  if (enviando || !configurado()) return;
  aguardandoWifi = navigator.onLine && !redeLiberada(manual);
  if (!redeLiberada(manual)) return avisar();
  enviando = true;
  let versaoAntiga = false;
  avisar();
  try {
    const fila = (await db.todos('fila')).filter((o) => o.estado !== 'erro').sort((a, b) => a.criado - b.criado);
    for (const pacote of emPacotes(fila)) {
      const ops = pacote.map(({ estado, criado, erro, ...o }) => o);
      const r = await chamar('lote', { ops });
      if (!r.ok) throw new Error(r.erro);
      if (!r.versao) versaoAntiga = true;
      for (const res of r.resultados) {
        const op = pacote.find((o) => o.id === res.id);
        if (!op) continue;
        if (res.ok) await db.apagar('fila', op.id);
        else await db.gravar('fila', { ...op, estado: 'erro', erro: res.erro });
      }
      avisar();
    }
    await baixarDados();
    ultimoErro = versaoAntiga ? SCRIPT_ANTIGO : null;
  } catch (err) {
    ultimoErro = err.message;
  } finally {
    enviando = false;
    avisar();
  }
}

export async function estado() {
  const fila = await db.todos('fila');
  return {
    pendentes: fila.filter((o) => o.estado !== 'erro').length,
    erros: fila.filter((o) => o.estado === 'erro').length,
    enviando,
    ultimoErro,
    aguardandoWifi,
  };
}

export async function situacaoDe(id) {
  const op = await db.ler('fila', id);
  if (!op) return { enviado: true };
  return { enviado: false, erro: op.estado === 'erro' ? op.erro : null };
}

export async function descartar(id) {
  await db.apagar('fila', id);
  await db.apagar('historico', id);
  avisar();
}

export async function tentarDeNovo(id) {
  const op = await db.ler('fila', id);
  if (op) await db.gravar('fila', { ...op, estado: 'pendente', erro: null });
  await enviar(true);
}

/** Volta todos os itens recusados para a fila e envia (ex.: depois de atualizar o Apps Script). */
export async function tentarTodos() {
  for (const op of await db.todos('fila')) {
    if (op.estado === 'erro') await db.gravar('fila', { ...op, estado: 'pendente', erro: null });
  }
  await enviar(true);
}

/** Divide a fila em pacotes com no máximo 4 fotos (fotos demoram para subir ao Drive). */
function emPacotes(fila, maxFotos = 4) {
  const pacotes = [];
  let atual = [], fotos = 0;
  for (const op of fila) {
    if (op.foto && fotos >= maxFotos) { pacotes.push(atual); atual = []; fotos = 0; }
    atual.push(op);
    if (op.foto) fotos++;
  }
  if (atual.length) pacotes.push(atual);
  return pacotes;
}

function avisar() {
  window.dispatchEvent(new Event('sync'));
}

/**
 * O ENVIO É SÓ MANUAL (botão Enviar em Pendências), a pedido do usuário: ele cadastra o setor todo e envia no fim.
 * Automático é só BAIXAR a planilha (grupos, locais, bens) para conferir nº repetido: ao abrir, ao voltar a internet/app.
 */
export function iniciarSync() {
  const baixar = () => recarregarDados(60000);
  window.addEventListener('online', baixar);
  navigator.connection?.addEventListener?.('change', baixar);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && baixar());
  recarregarDados();
  avisar();
}
