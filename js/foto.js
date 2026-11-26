// Foto do bem: diminui no celular antes de guardar/enviar (≈150–300 KB).
const LADO_MAX = 1280;
const QUALIDADE = 0.72;

/** Recebe o arquivo da câmera e devolve { base64, mime, url } (url = prévia na tela). */
export async function prepararFoto(arquivo) {
  const img = await createImageBitmap(arquivo); // já respeita a rotação da câmera
  const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close?.();
  const url = canvas.toDataURL('image/jpeg', QUALIDADE);
  return { base64: url.split(',')[1], mime: 'image/jpeg', url };
}
