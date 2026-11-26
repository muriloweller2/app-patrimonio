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
const ZOOM_INICIAL = 2;
// Partes da imagem analisadas (1 = inteira; menores = recortes do meio, onde fica a mira)
const REGIOES_VIDEO = [1, 0.6, 0.4];
const REGIOES_FOTO = [1, 0.55, 0.3];
// De quanto em quanto tempo tira uma foto em resolução máxima (bem mais nítida que o vídeo)
const INTERVALO_FOTO = 1200;

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

/** Desenha no canvas um recorte central (fração f) da fonte, em resolução cheia. */
function recorte(canvas, fonte, w, h, f) {
  const cw = Math.round(w * f), ch = Math.round(h * f);
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(fonte, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
  return canvas;
}

async function lerValores(det, imagem) {
  const achados = await det.detect(imagem);
  return achados.map((c) => String(c.rawValue || '').trim()).filter((v) => VALIDO.test(v));
}

/** Câmeras traseiras (principal, grande-angular, macro...). Os nomes só aparecem depois da permissão. */
async function camerasTraseiras() {
  try {
    const todas = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const tras = todas.filter((d) => /back|rear|traseira|environment/i.test(d.label));
    return tras.length ? tras : todas;
  } catch { return []; }
}

export async function lerCodigo(titulo = 'Ler código') {
  if (!leitorDisponivel()) throw new Error('Este navegador não lê código de barras. Use o Chrome no Android.');
  const det = await obterDetector();

  const dlg = document.createElement('dialog');
  dlg.className = 'leitor';
  dlg.innerHTML = `
    <video playsinline muted autoplay></video>
    <div class="leitor__mira"><span></span></div>
    <div class="leitor__topo">
      <strong>${esc(titulo)}</strong>
      <button type="button" class="leitor__btn leitor__zoom" data-lente hidden aria-label="Trocar lente"></button>
      <button type="button" class="leitor__btn" data-fechar aria-label="Fechar">${icone('fechar')}</button>
    </div>
    <div class="leitor__base">
      <button type="button" class="leitor__btn leitor__zoom" data-zoom hidden aria-label="Zoom"></button>
      <p>Aponte para a plaqueta<br><small>Toque na imagem para focar</small></p>
      <button type="button" class="leitor__btn" data-luz hidden aria-label="Lanterna">${icone('luz')}</button>
    </div>`;
  const video = dlg.querySelector('video');
  const btnZoom = dlg.querySelector('[data-zoom]');
  const btnLuz = dlg.querySelector('[data-luz]');
  const btnLente = dlg.querySelector('[data-lente]');

  let stream = null, trilha = null, cap = {}, captura = null;
  let niveis = [1], nivel = 1, luz = false;

  async function abrir(deviceId) {
    stream?.getTracks().forEach((t) => t.stop());
    const tamanho = { width: { ideal: 2560 }, height: { ideal: 1440 } };
    stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId ? { deviceId: { exact: deviceId }, ...tamanho } : { facingMode: { ideal: 'environment' }, ...tamanho },
      audio: false,
    });
    video.srcObject = stream;
    video.play().catch(() => {});
    trilha = stream.getVideoTracks()[0];
    cap = trilha.getCapabilities?.() || {};
    captura = 'ImageCapture' in window ? new ImageCapture(trilha) : null;

    if (cap.focusMode?.includes('continuous')) ajustar(trilha, { focusMode: 'continuous' });

    btnZoom.hidden = !(cap.zoom && cap.zoom.max > 1);
    if (!btnZoom.hidden) {
      niveis = [1, 2, 3].filter((z) => z >= cap.zoom.min && z <= cap.zoom.max);
      nivel = Math.min(ZOOM_INICIAL, cap.zoom.max);
      aplicarZoom();
    }
    luz = false;
    btnLuz.classList.remove('ativo');
    btnLuz.hidden = !cap.torch;
  }
  function aplicarZoom() { ajustar(trilha, { zoom: nivel }); btnZoom.textContent = `${nivel}x`; }

  try {
    await abrir();
  } catch (e) {
    throw new Error(e.name === 'NotAllowedError' ? 'Permita o uso da câmera para ler o código.' : 'Não consegui abrir a câmera.');
  }
  document.body.appendChild(dlg);

  // Toque para focar no ponto tocado (nem todo celular aceita; se não aceitar, nada acontece)
  video.addEventListener('click', async (e) => {
    const r = video.getBoundingClientRect();
    const ponto = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    if (cap.focusMode?.includes('single-shot')) await ajustar(trilha, { focusMode: 'single-shot', pointsOfInterest: [ponto] });
    else await ajustar(trilha, { pointsOfInterest: [ponto] });
    if (cap.focusMode?.includes('continuous')) setTimeout(() => ajustar(trilha, { focusMode: 'continuous' }), 1500);
  });

  btnZoom.onclick = () => { nivel = niveis[(niveis.indexOf(nivel) + 1) % niveis.length] || 1; aplicarZoom(); };
  btnLuz.onclick = async () => {
    luz = !luz;
    await ajustar(trilha, { torch: luz });
    btnLuz.classList.toggle('ativo', luz);
  };

  // Troca de lente (principal, macro, grande-angular...) quando o celular tem mais de uma câmera traseira
  const lentes = await camerasTraseiras();
  if (lentes.length > 1) {
    let iLente = Math.max(0, lentes.findIndex((l) => l.deviceId === trilha.getSettings?.().deviceId));
    const rotular = () => { btnLente.textContent = `L${iLente + 1}`; };
    rotular();
    btnLente.hidden = false;
    btnLente.onclick = async () => {
      const anterior = iLente;
      iLente = (iLente + 1) % lentes.length;
      try { await abrir(lentes[iLente].deviceId); }
      catch { iLente = anterior; await abrir(lentes[iLente].deviceId).catch(() => {}); }
      rotular();
    };
  }

  const quadroVideo = document.createElement('canvas');
  const quadroFoto = document.createElement('canvas');

  return new Promise((resolve) => {
    let ativo = true;
    const leituras = [];
    let vez = 0, fotografando = false, ultimaFoto = 0, falhasFoto = 0;

    function terminar(valor) {
      if (!ativo) return;
      ativo = false;
      stream.getTracks().forEach((t) => t.stop());
      dlg.close();
      dlg.remove();
      resolve(valor);
    }

    function aceitar(valor) {
      if (!ativo) return;
      navigator.vibrate?.(120);
      dlg.classList.add('leitor--ok');
      setTimeout(() => terminar(valor), 200);
    }

    function confirmado(valor) {
      leituras.push(valor);
      if (leituras.length > JANELA) leituras.shift();
      return leituras.filter((v) => v === valor).length >= CONFIRMACOES && leituras.every((v) => v === valor);
    }

    // Foto em resolução máxima: com a plaqueta inteira na tela o código ainda fica nítido
    async function analisarFoto() {
      if (!captura || fotografando || !ativo || performance.now() - ultimaFoto < INTERVALO_FOTO) return;
      fotografando = true;
      try {
        const blob = await captura.takePhoto(luz ? {} : { fillLightMode: 'off' });
        const img = await createImageBitmap(blob);
        const achados = [];
        for (const f of REGIOES_FOTO) {
          if (!ativo) break;
          achados.push(...await lerValores(det, recorte(quadroFoto, img, img.width, img.height, f)));
        }
        img.close?.();
        falhasFoto = 0;
        // Dois recortes da mesma foto concordando (e nenhum discordando) = número certo
        if (achados.length >= 2 && achados.every((v) => v === achados[0])) aceitar(achados[0]);
        else achados.forEach((v) => { if (confirmado(v)) aceitar(v); });
      } catch {
        if (++falhasFoto >= 3) captura = null; // celular não aceita foto durante o vídeo: segue só com o vídeo
      } finally {
        fotografando = false;
        ultimaFoto = performance.now();
      }
    }

    async function procurar() {
      if (!ativo) return;
      analisarFoto();
      if (video.readyState >= 2 && video.videoWidth) {
        try {
          const f = REGIOES_VIDEO[vez++ % REGIOES_VIDEO.length];
          const valor = (await lerValores(det, recorte(quadroVideo, video, video.videoWidth, video.videoHeight, f)))[0];
          if (valor && confirmado(valor)) { aceitar(valor); return; }
        } catch { /* quadro ruim, tenta o próximo */ }
      }
      requestAnimationFrame(procurar);
    }

    dlg.querySelector('[data-fechar]').onclick = () => terminar(null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); terminar(null); });
    dlg.showModal();
    procurar();
  });
}
