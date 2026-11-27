// Pesquisa de bens: texto livre, filtros (setor, grupo, subgrupo, situação, status) e leitura da plaqueta pela câmera.
// Usa a cópia local da planilha (funciona sem internet) e atualiza quando há conexão.
import { icone } from '../icones.js';
import { lerDados, chaveNum } from '../dados.js';
import { recarregarDados } from '../sync.js';
import { escolher, abrirFolha, topo } from '../componentes.js';
import { esc, normalizar, toast, botoesLimpar } from '../ui.js';
import { lerCodigo, lidoPorTexto } from '../leitor.js';
import { fotoDoBem } from '../foto.js';
import { SITUACOES } from '../cadastros.js';

export const titulo = 'Pesquisa';

// Filtros ficam guardados enquanto o app está aberto (voltar para a tela mantém a pesquisa)
const f = { q: '', local: '', grupo: '', subgrupo: '', situacao: '', status: 'ativos' };
const MAX = 200;

const desinc = (b) => b.status === 'DESINCORPORADO';
const pendente = (b) => !b.cadastradoEm; // ainda não chegou na planilha

export async function render(el) {
  el.innerHTML = `
    <h2>Pesquisa</h2>
    <div class="com-botao barra-busca">
      <input class="entrada" id="q" type="search" placeholder="Nº, descrição, marca, modelo, série…" autocomplete="off" enterkeyhint="search" value="${esc(f.q)}">
      <button type="button" class="botao botao--icone" id="ler" aria-label="Pesquisar pela plaqueta com a câmera">${icone('codigo')}</button>
    </div>
    <div class="filtros" id="filtros"></div>
    <div class="segmentado segmentado--3" role="radiogroup" id="status">
      ${[['ativos', 'Ativos'], ['desinc', 'Desincorporados'], ['todos', 'Todos']].map(([v, t]) =>
        `<label><input type="radio" name="status" value="${v}" ${f.status === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}
    </div>
    <p class="sub conta" id="conta"></p>
    <ul class="lista" id="res"></ul>`;

  const $ = (id) => el.querySelector('#' + id);
  botoesLimpar(el, icone);
  let d = await lerDados();
  let achados = [];

  function desenharFiltros() {
    const chip = (chave, rotulo, desabilitado = false) => `
      <button type="button" class="chip ${f[chave] ? 'chip--ativo' : ''}" data-filtro="${chave}" ${desabilitado ? 'disabled' : ''}>
        <span>${esc(f[chave] || rotulo)}</span>${f[chave] ? icone('fechar') : '<b>▾</b>'}
      </button>`;
    $('filtros').innerHTML = chip('local', 'Setor') + chip('grupo', 'Grupo') + chip('subgrupo', 'Subgrupo', !f.grupo) + chip('situacao', 'Situação');
  }

  function filtrar() {
    const termos = normalizar(f.q).split(/\s+/).filter(Boolean);
    const num = chaveNum(f.q);
    return d.bens.filter((b) => {
      if (f.status === 'ativos' && desinc(b)) return false;
      if (f.status === 'desinc' && !desinc(b)) return false;
      if (f.local && normalizar(b.localizacao) !== normalizar(f.local)) return false;
      if (f.grupo && normalizar(b.grupo) !== normalizar(f.grupo)) return false;
      if (f.subgrupo && normalizar(b.subgrupo) !== normalizar(f.subgrupo)) return false;
      if (f.situacao && normalizar(b.situacao) !== normalizar(f.situacao)) return false;
      if (!termos.length) return true;
      // Número: 1733 acha 001733 (nº normal ou alternativo)
      if (/^\d+$/.test(f.q.trim()) && (chaveNum(b.patrimonio).includes(num) || chaveNum(b.patrimonioAlt).includes(num))) return true;
      const texto = normalizar([b.patrimonio, b.patrimonioAlt, b.descricao, b.marca, b.modelo, b.serie, b.especificacao].join(' '));
      return termos.every((t) => texto.includes(t)); // todas as palavras, em qualquer ordem
    }).sort((a, b) => String(a.patrimonio).localeCompare(String(b.patrimonio), 'pt-BR', { numeric: true }));
  }

  function desenhar() {
    achados = filtrar();
    const temFiltro = f.q || f.local || f.grupo || f.subgrupo || f.situacao;
    $('conta').textContent = !d.bens.length ? '' : `${achados.length} ${achados.length === 1 ? 'bem encontrado' : 'bens encontrados'}`
      + (achados.length > MAX ? ` · mostrando ${MAX}` : '');
    $('res').innerHTML = achados.slice(0, MAX).map((b, i) => `
      <li><button type="button" data-i="${i}">
        <span>
          <strong>${esc(b.patrimonio)}${b.patrimonioAlt ? ` <small class="alt">alt. ${esc(b.patrimonioAlt)}</small>` : ''} · ${esc(b.descricao)}</strong>
          <small>${esc(b.localizacao || 'Sem setor')} · ${esc([b.grupo, b.subgrupo].filter(Boolean).join(' › '))}</small>
          ${desinc(b) ? '<em class="selo selo--erro">Desincorporado</em>' : pendente(b) ? '<em class="selo selo--aviso">Aguardando envio</em>' : ''}
        </span>${icone('seta')}
      </button></li>`).join('')
      || `<li class="lista__vazio">${d.bens.length ? (temFiltro ? 'Nenhum bem com esses filtros.' : 'Nenhum bem.') : 'Nenhum bem cadastrado ainda.'}</li>`;
  }

  // Busca por texto (pequena pausa para não refazer a cada letra)
  let espera;
  $('q').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { f.q = $('q').value; desenhar(); }, 150); });
  el.querySelectorAll('input[name="status"]').forEach((r) => (r.onchange = () => { f.status = r.value; desenhar(); }));

  $('filtros').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-filtro]');
    if (!b) return;
    const chave = b.dataset.filtro;
    if (f[chave]) { // toque num filtro ativo = limpar
      f[chave] = '';
      if (chave === 'grupo') f.subgrupo = '';
    } else {
      const listas = {
        local: () => d.locais.map((x) => ({ nome: x, rotulo: x })),
        grupo: () => d.grupos.map((g) => ({ nome: g.nome, rotulo: g.nome })),
        subgrupo: () => d.subgrupos.filter((s) => normalizar(s.grupo) === normalizar(f.grupo)).map((s) => ({ nome: s.nome, rotulo: s.nome })),
        situacao: () => SITUACOES.map((x) => ({ nome: x, rotulo: x })),
      };
      const titulos = { local: 'Setor', grupo: 'Grupo', subgrupo: `Subgrupo — ${f.grupo}`, situacao: 'Situação' };
      const item = await escolher({ titulo: titulos[chave], itens: listas[chave]() });
      if (!item) return;
      f[chave] = item.nome;
      if (chave === 'grupo') f.subgrupo = '';
    }
    desenharFiltros();
    desenhar();
  });

  $('res').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) mostrarBem(achados[Number(b.dataset.i)]);
  });

  // Câmera: lê a plaqueta (nº normal ou alternativo) e abre a ficha direto
  $('ler').onclick = async () => {
    let n;
    try { n = await lerCodigo('Pesquisar plaqueta'); } catch (err) { return toast(err.message, 'erro'); }
    if (!n) return;
    const k = chaveNum(n);
    const bem = d.bens.find((b) => chaveNum(b.patrimonio) === k) || d.bens.find((b) => chaveNum(b.patrimonioAlt) === k);
    if (bem) {
      if (lidoPorTexto()) toast(`Lido pelo número impresso: ${n}. Confira!`, 'aviso');
      return mostrarBem(bem, k);
    }
    const reg = d.desincorporados.find((x) => chaveNum(x.patrimonio) === k);
    f.q = n; $('q').value = n; $('q').dispatchEvent(new Event('input'));
    toast(reg ? `Nº ${n} foi desincorporado em ${reg.data}: ${reg.descricao}` : `Nº ${n} não encontrado nos bens`, reg ? 'aviso' : 'erro');
  };

  desenharFiltros();
  desenhar();
  // Voltou da tela Alterar: abre a ficha do bem alterado
  const ver = new URLSearchParams(location.hash.split('?')[1] || '').get('ver');
  if (ver) {
    history.replaceState(null, '', '#/pesquisa');
    const bem = d.bens.find((b) => chaveNum(b.patrimonio) === chaveNum(ver));
    if (bem) mostrarBem(bem);
  }
  // Traz a planilha atualizada (se houver internet) e redesenha
  if (await recarregarDados(30000)) { d = await lerDados(); desenhar(); }
}

/** Ficha completa do bem, em janela. `lido` = nº lido pela câmera (destaca se foi o alternativo). */
function mostrarBem(b, lido) {
  const pelaAlt = lido && chaveNum(b.patrimonioAlt) === lido && chaveNum(b.patrimonio) !== lido;
  const linhas = [
    ['Nº de Patrimônio', b.patrimonio], ['Nº alternativo', b.patrimonioAlt],
    ['Grupo', b.grupo], ['Subgrupo', b.subgrupo], ['Descrição', b.descricao],
    ['Marca', b.marca], ['Modelo', b.modelo], ['Nº de Série', b.serie], ['Especificação', b.especificacao],
    ['Situação', b.situacao], ['Doação', b.doacao], ['Localização', b.localizacao],
    ['Cadastrado em', b.cadastradoEm], ['Atualizado em', b.atualizadoEm],
  ].filter(([, v]) => v);
  const link = /^https?:\/\//.test(b.foto || '') ? b.foto : '';
  const dlg = abrirFolha(`${topo(`Nº ${b.patrimonio}`)}
    <div class="ficha">
      <div class="ficha__foto" ${link ? '' : 'hidden'}><p class="sub">Carregando foto…</p></div>
      ${desinc(b) ? '<p class="selo selo--erro">Desincorporado</p>' : pendente(b) ? '<p class="selo selo--aviso">Aguardando envio para a planilha</p>' : '<p class="selo selo--ok">Ativo</p>'}
      ${pelaAlt ? `<p class="aviso-campo">${icone('alerta')}<span>Você leu a plaqueta antiga (nº alternativo ${esc(b.patrimonioAlt)}).</span></p>` : ''}
      <dl>${linhas.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    </div>
    ${desinc(b) ? '' : `<a class="botao botao--bloco" href="#/alterar?n=${encodeURIComponent(b.patrimonio)}" data-alterar>${icone('editar')} Alterar</a>`}`);
  dlg.querySelector('[data-alterar]')?.addEventListener('click', () => dlg.close());
  // Foto logo no alto da ficha (tocar amplia)
  const caixa = dlg.querySelector('.ficha__foto');
  fotoDoBem(b).then((url) => {
    if (!url) return void (caixa.hidden = true);
    caixa.hidden = false;
    caixa.innerHTML = `<img src="${url}" alt="Foto do bem ${esc(b.patrimonio)}">`;
    caixa.onclick = () => caixa.classList.toggle('ficha__foto--cheia');
  }).catch((err) => {
    caixa.innerHTML = `<p class="sub">Foto não carregou: ${esc(err.message)}</p>`
      + `<a class="botao botao--sec botao--bloco" href="${esc(link)}" target="_blank" rel="noopener">${icone('camera')} Abrir no Drive</a>`;
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}
