// PalcoLivre — funções auxiliares comuns a todas as páginas

// ---------- Redireciona Android direto pro app / Play Store ----------
// O site não é destinado a ser usado pelo navegador em celulares Android —
// só existe pra alcançar quem não tem Android (PC, iPhone) ou pra servir de
// ponte até a Play Store. Assim que a página carrega, se detectar Android,
// já tenta abrir o app instalado; se não tiver, cai direto na Play Store.
// Roda antes de qualquer outra coisa, pra não dar tempo da página aparecer.
if (/Android/i.test(navigator.userAgent)) {
  const playStoreUrl = encodeURIComponent('https://play.google.com/store/apps/details?id=com.palcolivre');
  const intentUrl = `intent://open#Intent;scheme=palcolivre;package=com.palcolivre;S.browser_fallback_url=${playStoreUrl};end`;
  window.location.href = intentUrl;
}

// ---------- Identidade do navegador (equivalente ao device_id do app) ----------
// Não é tão robusto quanto o DeviceInfo do celular (limpar o navegador ou usar
// aba anônima "perde" essa identidade), mas resolve bem pro MVP do site.
function getDeviceId() {
  let id = localStorage.getItem('palcolivre_device_id');
  if (!id) {
    id = 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem('palcolivre_device_id', id);
  }
  return id;
}
// ---------- Formatação de data ----------
// O Postgres pode devolver 'YYYY-MM-DD' ou ISO completo — pegamos sempre só
// os 10 primeiros caracteres antes de montar o Date.
function formatarDataCurta(dataRaw) {
  const dataISO = String(dataRaw).slice(0, 10);
  const d = new Date(dataISO + 'T00:00:00');
  if (isNaN(d.getTime())) return { dow: '', num: dataISO, mon: '' };
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return {
    dow: dias[d.getDay()],
    num: String(d.getDate()).padStart(2, '0'),
    mon: meses[d.getMonth()],
  };
}
function formatarDataExtenso(dataRaw) {
  const dataISO = String(dataRaw).slice(0, 10);
  const d = new Date(dataISO + 'T00:00:00');
  if (isNaN(d.getTime())) return dataISO;
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${dias[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]}`;
}
// ---------- Link de rede social ----------
function montarLinkRede(rede, valor) {
  const v = (valor || '').trim();
  if (!v) return null;
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  const usuario = v.replace(/^@/, '');
  if (rede === 'instagram') return `https://instagram.com/${usuario}`;
  if (rede === 'tiktok') return `https://tiktok.com/@${usuario}`;
  return `https://youtube.com/${v.startsWith('@') ? v : `@${usuario}`}`;
}
// ---------- Toast simples de aviso ----------
function mostrarToast(mensagem) {
  let toast = document.getElementById('toast-global');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-global';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = mensagem;
  toast.style.display = 'block';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}
// ---------- Pegar parâmetro da URL (?id=123) ----------
function getQueryParam(nome) {
  return new URLSearchParams(window.location.search).get(nome);
}
// ---------- Escape simples de HTML (evita XSS ao inserir texto do usuário) ----------
function escapeHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}
const TYPE_COLORS = {
  Cantor: '#e8a33d',
  Instrumentista: '#e85d75',
  Banda: '#a99cf0',
  Dupla: '#a99cf0',
  DJ: '#6fd3c7',
};