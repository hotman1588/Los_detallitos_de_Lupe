-- =======================================================
-- SCRIPT DE CONFIGURACIÓN DE BASE DE DATOS PARA SUPABASE
-- =======================================================

-- 1. Tabla de Productos/Catálogo
CREATE TABLE IF NOT EXISTS catalogo_productos (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    price INTEGER NOT NULL,
    category VARCHAR(60) NOT NULL,
    image TEXT NOT NULL,
    description TEXT,
    featured BOOLEAN DEFAULT FALSE,
    discount_percentage INTEGER DEFAULT 0
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE catalogo_productos ENABLE ROW LEVEL SECURITY;

-- Crear políticas para permitir lectura anónima y gestión total
DROP POLICY IF EXISTS "Permitir lectura publica de productos" ON catalogo_productos;
CREATE POLICY "Permitir lectura publica de productos" ON catalogo_productos
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir gestion total anonima de productos" ON catalogo_productos;
CREATE POLICY "Permitir gestion total anonima de productos" ON catalogo_productos
    FOR ALL USING (true) WITH CHECK (true);

-- 2. Tabla de Pedidos/Ordenes
CREATE TABLE IF NOT EXISTS pedidos (
    id VARCHAR(50) PRIMARY KEY,
    shipping JSONB NOT NULL,
    items JSONB NOT NULL,
    total INTEGER NOT NULL,
    subtotal INTEGER,
    shipping_fee INTEGER,
    payment_receipt_url TEXT,
    status VARCHAR(60) NOT NULL DEFAULT 'En Validación',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    delivery_photo_url TEXT,
    delivered_at TIMESTAMP WITH TIME ZONE,
    payment_method VARCHAR(120),
    assigned_domi_username VARCHAR(120)
);

ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

-- Crear políticas de pedidos
DROP POLICY IF EXISTS "Permitir lectura de pedidos anonima" ON pedidos;
CREATE POLICY "Permitir lectura de pedidos anonima" ON pedidos
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir creacion y modificacion anonima de pedidos" ON pedidos;
CREATE POLICY "Permitir creacion y modificacion anonima de pedidos" ON pedidos
    FOR ALL USING (true) WITH CHECK (true);

-- 3. Tabla de Usuarios del Sistema (Backoffice)
CREATE TABLE IF NOT EXISTS system_users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(150),
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'supervisor', 'domiciliario'))
);

ALTER TABLE system_users DROP CONSTRAINT IF EXISTS system_users_role_check;
ALTER TABLE system_users
    ADD CONSTRAINT system_users_role_check
    CHECK (role IN ('admin', 'supervisor', 'domiciliario'));

ALTER TABLE system_users ENABLE ROW LEVEL SECURITY;

-- Crear políticas de usuarios
DROP POLICY IF EXISTS "Permitir lectura de usuarios para autenticacion" ON system_users;
CREATE POLICY "Permitir lectura de usuarios para autenticacion" ON system_users
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir gestion de usuarios anonima" ON system_users;
CREATE POLICY "Permitir gestion de usuarios anonima" ON system_users
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Tabla de Configuración de Negocio (Descuentos de categorías, prefijo, contador)
CREATE TABLE IF NOT EXISTS configuracion (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL
);

ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

-- Crear políticas de configuración
DROP POLICY IF EXISTS "Permitir lectura de configuraciones" ON configuracion;
CREATE POLICY "Permitir lectura de configuraciones" ON configuracion
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir actualizacion de configuraciones" ON configuracion;
CREATE POLICY "Permitir actualizacion de configuraciones" ON configuracion
    FOR ALL USING (true) WITH CHECK (true);

-- =======================================================
-- SEMILLAS / DATOS INICIALES (SEED DATA)
-- =======================================================

-- Configuración Inicial
INSERT INTO configuracion (key, value) VALUES
('category_discounts', '{"desayunos": 0, "flores": 0, "detalles": 0}'::jsonb),
('id_prefix', '"LDL-"'::jsonb),
('id_counter', '1'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Usuarios Iniciales (Credenciales de Administrador y Domiciliario)
INSERT INTO system_users (id, username, password, name, phone, email, role) VALUES 
('1016016370', 'admin', 'Allus2013.**', 'Administrador Principal', '3138005702', 'admin@detallitoslupe.com', 'admin'),
('1016016375', 'domiciliario', '1016016375', 'Domiciliario 1', '3114445566', 'domi1@detallitoslupe.com', 'domiciliario')
ON CONFLICT (id) DO NOTHING;
-- Nota: la contraseña de admin NO se sobrescribe en re-ejecuciones; se respeta
-- la que esté guardada para permitir cambiarla desde el backoffice.

-- Productos Iniciales
INSERT INTO catalogo_productos (id, name, price, category, image, description, featured, discount_percentage) VALUES 
('prod-1', 'Desayuno Especial Lupe', 135000, 'desayunos', 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=600&auto=format&fit=crop&q=80', 'La sorpresa perfecta para iniciar el día. Incluye waffles o pancakes esponjosos de arándanos, yogur griego con granola, ensalada de frutas frescas en frasco de vidrio, jugo natural de naranja embotellado, croissant recién horneado, café de especialidad y globo de helio metalizado personalizable. Todo presentado en una vajilla artesanal y guacal de madera decorado.', true, 0),
('prod-2', 'Caja Desayuno Salado & Gourmet', 145000, 'desayunos', 'https://images.unsplash.com/photo-1496042300028-ac74a1257395?w=600&auto=format&fit=crop&q=80', 'Una experiencia culinaria matutina de lujo. Contiene sándwich artesanal en pan focaccia con jamón serrano y queso brie, wrap de pavo y aguacate, parfait de fresa y chía, capuchino en taza térmica de acero, jugo verde refrescante y torta personal de chocolate belga para endulzar el día. Viene en una hermosa caja negra texturizada con lazo de satín.', false, 0),
('prod-3', 'Caja de Rosas de Terciopelo Premium', 160000, 'flores', 'https://images.unsplash.com/photo-1582794543139-8ac9cb0f7b11?w=600&auto=format&fit=crop&q=80', 'Un arreglo de flores espectacular para expresar admiración o amor profundo. Consta de 24 rosas rojas de exportación seleccionadas con esmero, decoradas en una sofisticada caja redonda rígida (estilo sombrerera) color negro mate, follaje premium de eucalipto baby blue, y una tarjeta de dedicatoria personalizada.', true, 0),
('prod-4', 'Arreglo Radiante de Girasoles Sol-Naciente', 95000, 'flores', 'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=600&auto=format&fit=crop&q=80', 'Llena de luz y alegría el espacio de esa persona amada. Incluye 5 girasoles gigantes importados de la Sabana de Bogotá, acompañados de astromelias blancas y eucalipto silvestre, dispuestos en un florero cilíndrico de vidrio premium de diseño contemporáneo, atado con cordón rústico de yute.', false, 0),
('prod-5', 'Caja de Detalles Dulce Amor y Oso', 110000, 'detalles', 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&auto=format&fit=crop&q=80', 'El regalo perfecto para aniversarios o cumpleaños especiales. Incluye una elegante caja de regalo ilustrada, un tierno oso de peluche hipoalergénico de 25 cm de alto, una caja de chocolates Ferrero Rocher x8, frasco de gomitas artesanales con mensaje dulce, y una taza de cerámica personalizada.', true, 0),
('prod-6', 'Kit Brindis y Celebración Premium', 185000, 'detalles', 'https://images.unsplash.com/photo-1549007994-cb92caeb54bd?w=600&auto=format&fit=crop&q=80', 'Una combinación sofisticada de sabores para celebrar logros o fechas inolvidables. Incluye media botella de vino tinto Cabernet Sauvignon de reserva, copa de cristal grabada, tabla de quesos gourmet seleccionados (queso holandés, brie, salami y jamón serrano), uvas frescas, galletas crackers de finas hierbas, y caja de bombones de chocolate negro.', false, 0)
ON CONFLICT (id) DO NOTHING;

