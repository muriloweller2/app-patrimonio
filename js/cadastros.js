// Grupos, subgrupos, localizações e situações: escolher, criar, editar, excluir.
// Identificação sempre pelo NOME (sem código). Subgrupo fica ligado ao grupo pelo nome do grupo.
import { escolher, formulario } from './componentes.js';
import { registrar } from './sync.js';
import { lerDados } from './dados.js';
import { normalizar, toast } from './ui.js';

const mesmo = (a, b) => normalizar(a) === normalizar(b);

/** "12 · Mobiliário" ou só "Mobiliário" quando não tem código */
export const rotuloCod = (x) => (x.codigo ? `${x.codigo} · ${x.nome}` : x.nome);

async function gravar(action, dados, msg) {
  await registrar(action, dados); // fica em Pendências até apertar Enviar
  toast(msg + ' · aguardando envio', 'ok');
}

// Só o nome: o código foi tirado do app a pedido do usuário (cadastro livre)
const camposCodNome = (x = {}) => [{ nome: 'nome', rotulo: 'Nome', valor: x.nome }];

// ── Grupos ──
export async function novoGrupo() {
  const v = await formulario({ titulo: 'Novo grupo', campos: camposCodNome() });
  if (!v) return null;
  const d = await lerDados();
  if (d.grupos.some((g) => mesmo(g.nome, v.nome))) return toast('Já existe um grupo com esse nome', 'erro'), null;
  await gravar('salvarGrupo', v, 'Grupo cadastrado');
  return v;
}

export async function editarGrupo(g) {
  const d = await lerDados();
  const subs = d.subgrupos.filter((s) => mesmo(s.grupo, g.nome)).length;
  const v = await formulario({ titulo: 'Editar grupo', excluir: true, campos: camposCodNome(g) });
  if (!v) return false;
  if (v.excluir) {
    if (subs) return toast(`Esse grupo tem ${subs} subgrupo(s). Exclua ou mova os subgrupos antes.`, 'erro'), false;
    if (!confirm(`Excluir o grupo "${g.nome}"?`)) return false;
    await gravar('excluirGrupo', { nome: g.nome }, 'Grupo excluído');
    return true;
  }
  if (!mesmo(v.nome, g.nome) && d.grupos.some((x) => mesmo(x.nome, v.nome))) return toast('Já existe um grupo com esse nome', 'erro'), false;
  await gravar('salvarGrupo', { ...v, anterior: [g.nome] }, 'Grupo salvo');
  return true;
}

export async function escolherGrupo() {
  const d = await lerDados();
  return escolher({ titulo: 'Grupo', itens: d.grupos.map((g) => ({ ...g, rotulo: rotuloCod(g) })) });
}

// ── Subgrupos ──
export async function novoSubgrupo(grupo) {
  const v = await formulario({ titulo: 'Novo subgrupo', nota: `Grupo: ${grupo.nome}`, campos: camposCodNome() });
  if (!v) return null;
  const d = await lerDados();
  if (d.subgrupos.some((s) => mesmo(s.grupo, grupo.nome) && mesmo(s.nome, v.nome))) {
    return toast('Esse subgrupo já existe neste grupo', 'erro'), null;
  }
  const sub = { grupo: grupo.nome, nome: v.nome };
  await gravar('salvarSubgrupo', sub, 'Subgrupo cadastrado');
  return sub;
}

export async function editarSubgrupo(s) {
  const d = await lerDados();
  const v = await formulario({ titulo: 'Editar subgrupo', excluir: true, nota: `Grupo: ${s.grupo}`, campos: camposCodNome(s) });
  if (!v) return false;
  if (v.excluir) {
    if (!confirm(`Excluir o subgrupo "${s.nome}"?`)) return false;
    await gravar('excluirSubgrupo', { grupo: s.grupo, nome: s.nome }, 'Subgrupo excluído');
    return true;
  }
  if (!mesmo(v.nome, s.nome) && d.subgrupos.some((x) => mesmo(x.grupo, s.grupo) && mesmo(x.nome, v.nome))) {
    return toast('Esse subgrupo já existe neste grupo', 'erro'), false;
  }
  await gravar('salvarSubgrupo', { grupo: s.grupo, ...v, anterior: [s.grupo, s.nome] }, 'Subgrupo salvo');
  return true;
}

export async function escolherSubgrupo(grupo) {
  const d = await lerDados();
  return escolher({
    titulo: `Subgrupo — ${grupo.nome}`,
    itens: d.subgrupos.filter((s) => mesmo(s.grupo, grupo.nome)).map((s) => ({ ...s, rotulo: rotuloCod(s) })),
  });
}

// Situação do bem: lista fixa
export const SITUACOES = ['ÓTIMO', 'BOM', 'REGULAR', 'RUIM', 'PÉSSIMO'];

// ── Lista só com nome (Localizações) ──
function listaSimples({ lista, sufixo, nome, novoNome, rotulo }) {
  const novo = async () => {
    const v = await formulario({ titulo: novoNome, campos: [{ nome: 'nome', rotulo }] });
    if (!v) return null;
    const d = await lerDados();
    if (d[lista].some((x) => mesmo(x, v.nome))) return toast(`Essa ${nome} já existe`, 'erro'), null;
    await gravar('salvar' + sufixo, { nome: v.nome }, 'Cadastrado');
    return { nome: v.nome };
  };
  const editar = async (atual) => {
    const d = await lerDados();
    const v = await formulario({ titulo: `Editar ${nome}`, excluir: true, campos: [{ nome: 'nome', rotulo, valor: atual }] });
    if (!v) return false;
    if (v.excluir) {
      if (!confirm(`Excluir "${atual}"?`)) return false;
      await gravar('excluir' + sufixo, { nome: atual }, 'Excluído');
      return true;
    }
    if (!mesmo(v.nome, atual) && d[lista].some((x) => mesmo(x, v.nome))) return toast(`Essa ${nome} já existe`, 'erro'), false;
    await gravar('salvar' + sufixo, { nome: v.nome, anterior: [atual] }, 'Salvo');
    return true;
  };
  const escolherItem = async () => {
    const d = await lerDados();
    return escolher({ titulo: rotulo, itens: d[lista].map((x) => ({ nome: x, rotulo: x })) });
  };
  return { novo, editar, escolher: escolherItem };
}

export const locais = listaSimples({ lista: 'locais', sufixo: 'Local', nome: 'localização', novoNome: 'Nova localização', rotulo: 'Localização' });
