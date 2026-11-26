import { icone } from '../icones.js';
import { db } from '../db.js';
import { lerDados } from '../dados.js';
import { registrar, enviar, situacaoDe } from '../sync.js';
import { escolherGrupo, escolherSubgrupo, locais, situacoes, rotuloCod } from '../cadastros.js';
import { esc, normalizar, toast } from '../ui.js';
import { lerCodigo } from '../leitor.js';
import { prepararFoto } from '../foto.js';

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

export async function render(el) {
  const escolha = { grupo: null, subgrupo: null, local: (await db.ler('kv', 'ultimaLocalizacao')) || null, situacao: null };

  el.innerHTML = `
    <h2>Incorporar</h2>
    <p class="sub">Cadastrar um bem novo. <span class="obrig">*</span> obrigatório</p>

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
      ${seletor('situacao', 'Situação', false, 'Escolher situação')}

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
        <input type="file" id="arquivo-foto" accept="image/*" capture="environment" hidden>
        <button type="button" class="botao botao--sec" id="foto">${icone('camera')} Tirar foto</button>
        <div class="foto-previa" id="previa" hidden>
          <img alt="Foto do bem">
          <button type="button" class="botao botao--sec botao--icone" id="tirar-foto" aria-label="Remover foto">${icone('lixeira')}</button>
        </div>
      </div>

      <button class="botao botao--bloco botao--incorporar" type="submit" id="salvar">${icone('mais')} Salvar bem</button>
    </form>
  `;

  const $ = (id) => el.querySelector('#' + id);
  const valorTexto = (id) => $(id).value.trim();

  function mostrar(id, txt) {
    const v = $(id).querySelector('.seletor__valor');
    v.textContent = txt || '';
    $(id).classList.toggle('vazio', !txt);
  }
  function atualizarSeletores() {
    mostrar('grupo', escolha.grupo && rotuloCod(escolha.grupo));
    mostrar('subgrupo', escolha.subgrupo && rotuloCod(escolha.subgrupo));
    mostrar('local', escolha.local);
    mostrar('situacao', escolha.situacao);
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
  $('situacao').onclick = async () => {
    const s = await situacoes.escolher();
    if (s) { escolha.situacao = s.nome; atualizarSeletores(); }
  };
  el.querySelectorAll('[data-ler]').forEach((b) => {
    b.onclick = async () => {
      const id = b.dataset.ler;
      try {
        const n = await lerCodigo(id === 'patrimonio' ? 'Nº de Patrimônio' : 'Nº alternativo (plaqueta antiga)');
        if (!n) return;
        $(id).value = n;
        $(id).dispatchEvent(new Event('input'));
        toast(`Lido: ${n}`, 'ok');
      } catch (e) { toast(e.message, 'erro'); }
    };
  });
  // Foto: abre a câmera do celular; a foto é diminuída e mostrada em miniatura
  let foto = null;
  function mostrarFoto() {
    $('previa').hidden = !foto;
    $('foto').innerHTML = `${icone('camera')} ${foto ? 'Trocar foto' : 'Tirar foto'}`;
    if (foto) $('previa').querySelector('img').src = foto.url;
  }
  $('foto').onclick = () => $('arquivo-foto').click();
  $('arquivo-foto').onchange = async (e) => {
    const arq = e.target.files[0];
    e.target.value = '';
    if (!arq) return;
    try { foto = await prepararFoto(arq); mostrarFoto(); } catch { toast('Não consegui usar essa foto', 'erro'); }
  };
  $('tirar-foto').onclick = () => { foto = null; mostrarFoto(); };

  // Avisa se o nº já existe
  async function conferirPatrimonio() {
    const n = valorTexto('patrimonio');
    const aviso = $('aviso-patrimonio');
    const b = n && (await lerDados()).bens.find((x) => normalizar(x.patrimonio) === normalizar(n));
    aviso.hidden = !b;
    if (b) aviso.innerHTML = `${icone('alerta')} Já cadastrado${b.status === 'DESINCORPORADO' ? ' (desincorporado)' : ''}: <b>${esc(b.descricao)}</b>${b.localizacao ? ` · ${esc(b.localizacao)}` : ''}`;
    return !b;
  }
  $('patrimonio').addEventListener('input', () => { marcarOk('patrimonio'); conferirPatrimonio(); });
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
    if (!(await conferirPatrimonio())) return toast('Esse nº de patrimônio já está cadastrado', 'erro');

    const bem = {
      patrimonio: valorTexto('patrimonio'),
      patrimonioAlt: valorTexto('patrimonioAlt'),
      grupoCod: escolha.grupo.codigo || '',
      grupo: escolha.grupo.nome,
      subgrupoCod: escolha.subgrupo.codigo || '',
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

    $('salvar').disabled = true;
    const op = await registrar('incorporar', foto ? { bem, foto: { base64: foto.base64, mime: foto.mime } } : { bem });
    await db.gravar('kv', escolha.local, 'ultimaLocalizacao');

    // Limpa para o próximo bem, mantendo só a localização
    $('form').reset();
    Object.assign(escolha, { grupo: null, subgrupo: null, situacao: null });
    atualizarSeletores();
    $('aviso-patrimonio').hidden = true;
    foto = null; mostrarFoto();
    $('salvar').disabled = false;
    $('patrimonio').focus();

    if (!navigator.onLine) return toast(`Nº ${bem.patrimonio} salvo no celular. Envia quando voltar a internet.`, 'aviso');
    toast(`Nº ${bem.patrimonio} salvo. Enviando…`);
    await enviar();
    const s = await situacaoDe(op.id);
    if (s.enviado) toast(`Nº ${bem.patrimonio} enviado para a planilha ✓`, 'ok');
    else if (s.erro) toast(`Planilha recusou o nº ${bem.patrimonio}: ${s.erro}`, 'erro');
    else toast(`Nº ${bem.patrimonio} salvo no celular. Envia quando a conexão melhorar.`, 'aviso');
  };

  atualizarSeletores();
}
