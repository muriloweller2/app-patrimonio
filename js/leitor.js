// Leitor de código de barras ao vivo: abre a câmera, lê sozinho, vibra e devolve o número.
// Uso: const n = await lerCodigo('Nº de Patrimônio'); // null se cancelar
import { icone } from './icones.js';
import { esc } from './ui.js';

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

export async function lerCodigo(titulo = 'Ler código') {
  if (!leitorDisponivel()) throw new Error('Este navegador não lê código de barras. Use o Chrome no Android.');
  const det = await obterDetector();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
      <p>Aponte para o código de barras da plaqueta</p>
      <button type="button" class="leitor__btn" data-luz hidden aria-label="Lanterna">${icone('luz')}</button>
    </div>`;
  document.body.appendChild(dlg);
  const video = dlg.querySelector('video');
  video.srcObject = stream;

  const trilha = stream.getVideoTracks()[0];
  const btnLuz = dlg.querySelector('[data-luz]');
  let luz = false;
  if (trilha.getCapabilities?.().torch) {
    btnLuz.hidden = false;
    btnLuz.onclick = async () => {
      luz = !luz;
      try { await trilha.applyConstraints({ advanced: [{ torch: luz }] }); btnLuz.classList.toggle('ativo', luz); } catch { /* sem lanterna */ }
    };
  }

  return new Promise((resolve) => {
    let ativo = true;
    let anterior = '';
    let repeticoes = 0;

    function terminar(valor) {
      if (!ativo) return;
      ativo = false;
      stream.getTracks().forEach((t) => t.stop());
      dlg.close();
      dlg.remove();
      resolve(valor);
    }

    async function procurar() {
      if (!ativo) return;
      if (video.readyState >= 2) {
        try {
          const achados = await det.detect(video);
          const valor = achados.map((c) => String(c.rawValue || '').trim()).find(Boolean);
          // Exige a mesma leitura 2 vezes seguidas para evitar número errado
          if (valor) {
            repeticoes = valor === anterior ? repeticoes + 1 : 1;
            anterior = valor;
            if (repeticoes >= 2) {
              navigator.vibrate?.(120);
              dlg.classList.add('leitor--ok');
              setTimeout(() => terminar(valor), 250);
              return;
            }
          }
        } catch { /* quadro ruim, tenta o próximo */ }
      }
      setTimeout(procurar, 120);
    }

    dlg.querySelector('[data-fechar]').onclick = () => terminar(null);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); terminar(null); });
    dlg.showModal();
    video.play().catch(() => {});
    procurar();
  });
}
