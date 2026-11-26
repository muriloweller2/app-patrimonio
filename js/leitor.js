// Leitor de código de barras ao vivo: abre a câmera, lê sozinho, vibra e devolve o número.
// Uso: const n = await lerCodigo('Nº de Patrimônio'); // null se cancelar
import { icone } from './icones.js';
import { esc } from './ui.js';

// Plaquetas do hospital (nova prata e antiga verde) têm sempre 6 dígitos, ex.: 001733.
// Leituras de outro tamanho são pedaços do código mal lidos e são ignoradas.
const VALIDO = /^\d{6}$/;
// Aceita quando o mesmo número aparece CONFIRMACOES vezes nas últimas JANELA leituras
// e nenhum número diferente apareceu nelas (evita 001733 virar 001713).
const CONFIRMACOES = 3;
const JANELA = 6;
// Zoom inicial: deixa segurar o celular mais longe (a câmera foca melhor e pega a plaqueta inteira).
const ZOOM_INICIAL = 2;
// Partes da imagem analisadas em rodízio (1 = inteira; 0.6 e 0.4 = recortes do meio)
const REGIOES = [1, 0.6, 0.4];

const PREFERIDOS = ['itf', 'code_39', 'code_128', 'codabar', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e'];

export const leitorDisponivel = () => 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

let detector = null;
async function obterDetector() {
  if (detector) return detector;
  const suportados = await BarcodeDetector.getSupportedFormats();
  const formatos = PREFERIDOS.filter((f) => suportados.includes(f));
  if (!formatos.length) throw new Error('sem formatos');
  detector = new BarcodeDetector({ formats: formatos });
  return detector;
}

const ajustar = (trilha, c) => trilha.applyConstraints({ advanced: [c] }).catch(() => {});

export async function lerCodigo(titulo = 'Ler código') {
  if (!leitorDisponivel()) throw new Error('Este navegador não lê código de barras. Use o Chrome no Android.');
  const det = await obterDetector();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
      audio: false,
    });
  } catch (e) {
    throw new Error(e.name === 'NotAllowedError' ? 'Permita o uso da câmera para ler o código.' : 'Não consegui abrir a câmera.');
  }

  const dlg = document.createElement('dialog');
  dlg.className = 'leitor';
  dlg.innerHTML = `
    <video playsinline muted autoplay></video>
    <div class="leitor__mira"><span></span></div>
    <div class="leitor__topo">
      <strong>${esc(titulo)}</strong>
      <button type="button" class="leitor__btn" data-fechar aria-label="Fechar">${icone('fechar')}</button>
    </div>
    <div class="leitor__base">
      <button type="button" class="leitor__btn leitor__zoom" data-zoom hidden aria-label="Zoom"></button>
      <p>Aponte para a plaqueta<br><small>Toque na imagem para focar</small></p>
      <button type="button" class="leitor__btn" data-luz hidden aria-label="Lanterna">${icone('luz')}</button>
    </div>`;
  document.body.appendChild(dlg);
  const video = dlg.querySelector('video');
  video.srcObject = stream;

  const trilha = stream.getVideoTracks()[0];
  const cap = trilha.getCapabilities?.() || {};

  // Foco automático contínuo
  if (cap.focusMode?.includes('continuous')) ajustar(trilha, { focusMode: 'continuous' });

  // Toque para focar no ponto tocado (nem todo celular aceita; se não aceitar, nada acontece)
  video.addEventListener('click', async (e) => {
    const r = video.getBoundingClientRect();
    const ponto = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    if (cap.focusMode?.includes('single-shot')) await ajustar(trilha, { focusMode: 'single-shot', pointsOfInterest: [ponto] });
    else await ajustar(trilha, { pointsOfInterest: [ponto] });
    if (cap.focusMode?.includes('continuous')) setTimeout(() => ajustar(trilha, { focusMode: 'continuous' }), 1500);
  });

  // Zoom: botão alterna 1x → 2x → 3x (até o máximo da câmera)
  const btnZoom = dlg.querySelector('[data-zoom]');
  if (cap.zoom && cap.zoom.max > 1) {
    const niveis = [1, 2, 3].filter((z) => z >= cap.zoom.min && z <= cap.zoom.max);
    let nivel = Math.min(ZOOM_INICIAL, cap.zoom.max);
    const aplicarZoom = () => { ajustar(trilha, { zoom: nivel }); btnZoom.textContent = `${nivel}x`; };
    btnZoom.hidden = false;
    btnZoom.onclick = () => { nivel = niveis[(niveis.indexOf(nivel) + 1) % niveis.length] || 1; aplicarZoom(); };
    aplicarZoom();
  }

  const btnLuz = dlg.querySelector('[data-luz]');
  let luz = false;
  if (cap.torch) {
    btnLuz.hidden = false;
    btnLuz.onclick = async () => {
      luz = !luz;
      await ajustar(trilha, { torch: luz });
      btnLuz.classList.toggle('ativo', luz);
    };
  }

  // Analisa em rodízio a imagem toda e recortes do meio em resolução cheia.
  // No recorte o código de barras ocupa mais espaço → reconhece de mais longe, com a plaqueta inteira na tela.
  const quadro = document.createElement('canvas');
  const ctx = quadro.getContext('2d', { willReadFrequently: true });
  let vez = 0;
  function recortar() {
    const w = video.videoWidth, h = video.videoHeight;
    const f = REGIOES[vez++ % REGIOES.length];
    const cw = Math.round(w * f), ch = Math.round(h * f);
    if (quadro.width !== cw) quadro.width = cw;
    if (quadro.height !== ch) quadro.height = ch;
    ctx.drawImage(video, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
    return quadro;
  }

  return new Promise((resolve) => {
    let ativo = true;
    const leituras = [];

    function terminar(valor) {
      if (!ativo) return;
      ativo = false;
      stream.getTracks().forEach((t) => t.stop());
      dlg.close();
      dlg.remove();
      resolve(valor);
    }

    function confirmado(valor) {
      leituras.push(valor);
      if (leituras.length > JANELA) leituras.shift();
      return leituras.filter((v) => v === valor).length >= CONFIRMACOES && leituras.every((v) => v === valor);
    }

    async function procurar() {
      if (!ativo) return;
      if (video.readyState >= 2 && video.videoWidth) {
        try {
          const achados = await det.detect(recortar());
          const valor = achados.map((c) => String(c.rawValue || '').trim()).find((v) => VALIDO.test(v));
          if (valor && confirmado(valor)) {
            navigator.vibrate?.(120);
            dlg.classList.add('leitor--ok');
            setTimeout(() => terminar(valor), 200);
            return;
          }
        } catch { /* quadro ruim, tenta o próximo */ }
      }
      requestAnimationFrame(procurar); // próximo quadro logo em seguida
    }

    dlg.querySelector('[data-fechar]').onclick = () => terminar(null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); terminar(null); });
    dlg.showModal();
    video.play().catch(() => {});
    procurar();
  });
}
