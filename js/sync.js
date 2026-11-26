// Fila offline: tudo é salvo primeiro no celular e enviado à planilha quando há internet.
import { db } from './db.js';
import { chamar } from './api.js';
import { configurado } from './config.js';
import { lerDados, gravarDados, aplicarLocal } from './dados.js';

const ACOES_DE_BEM = ['incorporar', 'alterar', 'desincorporar'];
let enviando = false;
let ultimoErro = null;

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

/** Envia o que estiver pendente e atualiza a cópia local com a planilha. */
/** Recarrega da planilha e reaplica o que ainda não foi aceito. */
async function baixarDados() {
  const r = await chamar('dados');
  if (!r.ok) return false;
  const { ok, id, ...dados } = r;
  const resto = (await db.todos('fila')).sort((a, b) => a.criado - b.criado);
  resto.forEach((op) => aplicarLocal(dados, op));
  await gravarDados(dados);
  return true;
}

/** Busca agora os dados atuais da planilha (ex.: um bem apagado direto na planilha libera o nº na hora). */
let ultimaBaixa = 0;
export async function recarregarDados(minimoMs = 0) {
  if (!navigator.onLine || !configurado() || Date.now() - ultimaBaixa < minimoMs) return false;
  ultimaBaixa = Date.now();
  try {
    const ok = await baixarDados();
    if (ok) avisar();
    return ok;
  } catch { return false; }
}

export async function enviar() {
  if (enviando || !navigator.onLine || !configurado()) return;
  enviando = true;
  avisar();
  try {
    const fila = (await db.todos('fila')).filter((o) => o.estado !== 'erro').sort((a, b) => a.criado - b.criado);
    for (const pacote of emPacotes(fila)) {
      const ops = pacote.map(({ estado, criado, erro, ...o }) => o);
      const r = await chamar('lote', { ops });
      if (!r.ok) throw new Error(r.erro);
      for (const res of r.resultados) {
        const op = pacote.find((o) => o.id === res.id);
        if (!op) continue;
        if (res.ok) await db.apagar('fila', op.id);
        else await db.gravar('fila', { ...op, estado: 'erro', erro: res.erro });
      }
      avisar();
    }
    await baixarDados();
    ultimoErro = null;
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
  await enviar();
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

/** Liga o envio automático: ao abrir, ao voltar a internet, ao voltar para o app e a cada minuto. */
export function iniciarSync() {
  window.addEventListener('online', enviar);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && enviar());
  setInterval(async () => (await estado()).pendentes && enviar(), 60000);
  enviar();
}
