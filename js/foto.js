// Foto do bem: diminui no celular antes de guardar/enviar (≈150–300 KB).
import { db } from './db.js';
import { chamar } from './api.js';
import { configurado } from './config.js';
import { chaveNum } from './dados.js';
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

// ── Foto de um bem já cadastrado (para mostrar na ficha e alterar) ──

const dataUrl = (f) => `data:${f.mime || 'image/jpeg'};base64,${f.base64}`;

/**
 * Devolve a foto do bem como data URL ('' se não tiver).
 * 1º a foto que ainda espera envio na fila; 2º a cópia guardada no celular; 3º baixa do Drive pelo Apps Script.
 * Lança erro se a foto existe mas não deu para baixar (sem internet etc.).
 */
export async function fotoDoBem(b) {
  const n = chaveNum(b.patrimonio);
  const naFila = (await db.todos('fila'))
    .filter((o) => o.foto && ['incorporar', 'alterar'].includes(o.action) && chaveNum(o.bem?.patrimonio) === n)
    .sort((x, y) => x.criado - y.criado).pop();
  if (naFila) return dataUrl(naFila.foto);
  if (!/^https?:\/\//.test(b.foto || '')) return '';
  const chave = 'foto:' + b.foto;
  const guardada = await db.ler('kv', chave);
  if (guardada) return guardada;
  if (!navigator.onLine || !configurado()) throw new Error('Sem internet para baixar a foto.');
  const r = await chamar('foto', { url: b.foto });
  if (!r.ok) throw new Error(/desconhecida/i.test(r.erro || '') ? 'Atualize o Apps Script para ver a foto aqui.' : r.erro);
  const url = dataUrl(r);
  await db.gravar('kv', url, chave);
  return url;
}
