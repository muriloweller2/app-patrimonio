import { icone } from '../icones.js';
import { lerDados } from '../dados.js';
import { escolherGrupo, novoGrupo, editarGrupo, novoSubgrupo, editarSubgrupo, locais, rotuloCod } from '../cadastros.js';
import { esc, normalizar, toast, botoesLimpar } from '../ui.js';

export const titulo = 'Cadastros';

let abaAtual = 'grupos';

export async function render(el) {
  // Atalho da tela inicial: #/cadastros?aba=locais
  const pedida = new URLSearchParams(location.hash.split('?')[1] || '').get('aba');
  if (pedida) { abaAtual = pedida; history.replaceState(null, '', '#/cadastros'); }
  const d = await lerDados();
  const ABAS = {
    grupos: {
      nome: 'Grupos', itens: d.grupos, rotulo: rotuloCod,
      detalhe: (g) => { const n = d.subgrupos.filter((s) => normalizar(s.grupo) === normalizar(g.nome)).length; return `${n} subgrupo(s)`; },
      novo: () => novoGrupo(), editar: editarGrupo,
    },
    subgrupos: {
      nome: 'Subgrupos', itens: d.subgrupos, rotulo: rotuloCod,
      detalhe: (s) => `Grupo: ${s.grupo}`,
      novo: async () => {
        if (!d.grupos.length) return toast('Cadastre um grupo primeiro', 'erro'), null;
        const g = await escolherGrupo();
        return g && novoSubgrupo(g);
      },
      editar: editarSubgrupo,
    },
    locais: { nome: 'Locais', itens: d.locais, rotulo: (l) => l, novo: () => locais.novo(), editar: locais.editar },
  };

  el.innerHTML = `
    <h2>Cadastros</h2>
    <p class="sub">Listas usadas no cadastro dos bens.</p>
    <div class="segmentos" role="tablist">
      ${Object.entries(ABAS).map(([k, a]) => `
        <button type="button" role="tab" data-aba="${k}" aria-selected="${k === abaAtual}">${a.nome}<span>${a.itens.length}</span></button>`).join('')}
    </div>
    <div class="com-botao barra-busca">
      <input class="entrada" type="search" id="busca" placeholder="Buscar…" autocomplete="off">
      <button type="button" class="botao botao--icone" id="novo" aria-label="Cadastrar novo">${icone('mais')}</button>
    </div>
    <ul class="lista" id="lista"></ul>
  `;

  botoesLimpar(el, icone);
  const lista = el.querySelector('#lista');
  const busca = el.querySelector('#busca');

  function desenhar() {
    const a = ABAS[abaAtual];
    const q = normalizar(busca.value);
    const visiveis = a.itens
      .map((item, i) => ({ item, i, txt: a.rotulo(item), det: a.detalhe?.(item) || '' }))
      .filter((x) => normalizar(`${x.txt} ${x.det}`).includes(q));
    lista.innerHTML = visiveis.length
      ? visiveis.map((x) => `
          <li><button type="button" data-i="${x.i}">
            <span>${esc(x.txt)}${x.det ? `<small>${esc(x.det)}</small>` : ''}</span>${icone('editar')}
          </button></li>`).join('')
      : `<li class="lista__vazio">${a.itens.length ? 'Nada encontrado' : `Nenhum cadastro ainda. Toque em <b>+</b> para começar.`}</li>`;
  }

  el.querySelectorAll('[data-aba]').forEach((b) => {
    b.onclick = () => { abaAtual = b.dataset.aba; render(el); };
  });
  busca.oninput = desenhar;
  el.querySelector('#novo').onclick = async () => { if (await ABAS[abaAtual].novo()) render(el); };
  lista.onclick = async (e) => {
    const b = e.target.closest('button[data-i]');
    if (b && (await ABAS[abaAtual].editar(ABAS[abaAtual].itens[Number(b.dataset.i)]))) render(el);
  };

  desenhar();
}
