// Cópia local dos dados da planilha (bens, grupos, subgrupos, localizações)
import { db } from './db.js';
import { normalizar } from './ui.js';

const vazio = () => ({ bens: [], grupos: [], subgrupos: [], locais: [], situacoes: [], desincorporados: [] });

/** "001733" e "1733" contam como o mesmo número. */
export const chaveNum = (v) => String(v ?? '').trim().replace(/^0+(?=\d)/, '').toLowerCase();

/**
 * Procura o nº em QUALQUER lugar: nº de patrimônio dos bens, nº alternativo dos bens e desincorporados.
 * Um número só pode pertencer a um bem, seja como nº normal ou como alternativo.
 * Devolve { tipo: 'ativo'|'desincorporado', comoAlt, bem|registro } ou null.
 */
export function situacaoNumero(d, numero) {
  const n = chaveNum(numero);
  if (!n) return null;
  const tipo = (b) => (b.status === 'DESINCORPORADO' ? 'desincorporado' : 'ativo');
  let bem = d.bens.find((b) => chaveNum(b.patrimonio) === n);
  if (bem) return { tipo: tipo(bem), comoAlt: false, bem };
  bem = d.bens.find((b) => chaveNum(b.patrimonioAlt) === n);
  if (bem) return { tipo: tipo(bem), comoAlt: true, bem };
  const reg = d.desincorporados.find((x) => chaveNum(x.patrimonio) === n);
  return reg ? { tipo: 'desincorporado', comoAlt: false, registro: reg } : null;
}

export async function lerDados() {
  const d = { ...vazio(), ...((await db.ler('kv', 'dados')) || {}) };
  Object.keys(vazio()).forEach((k) => (d[k] ||= [])); // planilha antiga pode não mandar alguma lista
  return d;
}

export async function gravarDados(d) {
  ordenar(d);
  await db.gravar('kv', d, 'dados');
}

const igual = (a, b) => normalizar(a) === normalizar(b);
const comparar = (a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true, sensitivity: 'base' });

function ordenar(d) {
  Object.keys(vazio()).forEach((k) => (d[k] ||= []));
  d.grupos.sort((a, b) => comparar(a.nome, b.nome));
  d.subgrupos.sort((a, b) => comparar(a.grupo, b.grupo) || comparar(a.nome, b.nome));
  d.locais.sort(comparar);
  d.situacoes.sort(comparar);
}

/** Insere ou substitui o item cuja chave bate com `anterior` (renomear) ou com a chave do próprio item. */
function upsert(lista, chave, item, anterior) {
  const alvo = anterior || chave(item);
  const i = lista.findIndex((x) => chave(x).every((v, j) => igual(v, alvo[j])));
  if (i >= 0) lista[i] = item;
  else lista.push(item);
}

function remover(lista, chave, alvo) {
  const i = lista.findIndex((x) => chave(x).every((v, j) => igual(v, alvo[j])));
  if (i >= 0) lista.splice(i, 1);
}

const CH_GRUPO = (g) => [g.nome];
const CH_SUB = (s) => [s.grupo, s.nome];
const CH_LOCAL = (l) => [l];

/** Aplica uma operação na cópia local, para o app já refletir a mudança antes de enviar. */
export function aplicarLocal(d, op) {
  const bem = (p) => d.bens.find((b) => igual(b.patrimonio, p));
  switch (op.action) {
    case 'incorporar':
      d.bens.push({ ...op.bem, status: 'ATIVO' });
      break;
    case 'alterar':
      Object.assign(bem(op.anterior || op.bem.patrimonio) || bem(op.bem.patrimonio) || {}, op.bem); // anterior = trocou o nº
      break;
    case 'desincorporar': {
      const b = bem(op.patrimonio);
      if (b) b.status = 'DESINCORPORADO';
      (d.desincorporados ||= []).push({ patrimonio: op.patrimonio, descricao: op.descricao || b?.descricao || '', data: new Date(op.quando || Date.now()).toLocaleDateString('pt-BR') });
      break;
    }
    case 'salvarGrupo':
      upsert(d.grupos, CH_GRUPO, { codigo: op.codigo || '', nome: op.nome }, op.anterior);
      if (op.anterior) d.subgrupos.forEach((s) => igual(s.grupo, op.anterior[0]) && (s.grupo = op.nome)); // renomeou
      break;
    case 'excluirGrupo': remover(d.grupos, CH_GRUPO, [op.nome]); break;
    case 'salvarSubgrupo': upsert(d.subgrupos, CH_SUB, { grupo: op.grupo, codigo: op.codigo || '', nome: op.nome }, op.anterior); break;
    case 'excluirSubgrupo': remover(d.subgrupos, CH_SUB, [op.grupo, op.nome]); break;
    case 'salvarLocal': upsert(d.locais, CH_LOCAL, op.nome, op.anterior); break;
    case 'excluirLocal': remover(d.locais, CH_LOCAL, [op.nome]); break;
    case 'salvarSituacao': upsert(d.situacoes, CH_LOCAL, op.nome, op.anterior); break;
    case 'excluirSituacao': remover(d.situacoes, CH_LOCAL, [op.nome]); break;
  }
  return d;
}
