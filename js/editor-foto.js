// Editor da foto do bem: recortar (com proporções), girar e escrever texto (cor e tamanho) gravado na imagem.
// Uso: const blob = await editarFoto(arquivoOuBlob); // null se cancelar
import { icone } from './icones.js';
import { formulario } from './componentes.js';

const LADO_MAX = 2048; // trabalha numa cópia menor: rápido no celular e ainda nítido
const CORES = ['#ffffff', '#111111', '#ffd400', '#ff3b30', '#34c759', '#0a84ff'];
const PROPORCOES = [['livre', 'Livre', 0], ['1:1', 'Quadrada', 1], ['4:3', '4:3', 4 / 3], ['3:4', '3:4', 3 / 4]];
const MIN_RECORTE = 40; // px da imagem
const PEGA = 28; // área de toque dos cantos, px da tela

export async function editarFoto(arquivo) {
  const img = await createImageBitmap(arquivo);
  const k = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
  let base = document.createElement('canvas');
  base.width = Math.round(img.width * k);
  base.height = Math.round(img.height * k);
  base.getContext('2d').drawImage(img, 0, 0, base.width, base.height);
  img.close?.();

  // Estado (tudo em pixels da imagem já girada)
  let recorte = { x: 0, y: 0, w: base.width, h: base.height };
  let proporcao = 0;
  let textos = []; // { texto, x, y (centro), tam, cor }
  let selecionado = null;
  let modo = 'recorte';

  const dlg = document.createElement('dialog');
  dlg.className = 'editor';
  dlg.innerHTML = `
    <div class="editor__topo">
      <button type="button" class="botao botao--sec" data-cancelar>Cancelar</button>
      <strong>Editar foto</strong>
      <button type="button" class="botao" data-pronto>${icone('ok')} Usar</button>
    </div>
    <div class="editor__palco"><canvas></canvas></div>
    <div class="editor__painel">
      <div class="segmentos editor__modos">
        <button type="button" data-modo="recorte" aria-selected="true">${icone('recortar')}<span>Recortar</span></button>
        <button type="button" data-modo="texto" aria-selected="false">${icone('texto')}<span>Texto</span></button>
      </div>
      <div data-painel="recorte">
        <div class="filtros">${PROPORCOES.map(([id, nome]) => `<button type="button" class="chip ${id === 'livre' ? 'chip--ativo' : ''}" data-prop="${id}">${nome}</button>`).join('')}</div>
        <div class="linha-botoes">
          <button type="button" class="botao botao--sec" data-girar>${icone('girar')} Girar</button>
          <button type="button" class="botao botao--sec" data-inteira>Foto inteira</button>
        </div>
      </div>
      <div data-painel="texto" hidden>
        <button type="button" class="botao botao--sec botao--bloco" data-novo-texto>${icone('mais')} Adicionar texto</button>
        <div data-opcoes-texto hidden>
          <div class="editor__cores">${CORES.map((c) => `<button type="button" data-cor="${c}" style="--c:${c}" aria-label="Cor ${c}"></button>`).join('')}</div>
          <label class="editor__tam">Tamanho <input type="range" min="2" max="16" step="0.5" data-tam></label>
          <div class="linha-botoes">
            <button type="button" class="botao botao--sec" data-editar-texto>${icone('editar')} Editar</button>
            <button type="button" class="botao botao--perigo" data-apagar-texto>${icone('lixeira')} Apagar</button>
          </div>
        </div>
        <p class="editor__dica" data-dica-texto>Arraste o texto para mudar de lugar. Toque nele para mudar cor e tamanho.</p>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  const $ = (s) => dlg.querySelector(s);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  // ── Desenho ──
  // A vista mostra a foto inteira no modo recorte e só a parte recortada no modo texto
  let vista = { x: 0, y: 0, w: 0, h: 0, s: 1, ox: 0, oy: 0 };
  const dpr = () => window.devicePixelRatio || 1;
  const fonte = (t) => `700 ${t.tam}px system-ui, sans-serif`;

  function medir(t) {
    ctx.save(); ctx.font = fonte(t);
    const linhas = t.texto.split('\n');
    const w = Math.max(...linhas.map((l) => ctx.measureText(l).width));
    ctx.restore();
    return { w, h: linhas.length * t.tam * 1.2 };
  }

  function desenharTexto(c, t, dx = 0, dy = 0) {
    c.save();
    c.font = fonte(t);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(2, t.tam / 7);
    c.strokeStyle = ['#ffffff', '#ffd400', '#34c759'].includes(t.cor) ? 'rgba(0,0,0,.85)' : 'rgba(255,255,255,.9)';
    c.fillStyle = t.cor;
    const linhas = t.texto.split('\n');
    linhas.forEach((l, i) => {
      const y = t.y - dy + (i - (linhas.length - 1) / 2) * t.tam * 1.2;
      c.strokeText(l, t.x - dx, y);
      c.fillText(l, t.x - dx, y);
    });
    c.restore();
  }

  function desenhar() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr());
    canvas.height = Math.round(r.height * dpr());
    const area = modo === 'recorte' ? { x: 0, y: 0, w: base.width, h: base.height } : recorte;
    const s = Math.min(r.width / area.w, r.height / area.h) * 0.96;
    vista = { ...area, s, ox: (r.width - area.w * s) / 2, oy: (r.height - area.h * s) / 2 };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr() * s, 0, 0, dpr() * s, dpr() * (vista.ox - area.x * s), dpr() * (vista.oy - area.y * s));
    if (modo === 'texto') { ctx.save(); ctx.beginPath(); ctx.rect(recorte.x, recorte.y, recorte.w, recorte.h); ctx.clip(); }
    ctx.drawImage(base, 0, 0);
    textos.forEach((t) => desenharTexto(ctx, t));
    if (modo === 'texto') ctx.restore();

    if (modo === 'recorte') {
      // Escurece fora do recorte, borda, grade de terços e cantos
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath();
      ctx.rect(0, 0, base.width, base.height);
      ctx.rect(recorte.x, recorte.y, recorte.w, recorte.h);
      ctx.fill('evenodd');
      const lw = 2 / s;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = lw;
      ctx.strokeRect(recorte.x, recorte.y, recorte.w, recorte.h);
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = lw / 2;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(recorte.x + recorte.w * i / 3, recorte.y); ctx.lineTo(recorte.x + recorte.w * i / 3, recorte.y + recorte.h);
        ctx.moveTo(recorte.x, recorte.y + recorte.h * i / 3); ctx.lineTo(recorte.x + recorte.w, recorte.y + recorte.h * i / 3);
        ctx.stroke();
      }
      const L = 22 / s;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5 / s;
      cantos().forEach(([x, y, sx, sy]) => {
        ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
      });
    } else if (selecionado) {
      const m = medir(selecionado), p = 8 / s;
      ctx.setLineDash([8 / s, 6 / s]);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / s;
      ctx.strokeRect(selecionado.x - m.w / 2 - p, selecionado.y - m.h / 2 - p, m.w + 2 * p, m.h + 2 * p);
      ctx.setLineDash([]);
    }
  }

  const cantos = () => [
    [recorte.x, recorte.y, 1, 1], [recorte.x + recorte.w, recorte.y, -1, 1],
    [recorte.x, recorte.y + recorte.h, 1, -1], [recorte.x + recorte.w, recorte.y + recorte.h, -1, -1],
  ];

  // Tela → imagem
  function ponto(e) {
    const r = canvas.getBoundingClientRect();
    return { x: vista.x + (e.clientX - r.left - vista.ox) / vista.s, y: vista.y + (e.clientY - r.top - vista.oy) / vista.s };
  }

  // ── Arrastar (recorte: cantos ou mover; texto: mover) ──
  let arrasto = null;
  canvas.addEventListener('pointerdown', (e) => {
    const p = ponto(e);
    const tol = PEGA / vista.s;
    if (modo === 'recorte') {
      const i = cantos().findIndex(([x, y]) => Math.abs(p.x - x) < tol && Math.abs(p.y - y) < tol);
      if (i >= 0) arrasto = { tipo: 'canto', i, ini: { ...recorte } };
      else if (p.x > recorte.x && p.x < recorte.x + recorte.w && p.y > recorte.y && p.y < recorte.y + recorte.h) arrasto = { tipo: 'mover', p, ini: { ...recorte } };
    } else {
      const t = [...textos].reverse().find((t) => {
        const m = medir(t);
        return Math.abs(p.x - t.x) < m.w / 2 + tol && Math.abs(p.y - t.y) < m.h / 2 + tol;
      });
      selecionar(t || null);
      if (t) arrasto = { tipo: 'texto', p, ini: { x: t.x, y: t.y } };
    }
    if (arrasto) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!arrasto) return;
    const p = ponto(e);
    if (arrasto.tipo === 'texto') {
      selecionado.x = Math.min(recorte.x + recorte.w, Math.max(recorte.x, arrasto.ini.x + p.x - arrasto.p.x));
      selecionado.y = Math.min(recorte.y + recorte.h, Math.max(recorte.y, arrasto.ini.y + p.y - arrasto.p.y));
    } else if (arrasto.tipo === 'mover') {
      const a = arrasto.ini;
      recorte.x = Math.min(base.width - a.w, Math.max(0, a.x + p.x - arrasto.p.x));
      recorte.y = Math.min(base.height - a.h, Math.max(0, a.y + p.y - arrasto.p.y));
    } else {
      redimensionar(arrasto.i, arrasto.ini, p);
    }
    desenhar();
  });
  const fim = () => (arrasto = null);
  canvas.addEventListener('pointerup', fim);
  canvas.addEventListener('pointercancel', fim);

  /** Move o canto i até p, mantendo o canto oposto fixo e a proporção escolhida. */
  function redimensionar(i, a, p) {
    const fx = i % 2 === 0 ? a.x + a.w : a.x; // x do canto oposto
    const fy = i < 2 ? a.y + a.h : a.y;
    const px = Math.min(base.width, Math.max(0, p.x)), py = Math.min(base.height, Math.max(0, p.y));
    let w = Math.max(MIN_RECORTE, Math.abs(px - fx)), h = Math.max(MIN_RECORTE, Math.abs(py - fy));
    if (proporcao) {
      if (w / h > proporcao) w = h * proporcao; else h = w / proporcao;
      const maxW = i % 2 === 0 ? fx : base.width - fx, maxH = i < 2 ? fy : base.height - fy;
      const k = Math.min(1, maxW / w, maxH / h);
      w *= k; h *= k;
    }
    recorte = { x: i % 2 === 0 ? fx - w : fx, y: i < 2 ? fy - h : fy, w, h };
  }

  function aplicarProporcao() {
    if (!proporcao) return;
    const cx = recorte.x + recorte.w / 2, cy = recorte.y + recorte.h / 2;
    let w = recorte.w, h = w / proporcao;
    if (h > base.height) { h = base.height; w = h * proporcao; }
    if (w > base.width) { w = base.width; h = w / proporcao; }
    recorte = {
      x: Math.min(base.width - w, Math.max(0, cx - w / 2)), y: Math.min(base.height - h, Math.max(0, cy - h / 2)), w, h,
    };
  }

  // ── Painel ──
  function trocarModo(m) {
    modo = m;
    dlg.querySelectorAll('[data-modo]').forEach((b) => b.setAttribute('aria-selected', b.dataset.modo === m));
    dlg.querySelectorAll('[data-painel]').forEach((p) => (p.hidden = p.dataset.painel !== m));
    if (m === 'recorte') selecionar(null);
    desenhar();
  }
  dlg.querySelectorAll('[data-modo]').forEach((b) => (b.onclick = () => trocarModo(b.dataset.modo)));

  dlg.querySelectorAll('[data-prop]').forEach((b) => (b.onclick = () => {
    dlg.querySelectorAll('[data-prop]').forEach((x) => x.classList.toggle('chip--ativo', x === b));
    proporcao = PROPORCOES.find(([id]) => id === b.dataset.prop)[2];
    aplicarProporcao();
    desenhar();
  }));
  $('[data-inteira]').onclick = () => { recorte = { x: 0, y: 0, w: base.width, h: base.height }; aplicarProporcao(); desenhar(); };

  // Girar 90° no sentido horário (recorte e textos acompanham)
  $('[data-girar]').onclick = () => {
    const g = document.createElement('canvas');
    g.width = base.height; g.height = base.width;
    const c = g.getContext('2d');
    c.translate(g.width, 0); c.rotate(Math.PI / 2); c.drawImage(base, 0, 0);
    const H = base.height;
    recorte = { x: H - recorte.y - recorte.h, y: recorte.x, w: recorte.h, h: recorte.w };
    textos.forEach((t) => { const x = t.x; t.x = H - t.y; t.y = x; });
    base = g;
    aplicarProporcao();
    desenhar();
  };

  function selecionar(t) {
    selecionado = t;
    $('[data-opcoes-texto]').hidden = !t;
    $('[data-dica-texto]').hidden = !!t;
    if (t) {
      $('[data-tam]').value = (t.tam / Math.min(recorte.w, recorte.h)) * 100;
      dlg.querySelectorAll('[data-cor]').forEach((b) => b.classList.toggle('ativo', b.dataset.cor === t.cor));
    }
    desenhar();
  }

  const pedirTexto = async (valor = '') => {
    const v = await formulario({ titulo: 'Texto na foto', botao: 'OK', campos: [{ nome: 'texto', rotulo: 'Texto', valor }] });
    return v?.texto || null;
  };
  $('[data-novo-texto]').onclick = async () => {
    const texto = await pedirTexto();
    if (!texto) return;
    const t = { texto, x: recorte.x + recorte.w / 2, y: recorte.y + recorte.h / 2, tam: Math.min(recorte.w, recorte.h) * 0.07, cor: '#ffffff' };
    textos.push(t);
    selecionar(t);
  };
  $('[data-editar-texto]').onclick = async () => {
    const texto = await pedirTexto(selecionado.texto);
    if (texto) { selecionado.texto = texto; desenhar(); }
  };
  $('[data-apagar-texto]').onclick = () => { textos = textos.filter((t) => t !== selecionado); selecionar(null); };
  $('[data-tam]').oninput = (e) => { selecionado.tam = (Number(e.target.value) / 100) * Math.min(recorte.w, recorte.h); desenhar(); };
  dlg.querySelectorAll('[data-cor]').forEach((b) => (b.onclick = () => { selecionado.cor = b.dataset.cor; selecionar(selecionado); }));

  const aoRedimensionar = () => desenhar();
  window.addEventListener('resize', aoRedimensionar);

  return new Promise((resolve) => {
    function terminar(v) {
      window.removeEventListener('resize', aoRedimensionar);
      dlg.close();
      dlg.remove();
      resolve(v);
    }
    $('[data-cancelar]').onclick = () => terminar(null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); terminar(null); });
    $('[data-pronto]').onclick = () => {
      // Resultado: só a área recortada, com os textos gravados na imagem
      const out = document.createElement('canvas');
      out.width = Math.round(recorte.w); out.height = Math.round(recorte.h);
      const c = out.getContext('2d');
      c.drawImage(base, recorte.x, recorte.y, recorte.w, recorte.h, 0, 0, out.width, out.height);
      textos.forEach((t) => desenharTexto(c, t, recorte.x, recorte.y));
      out.toBlob((b) => terminar(b), 'image/jpeg', 0.92);
    };
    dlg.showModal();
    requestAnimationFrame(desenhar);
  });
}
