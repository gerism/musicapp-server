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
  const { busca, cidade, genero } = req.query;
  const cond = ['ativo = true'];
  const params = [];

  if (busca) {
    params.push(`%${busca}%`);
    cond.push(`(nome_artistico ILIKE $${params.length} OR cidade ILIKE $${params.length})`);
  }
  if (cidade) {
    params.push(cidade);
    cond.push(`cidade = $${params.length}`);
  }
  if (genero) {
    params.push(genero);
    cond.push(`$${params.length} = ANY(generos)`);
  }

  const sql = `
    SELECT id, nome_artistico, cidade, estado, generos, foto_capa_url, verificado
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
      'SELECT data, status FROM datas_disponiveis WHERE artista_id = $1 AND data >= CURRENT_DATE ORDER BY data',
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
// Editar perfil existente
app.put('/artistas/:id', async (req, res) => {
  const { id } = req.params;
  const campos = [
    'nome_artistico', 'cidade', 'estado', 'raio_km', 'anos_experiencia', 'shows_feitos', 'generos', 'bio',
    'formato', 'equipamento_proprio', 'duracao_media', 'cache_info', 'whatsapp',
  ];

  const sets = [];
  const valores = [];
  let i = 1;

  for (const campo of campos) {
    if (req.body[campo] !== undefined) {
      sets.push(`${campo} = $${i}`);
      valores.push(req.body[campo]);
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
    nome_artistico, cidade, estado, raio_km, anos_experiencia, shows_feitos, generos,
    bio, formato, equipamento_proprio, duracao_media, cache_info, whatsapp
  } = req.body;

  try {
    const { rows } = await pool.query(
      `INSERT INTO artistas
        (nome_artistico, cidade, estado, raio_km, anos_experiencia, shows_feitos, generos, bio, formato, equipamento_proprio, duracao_media, cache_info, whatsapp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [nome_artistico, cidade, estado, raio_km || 0, anos_experiencia || 0, shows_feitos || 0, generos || [], bio, formato, !!equipamento_proprio, duracao_media, cache_info, whatsapp]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
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

// ============================================
// DATAS DISPONÍVEIS
// ============================================

app.post('/artistas/:id/datas', async (req, res) => {
  const { id } = req.params;
  const { data, status } = req.body; // status: 'livre' | 'reservado'

  try {
    const { rows } = await pool.query(
      `INSERT INTO datas_disponiveis (artista_id, data, status) VALUES ($1,$2,$3)
       ON CONFLICT (artista_id, data) DO UPDATE SET status = $3
       RETURNING *`,
      [id, data, status || 'livre']
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