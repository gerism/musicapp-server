-- ============================================
-- Schema do banco - App de Músicos/Cantores
-- Postgres (Railway)
-- ============================================

CREATE TABLE artistas (
  id             SERIAL PRIMARY KEY,
  nome_artistico VARCHAR(120) NOT NULL,
  cidade         VARCHAR(100) NOT NULL,
  estado         VARCHAR(2)   NOT NULL,
  raio_km        INT DEFAULT 0,                  -- raio de deslocamento
  generos        TEXT[] DEFAULT '{}',             -- ex: {'Sertanejo raiz','MPB'}
  bio            TEXT,
  formato        VARCHAR(30),                     -- 'Solo', 'Dupla', 'Banda'
  equipamento_proprio BOOLEAN DEFAULT false,
  duracao_media  VARCHAR(50),                     -- ex: '2 a 3 horas'
  cache_info     VARCHAR(100),                    -- ex: 'A combinar' ou 'R$ 800 a R$ 1500'
  whatsapp       VARCHAR(20) NOT NULL,             -- só dígitos, ex: 5537999999999
  foto_capa_url  TEXT,                             -- url Cloudinary
  verificado     BOOLEAN DEFAULT false,
  ativo          BOOLEAN DEFAULT true,
  criado_em      TIMESTAMP DEFAULT now()
);

-- índice pra listagem alfabética e busca por texto
CREATE INDEX idx_artistas_nome ON artistas (nome_artistico);
CREATE INDEX idx_artistas_cidade ON artistas (cidade);
CREATE INDEX idx_artistas_busca ON artistas
  USING gin (to_tsvector('portuguese', nome_artistico || ' ' || cidade));

-- ============================================
CREATE TABLE artista_fotos (
  id          SERIAL PRIMARY KEY,
  artista_id  INT NOT NULL REFERENCES artistas(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,        -- url Cloudinary
  public_id   TEXT,                 -- id Cloudinary (útil pra deletar depois)
  ordem       INT DEFAULT 0,
  criado_em   TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_fotos_artista ON artista_fotos (artista_id);

-- ============================================
CREATE TABLE datas_disponiveis (
  id          SERIAL PRIMARY KEY,
  artista_id  INT NOT NULL REFERENCES artistas(id) ON DELETE CASCADE,
  data        DATE NOT NULL,
  status      VARCHAR(10) NOT NULL DEFAULT 'livre',  -- 'livre' | 'reservado'
  UNIQUE (artista_id, data)
);

CREATE INDEX idx_datas_artista ON datas_disponiveis (artista_id, data);

-- ============================================
CREATE TABLE avaliacoes (
  id                SERIAL PRIMARY KEY,
  artista_id        INT NOT NULL REFERENCES artistas(id) ON DELETE CASCADE,
  nome_contratante   VARCHAR(120) NOT NULL,
  nota              SMALLINT NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario        TEXT,
  resposta_artista  TEXT,                 -- réplica do artista (nullable)
  denunciada        BOOLEAN DEFAULT false,
  criado_em         TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_avaliacoes_artista ON avaliacoes (artista_id);
