// PalcoLivre — conexão com a API (musicapp-server no Railway)
// Troque BASE_URL se a URL do seu servidor mudar.

const BASE_URL = 'https://musicapp-server-production.up.railway.app';

// Quantas vezes tenta de novo se a chamada falhar, e quanto tempo espera
// entre cada tentativa. O servidor no Railway pode demorar pra responder
// logo depois de um deploy ou período parado — por isso o tempo de espera
// cresce a cada tentativa, em vez de desistir rápido demais.
const TENTATIVAS_MAX = 6;
const ESPERA_BASE_MS = 2500;

async function apiRequest(path, options = {}, tentativa = 1) {
  try {
    const resp = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!resp.ok) {
      let erro = {};
      try { erro = await resp.json(); } catch (e) {}
      throw new Error(erro.erro || `Erro ${resp.status}`);
    }
    return resp.json();
  } catch (e) {
    if (tentativa < TENTATIVAS_MAX) {
      await new Promise(r => setTimeout(r, ESPERA_BASE_MS * tentativa));
      return apiRequest(path, options, tentativa + 1);
    }
    throw e;
  }
}

// ---------- Artistas ----------

function buscarArtistas({ busca, cidade, genero, tipo } = {}) {
  const params = new URLSearchParams();
  if (busca) params.append('busca', busca);
  if (cidade) params.append('cidade', cidade);
  if (genero) params.append('genero', genero);
  if (tipo) params.append('tipo', tipo);
  const q = params.toString();
  return apiRequest(`/artistas${q ? `?${q}` : ''}`);
}

function buscarContagemArtistas() {
  return apiRequest('/artistas/contagem');
}

function buscarCidades() {
  return apiRequest('/cidades');
}

function buscarPerfilArtista(id) {
  return apiRequest(`/artistas/${id}`);
}

async function buscarMeuPerfilId(deviceId) {
  try {
    const resp = await fetch(`${BASE_URL}/artistas/dispositivo/${deviceId}`);
    if (resp.status === 404) return null;
    if (!resp.ok) return null;
    const dados = await resp.json();
    return dados.id;
  } catch (e) {
    return null;
  }
}

function criarArtista(dados) {
  return apiRequest('/artistas', { method: 'POST', body: JSON.stringify(dados) });
}

function editarArtista(id, dados) {
  return apiRequest(`/artistas/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
}

function excluirArtista(id) {
  return apiRequest(`/artistas/${id}`, { method: 'DELETE' });
}

// ---------- Datas ----------

function salvarData(artistaId, data, status = 'livre', observacao) {
  return apiRequest(`/artistas/${artistaId}/datas`, {
    method: 'POST',
    body: JSON.stringify({ data, status, observacao }),
  });
}

function excluirData(artistaId, data) {
  return apiRequest(`/artistas/${artistaId}/datas/${data}`, { method: 'DELETE' });
}

// ---------- Avaliações ----------

function enviarAvaliacao(artistaId, dados) {
  return apiRequest(`/artistas/${artistaId}/avaliacoes`, {
    method: 'POST',
    body: JSON.stringify(dados),
  });
}

function denunciarAvaliacao(avaliacaoId, motivo) {
  return apiRequest(`/avaliacoes/${avaliacaoId}/denunciar`, {
    method: 'POST',
    body: JSON.stringify({ motivo }),
  });
}

// ---------- Fotos ----------

async function enviarFotoPerfil(artistaId, file, tentativa = 1) {
  const form = new FormData();
  form.append('foto', file);
  try {
    const resp = await fetch(`${BASE_URL}/artistas/${artistaId}/foto-perfil`, {
      method: 'POST',
      body: form,
    });
    if (!resp.ok) throw new Error('Erro ao enviar foto de perfil');
    return resp.json();
  } catch (e) {
    if (tentativa < TENTATIVAS_MAX) {
      await new Promise(r => setTimeout(r, ESPERA_BASE_MS * tentativa));
      return enviarFotoPerfil(artistaId, file, tentativa + 1);
    }
    throw e;
  }
}

async function enviarFotoGaleria(artistaId, file, tentativa = 1) {
  const form = new FormData();
  form.append('foto', file);
  try {
    const resp = await fetch(`${BASE_URL}/artistas/${artistaId}/galeria`, {
      method: 'POST',
      body: form,
    });
    if (!resp.ok) throw new Error('Erro ao enviar foto');
    return resp.json();
  } catch (e) {
    if (tentativa < TENTATIVAS_MAX) {
      await new Promise(r => setTimeout(r, ESPERA_BASE_MS * tentativa));
      return enviarFotoGaleria(artistaId, file, tentativa + 1);
    }
    throw e;
  }
}

function excluirFotoPerfil(artistaId) {
  return apiRequest(`/artistas/${artistaId}/foto-perfil`, { method: 'DELETE' });
}

function excluirFotoGaleria(artistaId, fotoId) {
  return apiRequest(`/artistas/${artistaId}/galeria/${fotoId}`, { method: 'DELETE' });
}

// ---------- Assinatura (Mercado Pago) ----------

function criarAssinaturaSite(artistaId, payerEmail) {
  return apiRequest(`/artistas/${artistaId}/assinatura-site/criar`, {
    method: 'POST',
    body: JSON.stringify({ payer_email: payerEmail }),
  });
}

function consultarAssinatura(artistaId) {
  return apiRequest(`/artistas/${artistaId}/assinatura`);
}