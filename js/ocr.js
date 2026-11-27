// Leitura do NÚMERO IMPRESSO na plaqueta (OCR), plano B quando o código de barras não lê.
// Usa o Tesseract.js guardado no próprio app (pasta vendor/tesseract, sem CDN).
// Na 1ª vez baixa ~7 MB (fica guardado no celular e depois funciona sem internet).

const BASE = new URL('../vendor/tesseract/', import.meta.url).href;
let carregando = null;

function carregarScript() {
  if (window.Tesseract) return Promise.resolve();
  return new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = BASE + 'tesseract.min.js';
    s.onload = ok;
    s.onerror = () => erro(new Error('Não consegui carregar a leitura de texto.'));
    document.head.appendChild(s);
  });
}

/** Cria o leitor de texto (só dígitos). Devolve { ler(canvas) → ['001733', ...], fechar() }. */
export async function criarOcr() {
  carregando ||= carregarScript();
  await carregando;
  const worker = await window.Tesseract.createWorker('eng', 1, {
    workerPath: BASE + 'worker.min.js',
    corePath: BASE,
    langPath: BASE + 'lang',
    workerBlobURL: false,
    gzip: true,
  });
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: '11', // texto solto: acha o número em qualquer lugar do recorte
  });
  return {
    async ler(canvas) {
      const { data } = await worker.recognize(canvas);
      return (data.text.match(/\d+/g) || []).filter((t) => t.length === 6);
    },
    fechar: () => worker.terminate().catch(() => {}),
  };
}

/**
 * Recorta do vídeo a área da mira (o que o usuário vê dentro do quadro) e prepara para o OCR:
 * tons de cinza, contraste reforçado e tamanho bom para leitura.
 */
export function recorteDaMira(canvas, video, mira) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const v = video.getBoundingClientRect(), m = mira.getBoundingClientRect();
  const s = Math.max(v.width / vw, v.height / vh); // vídeo usa object-fit: cover
  const ox = (v.width - vw * s) / 2, oy = (v.height - vh * s) / 2;
  const x = Math.max(0, (m.left - v.left - ox) / s), y = Math.max(0, (m.top - v.top - oy) / s);
  const w = Math.min(vw - x, m.width / s), h = Math.min(vh - y, m.height / s);

  const escala = Math.min(2, 1200 / w);
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(h * escala);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.filter = 'grayscale(1) contrast(1.6)';
  ctx.drawImage(video, x, y, w, h, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';
  return canvas;
}
