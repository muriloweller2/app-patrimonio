import { icone } from '../icones.js';
import { db } from '../db.js';
import { lerDados, situacaoNumero, chaveNum } from '../dados.js';
import { registrar, recarregarDados, estado, alterarBem } from '../sync.js';
import { escolherGrupo, escolherSubgrupo, locais, SITUACOES, rotuloCod } from '../cadastros.js';
import { esc, normalizar, toast, botoesLimpar, botaoX } from '../ui.js';
import { lerCodigo, lidoPorTexto } from '../leitor.js';
import { prepararFoto, fotoDoBem } from '../foto.js';
import { tirarFoto } from '../camera-foto.js';
import { editarFoto } from '../editor-foto.js';

export const titulo = 'Incorporar';

const seletor = (id, rotulo, obrigatorio, dica) => `
  <div class="campo" data-campo="${id}">
    <label for="${id}">${rotulo}${obrigatorio ? ' <span class="obrig">*</span>' : ''}</label>
    <button type="button" class="entrada seletor" id="${id}">
      <span class="seletor__valor" data-vazio="${esc(dica)}"></span>${icone('busca')}
    </button>
  </div>`;

const texto = (id, rotulo, { obrigatorio = false, modo = '', dica = '', area = false } = {}) => `
  <div class="campo" data-campo="${id}">
    <label for="${id}">${rotulo}${obrigatorio ? ' <span class="obrig">*</span>' : ''}</label>
    ${area
      ? `<textarea class="entrada" id="${id}" rows="2" placeholder="${esc(dica)}"></textarea>`
      : `<input class="entrada" id="${id}" autocomplete="off" ${modo ? `inputmode="${modo}"` : ''} placeholder="${esc(dica)}">`}
  </div>`;

// Tela Alterar (#/alterar?n=002756): o mesmo formulário, já preenchido com o bem
export const alterarTela = {
  titulo: 'Alterar',
  render: (el) => render(el, new URLSearchParams(location.hash.split('?')[1] || '').get('n') || ''),
};

const CAMPOS_TEXTO = ['patrimonio', 'patrimonioAlt', 'descricao', 'marca', 'modelo', 'serie', 'especificacao'];

/** `numeroEdicao` = nº do bem a alterar (sem ele, é incorporação de bem novo). */
export async function render(el, numeroEdicao = null) {
  const editando = numeroEdicao !== null;
  const dados = await lerDados();
  const original = editando ? dados.bens.find((b) => chaveNum(b.patrimonio) === chaveNum(numeroEdicao)) : null;
  if (editando && !original) {
    el.innerHTML = `<h2>Alterar</h2><p class="sub">Bem nº ${esc(numeroEdicao)} não encontrado.</p>
      <a class="botao botao--sec botao--bloco" href="#/pesquisa">${icone('busca')} Ir para a Pesquisa</a>`;
    return;
  }
  const mesmo = (a, b) => normalizar(a) === normalizar(b);
  const escolha = editando ? {
    grupo: original.grupo ? (dados.grupos.find((g) => mesmo(g.nome, original.grupo)) || { nome: original.grupo }) : null,
    subgrupo: original.subgrupo ? (dados.subgrupos.find((x) => mesmo(x.grupo, original.grupo) && mesmo(x.nome, original.subgrupo))
      || { grupo: original.grupo, nome: original.subgrupo }) : null,
    local: original.localizacao || null,
    situacao: original.situacao || null,
  } : { grupo: null, subgrupo: null, local: (await db.ler('kv', 'ultimaLocalizacao')) || null, situacao: null };

  el.innerHTML = `
    <h2>${editando ? `Alterar nº ${esc(original.patrimonio)}` : 'Incorporar'}</h2>
    <p class="sub">${editando ? 'Mude o que precisar e toque em Salvar alterações.' : 'Cadastrar um bem novo.'} <span class="obrig">*</span> obrigatório</p>

    <form id="form" class="cartao" novalidate autocomplete="off">
      <div class="campo" data-campo="patrimonio">
        <label for="patrimonio">Nº de Patrimônio <span class="obrig">*</span></label>
        <div class="com-botao">
          <input class="entrada entrada--grande" id="patrimonio" inputmode="numeric" enterkeyhint="next">
          <button type="button" class="botao botao--sec botao--icone" data-ler="patrimonio" aria-label="Ler código de barras">${icone('codigo')}</button>
        </div>
        <div id="aviso-patrimonio" class="aviso-campo" hidden></div>
      </div>
      <div class="campo" data-campo="patrimonioAlt">
        <label for="patrimonioAlt">Nº de Patrimônio alternativo <small class="dica">plaqueta antiga verde</small></label>
        <div class="com-botao">
          <input class="entrada" id="patrimonioAlt" inputmode="numeric" placeholder="Opcional">
          <button type="button" class="botao botao--sec botao--icone" data-ler="patrimonioAlt" aria-label="Ler código da plaqueta antiga">${icone('codigo')}</button>
        </div>
        <div id="aviso-patrimonioAlt" class="aviso-campo" hidden></div>
      </div>
      ${seletor('grupo', 'Grupo', true, 'Escolher grupo')}
      ${seletor('subgrupo', 'Subgrupo', true, 'Escolha o grupo primeiro')}
      ${texto('descricao', 'Descrição do bem', { obrigatorio: true })}
      <div class="duas-colunas">
        ${texto('marca', 'Marca')}
        ${texto('modelo', 'Modelo')}
      </div>
      ${texto('serie', 'Nº de Série')}
      ${texto('especificacao', 'Especificação', { dica: 'Cor, dimensões etc.', area: true })}
      <div class="campo">
        <span class="rotulo">Situação <small class="dica">toque de novo para desmarcar</small></span>
        <div class="segmentado segmentado--5" role="radiogroup" id="situacao">
          ${SITUACOES.map((s) => `<label><input type="radio" name="situacao" value="${s}"><span>${s}</span></label>`).join('')}
        </div>
      </div>

      <div class="campo">
        <span class="rotulo">Incorporado por doação?</span>
        <div class="segmentado" role="radiogroup">
          <label><input type="radio" name="doacao" value="Não" checked><span>Não</span></label>
          <label><input type="radio" name="doacao" value="Sim"><span>Sim</span></label>
        </div>
      </div>

      ${seletor('local', 'Localização', true, 'Escolher setor')}

      <div class="campo">
        <span class="rotulo">Foto do bem <small class="dica">opcional</small></span>
        <button type="button" class="botao botao--sec" id="foto">${icone('camera')} Tirar foto</button>
        <p class="sub" id="foto-nota" hidden></p>
        <div class="foto-previa" id="previa" hidden>
          <img alt="Foto do bem">
          <div class="foto-previa__acoes">
            <button type="button" class="botao botao--sec botao--icone" id="editar-foto" aria-label="Editar foto">${icone('editar')}</button>
            <button type="button" class="botao botao--sec botao--icone" id="tirar-foto" aria-label="Remover foto">${icone('lixeira')}</button>
          </div>
        </div>
      </div>

      <button class="botao botao--bloco botao--incorporar" type="submit" id="salvar">${editando ? `${icone('ok')} Salvar alterações` : `${icone('mais')} Salvar bem`}</button>
      ${editando ? '<button class="botao botao--sec botao--bloco" type="button" id="cancelar">Cancelar</button>' : ''}
    </form>
  `;

  const $ = (id) => el.querySelector('#' + id);
  botoesLimpar(el, icone);
  // "x" nos campos de escolher: limpa a escolha (limpar o grupo limpa também o subgrupo)
  const xSel = {};
  ['grupo', 'subgrupo', 'local'].forEach((id) => {
    xSel[id] = botaoX($(id), icone, 'limpavel--seletor');
    xSel[id].onclick = () => {
      escolha[id] = null;
      if (id === 'grupo') escolha.subgrupo = null;
      atualizarSeletores();
    };
  });
  const valorTexto = (id) => $(id).value.trim();

  function mostrar(id, txt) {
    const v = $(id).querySelector('.seletor__valor');
    v.textContent = txt || '';
    $(id).classList.toggle('seletor--vazio', !txt);
    xSel[id].hidden = !txt;
  }
  function atualizarSeletores() {
    mostrar('grupo', escolha.grupo && rotuloCod(escolha.grupo));
    mostrar('subgrupo', escolha.subgrupo && rotuloCod(escolha.subgrupo));
    mostrar('local', escolha.local);
    $('subgrupo').disabled = !escolha.grupo;
  }
  const marcarOk = (id) => el.querySelector(`[data-campo="${id}"]`)?.classList.remove('invalido');

  $('grupo').onclick = async () => {
    const g = await escolherGrupo();
    if (!g) return;
    if (!escolha.grupo || normalizar(g.nome) !== normalizar(escolha.grupo.nome)) escolha.subgrupo = null;
    escolha.grupo = g;
    atualizarSeletores(); marcarOk('grupo');
  };
  $('subgrupo').onclick = async () => {
    const s = await escolherSubgrupo(escolha.grupo);
    if (s) { escolha.subgrupo = s; atualizarSeletores(); marcarOk('subgrupo'); }
  };
  $('local').onclick = async () => {
    const l = await locais.escolher();
    if (l) { escolha.local = l.nome; atualizarSeletores(); marcarOk('local'); }
  };
  // Situação: opções fixas; tocar na marcada desmarca
  const radiosSit = [...el.querySelectorAll('input[name="situacao"]')];
  const marcarSituacao = () => radiosSit.forEach((r) => (r.checked = !!escolha.situacao && normalizar(r.value) === normalizar(escolha.situacao)));
  radiosSit.forEach((r) => r.addEventListener('click', () => {
    escolha.situacao = escolha.situacao && normalizar(escolha.situacao) === normalizar(r.value) ? null : r.value;
    marcarSituacao();
  }));
  el.querySelectorAll('[data-ler]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.ler;
      try {
        const n = await lerCodigo(id === 'patrimonio' ? 'Nº de Patrimônio' : 'Nº alternativo (plaqueta antiga)');
        if (!n) return;
        $(id).value = n;
        $(id).dispatchEvent(new Event('input'));
        toast(lidoPorTexto() ? `Lido pelo número impresso: ${n}. Confira!` : `Lido: ${n}`, 'ok');
      } catch (e) { toast(e.message, 'erro'); }
    };
  });
  // Foto: abre a câmera do celular; a foto é diminuída e mostrada em miniatura
  let foto = null;
  let fotoMudou = false; // na alteração: só envia foto se trocou ou tirou
  function mostrarFoto() {
    $('previa').hidden = !foto;
    $('foto').innerHTML = `${icone('camera')} ${foto ? 'Trocar foto' : 'Tirar foto'}`;
    if (foto) $('previa').querySelector('img').src = foto.url;
  }
  // Câmera própria (flash, foco, zoom) → editor (recortar, girar, texto) → foto diminuída para enviar
  async function usarFoto(arquivo) {
    if (!arquivo) return;
    try {
      const editado = await editarFoto(arquivo);
      if (!editado) return;
      foto = { ...(await prepararFoto(editado)), blob: editado };
      fotoMudou = true;
      mostrarFoto();
    } catch { toast('Não consegui usar essa foto', 'erro'); }
  }
  $('foto').onclick = async () => usarFoto(await tirarFoto());
  $('editar-foto').onclick = async () => foto && usarFoto(foto.blob || await (await fetch(foto.url)).blob());
  $('tirar-foto').onclick = () => { foto = null; fotoMudou = true; mostrarFoto(); };

  // Avisa na hora se o nº já foi incorporado ou desincorporado (confere nos bens e nas desincorporações)
  function avisar(id, s) {
    const aviso = $('aviso-' + id);
    aviso.hidden = !s;
    if (!s) return;
    const des = s.tipo === 'desincorporado';
    aviso.classList.add('aviso-campo--erro'); // número repetido sempre impede salvar
    const b = s.bem || s.registro;
    const quando = s.registro?.data || (des && s.bem?.atualizadoEm?.slice(0, 10)) || '';
    const onde = s.comoAlt
      ? `Já é o nº alternativo do bem nº ${esc(s.bem.patrimonio)}${des ? ' (desincorporado)' : ''}`
      : des ? 'Desincorporado' : 'Já incorporado';
    aviso.innerHTML = `${icone('alerta')}<span>${onde}${quando ? ` em ${esc(quando)}` : ''}: <b>${esc(b.descricao || '')}</b>`
      + `${s.bem?.localizacao ? ` · ${esc(s.bem.localizacao)}` : ''}</span>`;
  }
  // Se o nº parece repetido, confere na planilha na hora (pode ter sido apagado lá)
  async function conferirNumero(id) {
    // Na alteração, o próprio bem não conta como repetido
    const doProprio = (x) => x && editando && x.bem && chaveNum(x.bem.patrimonio) === chaveNum(original.patrimonio) ? null : x;
    let s = doProprio(situacaoNumero(await lerDados(), valorTexto(id)));
    if (s && await recarregarDados(3000)) s = doProprio(situacaoNumero(await lerDados(), valorTexto(id)));
    // Os dois campos do mesmo bem não podem ter o mesmo número
    if (!s && id === 'patrimonioAlt' && valorTexto('patrimonioAlt') && chaveNum(valorTexto('patrimonioAlt')) === chaveNum(valorTexto('patrimonio'))) {
      s = { tipo: 'ativo', comoAlt: false, registro: { descricao: 'é igual ao nº de patrimônio acima' } };
    }
    avisar(id, s);
    return !s;
  }
  const conferirPatrimonio = () => conferirNumero('patrimonio');
  const conferirAlternativo = () => conferirNumero('patrimonioAlt');
  // Ao abrir a tela, já traz a planilha atualizada
  recarregarDados().then((ok) => {
    if (!ok) return;
    if (valorTexto('patrimonio')) conferirPatrimonio();
    if (valorTexto('patrimonioAlt')) conferirAlternativo();
  });
  $('patrimonio').addEventListener('input', () => { marcarOk('patrimonio'); conferirPatrimonio(); if (valorTexto('patrimonioAlt')) conferirAlternativo(); });
  $('patrimonioAlt').addEventListener('input', conferirAlternativo);
  $('descricao').addEventListener('input', () => marcarOk('descricao'));

  $('form').onsubmit = async (e) => {
    e.preventDefault();
    const faltando = [
      ['patrimonio', valorTexto('patrimonio')],
      ['grupo', escolha.grupo],
      ['subgrupo', escolha.subgrupo],
      ['descricao', valorTexto('descricao')],
      ['local', escolha.local],
    ].filter(([, v]) => !v).map(([id]) => id);

    el.querySelectorAll('.invalido').forEach((c) => c.classList.remove('invalido'));
    if (faltando.length) {
      faltando.forEach((id) => el.querySelector(`[data-campo="${id}"]`).classList.add('invalido'));
      el.querySelector(`[data-campo="${faltando[0]}"]`).scrollIntoView({ behavior: 'smooth', block: 'center' });
      return toast('Preencha os campos obrigatórios', 'erro');
    }
    if (!(await conferirPatrimonio())) {
      $('patrimonio').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return toast('Esse nº de patrimônio já existe. Veja o aviso abaixo do campo.', 'erro');
    }
    if (valorTexto('patrimonioAlt') && !(await conferirAlternativo())) {
      $('patrimonioAlt').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return toast('Esse nº alternativo já pertence a outro bem. Veja o aviso abaixo do campo.', 'erro');
    }

    const bem = {
      patrimonio: valorTexto('patrimonio'),
      patrimonioAlt: valorTexto('patrimonioAlt'),
      grupo: escolha.grupo.nome,
      subgrupo: escolha.subgrupo.nome,
      descricao: valorTexto('descricao'),
      marca: valorTexto('marca'),
      modelo: valorTexto('modelo'),
      serie: valorTexto('serie'),
      especificacao: valorTexto('especificacao'),
      situacao: escolha.situacao || '',
      doacao: el.querySelector('input[name="doacao"]:checked').value,
      localizacao: escolha.local,
    };

    if (editando) {
      bem.foto = original.foto || '';
      const mudou = fotoMudou || Object.keys(bem).some((k) => String(bem[k] ?? '') !== String(original[k] ?? ''));
      if (!mudou) { toast('Nada mudou', 'aviso'); return history.back(); }
      $('salvar').disabled = true;
      await alterarBem(original.patrimonio, bem, !fotoMudou ? undefined : foto ? { base64: foto.base64, mime: foto.mime } : null);
      toast(`Nº ${bem.patrimonio} alterado ✓ · aguardando envio em Pendências`, 'ok');
      location.hash = `#/pesquisa?ver=${encodeURIComponent(bem.patrimonio)}`;
      return;
    }

    $('salvar').disabled = true;
    await registrar('incorporar', foto ? { bem, foto: { base64: foto.base64, mime: foto.mime } } : { bem });
    await db.gravar('kv', escolha.local, 'ultimaLocalizacao');

    // Limpa para o próximo bem, mantendo só a localização
    $('form').reset();
    Object.assign(escolha, { grupo: null, subgrupo: null, situacao: null });
    atualizarSeletores();
    $('aviso-patrimonio').hidden = true;
    $('aviso-patrimonioAlt').hidden = true;
    foto = null; mostrarFoto();
    $('salvar').disabled = false;
    $('patrimonio').focus();

    // Não envia: fica na fila de Pendências até o usuário apertar Enviar
    const { pendentes } = await estado();
    toast(`Nº ${bem.patrimonio} salvo ✓ · ${pendentes} aguardando envio em Pendências`, 'ok');
  };

  atualizarSeletores();
  marcarSituacao();

  if (editando) {
    CAMPOS_TEXTO.forEach((id) => ($(id).value = original[id] || ''));
    const doacao = el.querySelector(`input[name="doacao"][value="${original.doacao === 'Sim' ? 'Sim' : 'Não'}"]`);
    if (doacao) doacao.checked = true;
    el.querySelectorAll('.entrada').forEach((i) => i.dispatchEvent(new Event('input'))); // mostra os "x" de limpar
    $('cancelar').onclick = () => history.back();
    // Foto atual do bem
    const nota = $('foto-nota');
    if (/^https?:/.test(original.foto || '')) { nota.hidden = false; nota.textContent = 'Carregando a foto atual…'; }
    fotoDoBem(original).then((url) => {
      nota.hidden = true;
      if (url && !fotoMudou) { foto = { url }; mostrarFoto(); }
    }).catch((err) => {
      nota.hidden = false;
      nota.textContent = `A foto atual não carregou (${err.message}). Ela continua salva, a não ser que você tire outra.`;
    });
  }
}
