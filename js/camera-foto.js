// Câmera própria para a foto do bem: flash (lanterna), toque para focar, zoom e opção de pegar da galeria.
// Uso: const blob = await tirarFoto(); // null se cancelar
import { icone } from './icones.js';

const ajustar = (trilha, c) => trilha.applyConstraints({ advanced: [c] }).catch(() => {});

function escolherArquivo(capturar) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    if (capturar) inp.capture = 'environment';
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.addEventListener('cancel', () => resolve(null));
    inp.click();
  });
}

export async function tirarFoto() {
  // Sem câmera ao vivo (navegador antigo / permissão negada): usa a câmera do sistema
  if (!navigator.mediaDevices?.getUserMedia) return escolherArquivo(true);
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
    });
  } catch { return escolherArquivo(true); }

  const trilha = stream.getVideoTracks()[0];
  const cap = trilha.getCapabilities?.() || {};
  const captura = 'ImageCapture' in window ? new ImageCapture(trilha) : null;
  if (cap.focusMode?.includes('continuous')) ajustar(trilha, { focusMode: 'continuous' });

  const dlg = document.createElement('dialog');
  dlg.className = 'leitor camera';
  dlg.innerHTML = `
    <video playsinline muted autoplay></video>
    <div class="camera__foco" hidden></div>
    <div class="leitor__topo">
      <button type="button" class="leitor__btn" data-fechar aria-label="Fechar">${icone('fechar')}</button>
      <strong>Foto do bem</strong>
      <button type="button" class="leitor__btn" data-luz ${cap.torch ? '' : 'hidden'} aria-label="Flash">${icone('luz')}</button>
    </div>
    <div class="leitor__base">
      <button type="button" class="leitor__btn" data-galeria aria-label="Escolher da galeria">${icone('imagem')}</button>
      <button type="button" class="camera__disparo" data-disparo aria-label="Tirar foto"></button>
      <button type="button" class="leitor__btn leitor__zoom" data-zoom ${cap.zoom && cap.zoom.max > 1 ? '' : 'hidden'} aria-label="Zoom">1x</button>
    </div>
    <p class="camera__dica">Toque na imagem para focar</p>`;
  const video = dlg.querySelector('video');
  video.srcObject = stream;
  document.body.appendChild(dlg);

  const btnLuz = dlg.querySelector('[data-luz]');
  const btnZoom = dlg.querySelector('[data-zoom]');
  const marca = dlg.querySelector('.camera__foco');
  let luz = false;
  const niveis = cap.zoom ? [1, 1.5, 2, 3, 4].filter((z) => z >= cap.zoom.min && z <= cap.zoom.max) : [1];
  let nivel = 1;

  btnLuz.onclick = async () => {
    luz = !luz;
    await ajustar(trilha, { torch: luz });
    btnLuz.classList.toggle('ativo', luz);
  };
  btnZoom.onclick = () => {
    nivel = niveis[(niveis.indexOf(nivel) + 1) % niveis.length] || 1;
    ajustar(trilha, { zoom: nivel });
    btnZoom.textContent = `${nivel}x`;
  };
  // Pinça com dois dedos também dá zoom
  const dedos = new Map();
  let distInicial = 0, zoomInicial = 1;
  video.addEventListener('pointerdown', (e) => {
    dedos.set(e.pointerId, e);
    if (dedos.size === 2) {
      const [a, b] = [...dedos.values()];
      distInicial = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      zoomInicial = nivel;
    }
  });
  video.addEventListener('pointermove', (e) => {
    if (!dedos.has(e.pointerId)) return;
    dedos.set(e.pointerId, e);
    if (dedos.size !== 2 || !cap.zoom || !distInicial) return;
    const [a, b] = [...dedos.values()];
    const z = zoomInicial * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / distInicial;
    nivel = Math.round(Math.min(cap.zoom.max, Math.max(cap.zoom.min, z)) * 10) / 10;
    ajustar(trilha, { zoom: nivel });
    btnZoom.textContent = `${nivel}x`;
  });
  const soltar = (e) => { dedos.delete(e.pointerId); if (dedos.size < 2) distInicial = 0; };
  video.addEventListener('pointerup', soltar);
  video.addEventListener('pointercancel', soltar);

  // Toque para focar: mostra um quadradinho onde tocou
  video.addEventListener('click', async (e) => {
    const r = video.getBoundingClientRect();
    const ponto = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    marca.style.left = `${e.clientX}px`;
    marca.style.top = `${e.clientY}px`;
    marca.hidden = false;
    marca.classList.remove('animar'); void marca.offsetWidth; marca.classList.add('animar');
    setTimeout(() => (marca.hidden = true), 1200);
    if (cap.focusMode?.includes('single-shot')) await ajustar(trilha, { focusMode: 'single-shot', pointsOfInterest: [ponto] });
    else await ajustar(trilha, { pointsOfInterest: [ponto] });
    if (cap.focusMode?.includes('continuous')) setTimeout(() => ajustar(trilha, { focusMode: 'continuous' }), 2000);
  });

  return new Promise((resolve) => {
    let fim = false;
    function terminar(v) {
      if (fim) return;
      fim = true;
      stream.getTracks().forEach((t) => t.stop());
      dlg.close();
      dlg.remove();
      resolve(v);
    }

    async function fotografar() {
      dlg.classList.add('camera--clique');
      setTimeout(() => dlg.classList.remove('camera--clique'), 180);
      navigator.vibrate?.(40);
      try {
        if (captura) return terminar(await captura.takePhoto(luz ? {} : { fillLightMode: 'off' }));
      } catch { /* alguns celulares não aceitam: usa o quadro do vídeo */ }
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      c.toBlob((b) => terminar(b), 'image/jpeg', 0.92);
    }

    dlg.querySelector('[data-disparo]').onclick = fotografar;
    dlg.querySelector('[data-galeria]').onclick = async () => {
      const arq = await escolherArquivo(false);
      if (arq) terminar(arq);
    };
    dlg.querySelector('[data-fechar]').onclick = () => terminar(null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); terminar(null); });
    dlg.showModal();
  });
}
