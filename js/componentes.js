// Janelas reutilizáveis: seletor com busca e formulário curto
import { icone } from './icones.js';
import { esc, normalizar } from './ui.js';

function abrirFolha(html, classe = '') {
  const dlg = document.createElement('dialog');
  dlg.className = `folha ${classe}`;
  dlg.innerHTML = html;
  document.body.append(dlg);
  dlg.querySelector('[data-fechar]')?.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => e.target === dlg && dlg.close()); // toque fora fecha
  return dlg;
}

const topo = (titulo) => `
  <div class="folha__topo">
    <strong>${esc(titulo)}</strong>
    <button type="button" class="botao botao--sec botao--icone" data-fechar aria-label="Fechar">${icone('fechar')}</button>
  </div>`;

/**
 * Lista com busca. itens: [{rotulo, detalhe?, ...}]. criar(texto) opcional: cadastra um novo e devolve o item.
 * Resolve com o item escolhido ou null.
 */
export function escolher({ titulo, itens, criar, nomeNovo = 'novo' }) {
  return new Promise((resolve) => {
    const dlg = abrirFolha(`${topo(titulo)}
      <input class="entrada" type="search" placeholder="Digite para buscar…" autocomplete="off" enterkeyhint="search">
      <ul class="opcoes" role="listbox"></ul>`);
    const busca = dlg.querySelector('input');
    const lista = dlg.querySelector('ul');
    let resultado = null;

    const desenhar = () => {
      const q = normalizar(busca.value);
      const achados = itens.filter((i) => normalizar(`${i.rotulo} ${i.detalhe || ''}`).includes(q)).slice(0, 150);
      const texto = busca.value.trim();
      lista.innerHTML =
        achados.map((i) => `<li><button type="button" data-i="${itens.indexOf(i)}">${esc(i.rotulo)}${i.detalhe ? `<small>${esc(i.detalhe)}</small>` : ''}</button></li>`).join('') +
        (!achados.length ? `<li class="opcoes__vazio">${itens.length ? 'Nada encontrado' : 'Nenhum cadastro ainda.<br>Cadastre na aba <b>Cadastros</b>.'}</li>` : '') +
        (criar ? `<li><button type="button" class="opcoes__criar" data-criar>${icone('mais')} ${texto ? `Cadastrar “${esc(texto)}”` : `Cadastrar ${esc(nomeNovo)}`}</button></li>` : '');
    };

    lista.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-criar')) {
        const novo = await criar(busca.value.trim());
        if (novo) { resultado = novo; dlg.close(); }
        return;
      }
      resultado = itens[Number(b.dataset.i)];
      dlg.close();
    });
    busca.addEventListener('input', desenhar);
    dlg.addEventListener('close', () => { dlg.remove(); resolve(resultado); });
    desenhar();
    dlg.showModal();
    busca.focus();
  });
}

/**
 * Formulário curto em janela. campos: [{nome, rotulo, valor?, modo?, opcional?}].
 * Resolve com {nome: valor} ou {excluir: true} ou null (cancelado).
 */
export function formulario({ titulo, campos, botao = 'Salvar', excluir = false, nota = '' }) {
  return new Promise((resolve) => {
    const dlg = abrirFolha(`<form>${topo(titulo)}
      ${nota ? `<p class="sub">${esc(nota)}</p>` : ''}
      ${campos.map((c) => `
        <div class="campo">
          <label for="f-${c.nome}">${esc(c.rotulo)}</label>
          <input class="entrada" id="f-${c.nome}" name="${c.nome}" value="${esc(c.valor)}" autocomplete="off"
            ${c.opcional ? '' : 'required'} ${c.modo ? `inputmode="${c.modo}"` : ''}>
        </div>`).join('')}
      <button class="botao botao--bloco" type="submit">${esc(botao)}</button>
      ${excluir ? `<button class="botao botao--perigo botao--bloco" type="button" data-excluir>${icone('lixeira')} Excluir</button>` : ''}
    </form>`, 'folha--form');
    const form = dlg.querySelector('form');
    let resultado = null;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, String(x).trim()]));
      const faltando = campos.find((c) => !c.opcional && !v[c.nome]);
      if (faltando) { form.querySelector(`#f-${faltando.nome}`).focus(); return; }
      resultado = v;
      dlg.close();
    });
    dlg.querySelector('[data-excluir]')?.addEventListener('click', () => { resultado = { excluir: true }; dlg.close(); });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(resultado); });
    dlg.showModal();
    form.querySelector('input')?.focus();
  });
}
