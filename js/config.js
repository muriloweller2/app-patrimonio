// Configurações salvas só neste celular (URL do Apps Script e token). Nunca vão para o código.
const CHAVE = 'patrimonio.config';

export function lerConfig() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE)) || {};
  } catch {
    return {};
  }
}

export function salvarConfig(cfg) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(cfg));
    return true;
  } catch {
    return false;
  }
}

export const configurado = () => {
  const c = lerConfig();
  return Boolean(c.url && c.token);
};

/** Usar dados móveis para enviar/baixar? Padrão: sim. */
export const usaDadosMoveis = () => lerConfig().dadosMoveis !== false;

/** Tipo de conexão: 'wifi', 'movel' ou 'desconhecida' (iPhone e alguns navegadores não informam). */
export function tipoConexao() {
  const t = navigator.connection?.type;
  if (!t) return 'desconhecida';
  if (t === 'cellular') return 'movel';
  if (t === 'wifi' || t === 'ethernet') return 'wifi';
  return 'desconhecida';
}

/** Pode comunicar com a planilha agora? `manual` = o usuário apertou o botão (ignora a opção de dados móveis). */
export function redeLiberada(manual = false) {
  if (!navigator.onLine) return false;
  if (manual || usaDadosMoveis()) return true;
  return tipoConexao() !== 'movel';
}
