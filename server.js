require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Banco (Railway Postgres) ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ---------- Cloudinary ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload da FOTO DE PERFIL (uma só, sempre substitui)
const uploadCapa = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: { folder: 'musicapp/capas', transformation: [{ width: 800, height: 800, crop: 'fill' }] }
  })
});

// Upload de FOTOS DA GALERIA (várias)
const uploadGaleria = multer({
  storage: new CloudinaryStorage({
    cloudinary,
    params: { folder: 'musicapp/galeria', transformation: [{ width: 1200, crop: 'limit' }] }
  })
});

// ============================================
// ARTISTAS
// ============================================

// Listagem alfabética + busca + filtros
app.get('/artistas', async (req, res) => {
  const { busca, cidade, genero, tipo } = req.query;
  const cond = [
    'ativo = true',
    "(assinatura_status = 'ativo' OR (assinatura_status = 'trial' AND assinatura_vence_em > now()))",
  ];
  const params = [];

if (busca) {
  // translate() remove os acentos mais comuns dos dois lados da comparação,
  // então buscar "Claudio" (sem acento) também encontra "Cláudio" no banco.
  params.push(`%${busca}%`);
  cond.push(`(
    translate(nome_artistico, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')
    ILIKE translate($${params.length}, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')
    OR translate(cidade, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')
    ILIKE translate($${params.length}, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')
  )`);
}
  if (cidade) {
    params.push(cidade);
    cond.push(`cidade = $${params.length}`);
  }
  if (genero) {
    params.push(genero);
    cond.push(`$${params.length} = ANY(generos)`);
  }
  if (tipo) {
    params.push(tipo);
    cond.push(`tipo_artista = $${params.length}`);
  }

  const sql = `
    SELECT id, nome_artistico, tipo_artista, cidade, estado, generos, instrumentos, foto_capa_url, verificado
    FROM artistas
    WHERE ${cond.join(' AND ')}
    ORDER BY nome_artistico ASC
  `;

  try {
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar artistas' });
  }
});

// Perfil completo de um artista
app.get('/artistas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const artista = await pool.query('SELECT * FROM artistas WHERE id = $1', [id]);
    if (artista.rows.length === 0) return res.status(404).json({ erro: 'Artista não encontrado' });

    const fotos = await pool.query('SELECT * FROM artista_fotos WHERE artista_id = $1 ORDER BY ordem', [id]);
    const datas = await pool.query(
      'SELECT data, status, observacao FROM datas_disponiveis WHERE artista_id = $1 AND data >= CURRENT_DATE ORDER BY data',
      [id]
    );
    const avaliacoes = await pool.query(
      'SELECT * FROM avaliacoes WHERE artista_id = $1 ORDER BY criado_em DESC',
      [id]
    );

    res.json({ ...artista.rows[0], fotos: fotos.rows, datas: datas.rows, avaliacoes: avaliacoes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar perfil' });
  }
});

// Criar perfil (cadastro do músico)
// Lista de cidades já usadas por outros artistas (pra autocomplete no cadastro)
// ============================================
// ASSINATURA (Google Play Billing)
// ============================================

// Consulta o status de assinatura do artista (trial/ativo/vencido) e
// atualiza automaticamente pra 'vencido' se a data já passou.
app.get('/artistas/:id/assinatura', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT assinatura_status, assinatura_vence_em FROM artistas WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Artista não encontrado' });

    let { assinatura_status, assinatura_vence_em } = rows[0];
    const venceu = assinatura_vence_em && new Date(assinatura_vence_em) < new Date();

    if (venceu && assinatura_status !== 'vencido') {
      await pool.query("UPDATE artistas SET assinatura_status = 'vencido' WHERE id = $1", [id]);
      assinatura_status = 'vencido';
    }

    res.json({ assinatura_status, assinatura_vence_em });
  } catch (err) {
    console.error('Erro ao consultar assinatura:', err.message || err);
    res.status(500).json({ erro: 'Erro ao consultar assinatura' });
  }
});

// Confirma uma assinatura paga pela Play Store.
//
// ⚠️ TODO ANTES DE IR PRA PRODUÇÃO:
// Hoje esta rota confia no que o app manda (o "purchaseToken" gerado pelo
// Google após o pagamento), sem checar de verdade se ele é válido. Isso é
// suficiente pra TESTAR o fluxo completo, mas não é seguro pra produção —
// qualquer pessoa poderia chamar essa rota manualmente e "ativar" a
// assinatura sem pagar nada.
//
// Antes de lançar de verdade, trocar o bloco abaixo por uma chamada real
// à Google Play Developer API (biblioteca "googleapis", método
// androidpublisher.purchases.subscriptions.get), usando uma conta de
// serviço (service account) criada no Google Cloud e associada ao seu
// Play Console. Só marcar como 'ativo' se o Google confirmar que o
// purchaseToken é válido e não foi usado/cancelado/reembolsado.
app.post('/artistas/:id/assinatura/confirmar', async (req, res) => {
  const { id } = req.params;
  const { purchaseToken } = req.body;

  if (!purchaseToken) {
    return res.status(400).json({ erro: 'purchaseToken é obrigatório' });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE artistas
       SET assinatura_status = 'ativo',
           assinatura_vence_em = now() + interval '30 days',
           google_purchase_token = $1
       WHERE id = $2
       RETURNING id, assinatura_status, assinatura_vence_em`,
      [purchaseToken, id],
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Artista não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Erro ao confirmar assinatura:', err.message || err);
    res.status(500).json({ erro: 'Erro ao confirmar assinatura' });
  }
});

app.get('/cidades', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT cidade, estado FROM artistas WHERE ativo = true ORDER BY cidade ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar cidades:', err.message || err);
    res.status(500).json({ erro: 'Erro ao buscar cidades' });
  }
});

// Contagem de artistas cadastrados e ativos (pra mostrar na tela inicial)
app.get('/artistas/contagem', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM artistas
       WHERE ativo = true
       AND (assinatura_status = 'ativo' OR (assinatura_status = 'trial' AND assinatura_vence_em > now()))`
    );
    res.json({ total: parseInt(rows[0].count, 10) });
  } catch (err) {
    console.error('Erro ao contar artistas:', err.message || err);
    res.status(500).json({ erro: 'Erro ao contar artistas' });
  }
});

// Verifica se esse aparelho já tem um perfil criado
app.get('/artistas/dispositivo/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  try {
    const { rows } = await pool.query('SELECT id FROM artistas WHERE device_id = $1', [deviceId]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Nenhum perfil encontrado' });
    res.json({ id: rows[0].id });
  } catch (err) {
    console.error('Erro ao buscar por device_id:', err.message || err);
    res.status(500).json({ erro: 'Erro ao verificar perfil' });
  }
});

// Editar perfil existente
app.put('/artistas/:id', async (req, res) => {
  const { id } = req.params;
  const campos = [
    'nome_artistico', 'tipo_artista', 'cidade', 'estado', 'raio_km', 'anos_experiencia', 'shows_feitos', 'generos',
    'instrumentos', 'bio', 'formato', 'equipamento_proprio', 'duracao_media', 'cache_info', 'redes_sociais', 'whatsapp',
  ];
  const camposJson = ['redes_sociais']; // precisam ser serializados antes de ir pro Postgres (coluna JSONB)
  // "instrumentos" e "generos" NÃO entram aqui: são colunas TEXT[] no Postgres,
  // e o driver "pg" já converte array do JS pra array do Postgres sozinho.

  const sets = [];
  const valores = [];
  let i = 1;

  for (const campo of campos) {
    if (req.body[campo] !== undefined) {
      sets.push(`${campo} = $${i}`);
      valores.push(camposJson.includes(campo) ? JSON.stringify(req.body[campo]) : req.body[campo]);
      i++;
    }
  }

  if (sets.length === 0) {
    return res.status(400).json({ erro: 'Nenhum campo para atualizar' });
  }

  valores.push(id);

  try {
    const { rows } = await pool.query(
      `UPDATE artistas SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      valores,
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Artista não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar perfil' });
  }
});

// Excluir perfil (remove também fotos, datas e avaliações, por causa do ON DELETE CASCADE)
app.delete('/artistas/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'DELETE FROM artistas WHERE id = $1 RETURNING id',
      [id],
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Artista não encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao excluir perfil' });
  }
});

app.post('/artistas', async (req, res) => {
  const {
    nome_artistico, tipo_artista, cidade, estado, raio_km, anos_experiencia, shows_feitos, generos,
    instrumentos, bio, formato, equipamento_proprio, duracao_media, cache_info, redes_sociais, whatsapp, device_id
  } = req.body;

  if (!device_id) {
    return res.status(400).json({ erro: 'device_id é obrigatório' });
  }

  try {
    // Verifica antes se esse aparelho já tem perfil (mensagem mais amigável que o erro de constraint)
    const existente = await pool.query('SELECT id FROM artistas WHERE device_id = $1', [device_id]);
    if (existente.rows.length > 0) {
      return res.status(409).json({
        erro: 'Este aparelho já tem um perfil de artista cadastrado',
        artista_id: existente.rows[0].id,
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO artistas
        (nome_artistico, tipo_artista, cidade, estado, raio_km, anos_experiencia, shows_feitos, generos, instrumentos, bio, formato, equipamento_proprio, duracao_media, cache_info, redes_sociais, whatsapp, device_id, assinatura_status, assinatura_vence_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'trial', now() + interval '7 days')
       RETURNING *`,
      [nome_artistico, tipo_artista || 'Cantor', cidade, estado, raio_km || 0, anos_experiencia || 0, shows_feitos || 0, generos || [], instrumentos || [], bio, formato, !!equipamento_proprio, duracao_media, cache_info, JSON.stringify(redes_sociais || {}), whatsapp, device_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') { // unique_violation (corrida entre duas requisições simultâneas)
      return res.status(409).json({ erro: 'Este aparelho já tem um perfil de artista cadastrado' });
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro ao criar perfil' });
  }
});

// Upload/troca da FOTO DE PERFIL
app.post('/artistas/:id/foto-perfil', (req, res) => {
  uploadCapa.single('foto')(req, res, async (err) => {
    if (err) {
      console.error('Erro no upload (foto-perfil):', err.message || err);
      return res.status(500).json({ erro: `Erro no upload: ${err.message || 'falha desconhecida'}` });
    }

    const { id } = req.params;
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });

    try {
      const { rows } = await pool.query(
        'UPDATE artistas SET foto_capa_url = $1 WHERE id = $2 RETURNING foto_capa_url',
        [req.file.path, id]
      );
      res.json(rows[0]);
    } catch (err2) {
      console.error('Erro ao salvar no banco (foto-perfil):', err2.message || err2);
      res.status(500).json({ erro: 'Erro ao salvar foto de perfil' });
    }
  });
});

// Adicionar foto na GALERIA
app.post('/artistas/:id/galeria', (req, res) => {
  uploadGaleria.single('foto')(req, res, async (err) => {
    if (err) {
      console.error('Erro no upload (galeria):', err.message || err);
      return res.status(500).json({ erro: `Erro no upload: ${err.message || 'falha desconhecida'}` });
    }

    const { id } = req.params;
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma foto enviada' });

    try {
      const contagem = await pool.query(
        'SELECT COUNT(*) FROM artista_fotos WHERE artista_id = $1',
        [id],
      );
      if (parseInt(contagem.rows[0].count, 10) >= 6) {
        return res.status(400).json({ erro: 'Limite de 6 fotos na galeria atingido' });
      }

      const { rows } = await pool.query(
        'INSERT INTO artista_fotos (artista_id, url, public_id) VALUES ($1,$2,$3) RETURNING *',
        [id, req.file.path, req.file.filename]
      );
      res.status(201).json(rows[0]);
    } catch (err2) {
      console.error('Erro ao salvar no banco (galeria):', err2.message || err2);
      res.status(500).json({ erro: 'Erro ao adicionar foto' });
    }
  });
});

// Remover a FOTO DE PERFIL (volta pra sem foto)
app.delete('/artistas/:id/foto-perfil', async (req, res) => {
  const { id } = req.params;
  try {
    const atual = await pool.query('SELECT foto_capa_url FROM artistas WHERE id = $1', [id]);
    const urlAtual = atual.rows[0]?.foto_capa_url;

    await pool.query('UPDATE artistas SET foto_capa_url = NULL WHERE id = $1', [id]);

    // Tenta limpar do Cloudinary também (não bloqueia a resposta se falhar)
    if (urlAtual) {
      const match = urlAtual.match(/musicapp\/capas\/[^./]+/);
      if (match) cloudinary.uploader.destroy(match[0]).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao remover foto de perfil:', err.message || err);
    res.status(500).json({ erro: 'Erro ao remover foto de perfil' });
  }
});

// Remover uma foto específica da GALERIA
app.delete('/artistas/:id/galeria/:fotoId', async (req, res) => {
  const { id, fotoId } = req.params;
  try {
    const foto = await pool.query(
      'SELECT public_id FROM artista_fotos WHERE id = $1 AND artista_id = $2',
      [fotoId, id],
    );
    if (foto.rows.length === 0) return res.status(404).json({ erro: 'Foto não encontrada' });

    await pool.query('DELETE FROM artista_fotos WHERE id = $1', [fotoId]);

    const publicId = foto.rows[0].public_id;
    if (publicId) cloudinary.uploader.destroy(publicId).catch(() => {});

    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao remover foto da galeria:', err.message || err);
    res.status(500).json({ erro: 'Erro ao remover foto' });
  }
});

// ============================================
// DATAS DISPONÍVEIS
// ============================================

app.post('/artistas/:id/datas', async (req, res) => {
  const { id } = req.params;
  const { data, status, observacao } = req.body; // status: 'livre' | 'reservado'

  try {
    const { rows } = await pool.query(
      `INSERT INTO datas_disponiveis (artista_id, data, status, observacao) VALUES ($1,$2,$3,$4)
       ON CONFLICT (artista_id, data) DO UPDATE SET status = $3, observacao = $4
       RETURNING *`,
      [id, data, status || 'livre', observacao || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar data' });
  }
});

// ============================================
// AVALIAÇÕES
// ============================================

app.post('/artistas/:id/avaliacoes', async (req, res) => {
  const { id } = req.params;
  const { nome_contratante, nota, comentario } = req.body;

  try {
    const { rows } = await pool.query(
      `INSERT INTO avaliacoes (artista_id, nome_contratante, nota, comentario)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, nome_contratante, nota, comentario]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar avaliação' });
  }
});

// Artista responde a uma avaliação
app.post('/avaliacoes/:avaliacaoId/resposta', async (req, res) => {
  const { avaliacaoId } = req.params;
  const { resposta } = req.body;

  try {
    const { rows } = await pool.query(
      'UPDATE avaliacoes SET resposta_artista = $1 WHERE id = $2 RETURNING *',
      [resposta, avaliacaoId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao salvar resposta' });
  }
});

// Denunciar avaliação (vai pra moderação, não apaga)
app.post('/avaliacoes/:avaliacaoId/denunciar', async (req, res) => {
  const { avaliacaoId } = req.params;
  try {
    await pool.query('UPDATE avaliacoes SET denunciada = true WHERE id = $1', [avaliacaoId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao denunciar avaliação' });
  }
});

// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));