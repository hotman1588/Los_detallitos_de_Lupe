-- =======================================================
-- SEGURIDAD: cierra el acceso directo a las tablas y mueve toda
-- operación sensible a funciones RPC que validan sesión y rol.
--
-- - Contraseñas con bcrypt (pgcrypto); nunca salen de la base.
-- - Sesiones del portal con token aleatorio (se guarda solo su hash).
-- - Límite de intentos para login y rastreo de pedidos.
-- - Pedidos: solo se crean por create_order (precios recalculados
--   en el servidor) y se consultan por track_order (orden + cédula).
-- - Regla de negocio: un pedido "Entregado" no se modifica,
--   reasigna ni borra (trigger, aplica a cualquier rol).
-- =======================================================

-- ---------- 1. Contraseñas con hash ----------
ALTER TABLE public.system_users ADD COLUMN IF NOT EXISTS password_hash TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'system_users' AND column_name = 'password'
  ) THEN
    UPDATE public.system_users
       SET password_hash = extensions.crypt(password, extensions.gen_salt('bf', 10))
     WHERE password_hash IS NULL;
    ALTER TABLE public.system_users DROP COLUMN password;
  END IF;
END $$;

ALTER TABLE public.system_users ALTER COLUMN password_hash SET NOT NULL;

-- ---------- 2. Tablas internas ----------
CREATE TABLE IF NOT EXISTS public.staff_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL REFERENCES public.system_users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.security_attempts (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,       -- 'login' | 'track' | 'order'
  subject TEXT NOT NULL,    -- usuario o IP
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_attempts_lookup ON public.security_attempts (kind, subject, created_at);

-- ---------- 3. RLS: sin acceso directo salvo lectura pública ----------
ALTER TABLE public.catalogo_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir gestion total anonima de productos" ON public.catalogo_productos;
DROP POLICY IF EXISTS "Permitir lectura de pedidos anonima" ON public.pedidos;
DROP POLICY IF EXISTS "Permitir creacion y modificacion anonima de pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Permitir lectura de usuarios para autenticacion" ON public.system_users;
DROP POLICY IF EXISTS "Permitir gestion de usuarios anonima" ON public.system_users;
DROP POLICY IF EXISTS "Permitir actualizacion de configuraciones" ON public.configuracion;

DROP POLICY IF EXISTS "Permitir lectura publica de productos" ON public.catalogo_productos;
CREATE POLICY "Permitir lectura publica de productos" ON public.catalogo_productos
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Permitir lectura de configuraciones" ON public.configuracion;
CREATE POLICY "Permitir lectura de configuraciones" ON public.configuracion
  FOR SELECT TO anon, authenticated USING (key IN ('category_discounts', 'id_prefix'));

REVOKE ALL ON public.pedidos, public.system_users, public.staff_sessions, public.security_attempts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.catalogo_productos, public.configuracion FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.security_attempts_id_seq FROM anon, authenticated;

-- ---------- 4. Regla: pedido entregado es inmutable ----------
CREATE OR REPLACE FUNCTION public._pedido_entregado_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'Entregado' THEN
    RAISE EXCEPTION 'El pedido % ya fue entregado y no se puede modificar, reasignar ni eliminar.', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS pedido_entregado_inmutable ON public.pedidos;
CREATE TRIGGER pedido_entregado_inmutable
  BEFORE UPDATE OR DELETE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public._pedido_entregado_inmutable();

-- ---------- 5. Utilidades internas ----------
CREATE OR REPLACE FUNCTION public._client_ip()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    nullif(trim(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)), ''),
    'desconocida'
  );
$$;

-- Cuenta intentos recientes; lanza error si se supera el límite.
CREATE OR REPLACE FUNCTION public._check_rate(p_kind text, p_subject text, p_max int, p_window interval)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.security_attempts WHERE created_at < now() - interval '1 day';
  IF (SELECT count(*) FROM public.security_attempts
       WHERE kind = p_kind AND subject = p_subject AND created_at > now() - p_window) >= p_max THEN
    RAISE EXCEPTION 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' USING ERRCODE = 'P0001';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._user_json(u public.system_users)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object('id', u.id, 'username', u.username, 'name', u.name,
                            'phone', u.phone, 'email', u.email, 'role', u.role);
$$;

-- Valida el token de sesión y el rol; devuelve el usuario autenticado.
CREATE OR REPLACE FUNCTION public._require_staff(p_token text, p_roles text[])
RETURNS public.system_users
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_user public.system_users;
BEGIN
  SELECT u.* INTO v_user
    FROM public.staff_sessions s
    JOIN public.system_users u ON u.id = s.user_id
   WHERE s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     AND s.expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión inválida o vencida. Ingresa de nuevo al portal.' USING ERRCODE = '28000';
  END IF;
  IF NOT (v_user.role = ANY (p_roles)) THEN
    RAISE EXCEPTION 'No tienes permiso para esta acción.' USING ERRCODE = '42501';
  END IF;
  RETURN v_user;
END $$;

CREATE OR REPLACE FUNCTION public._order_json(p public.pedidos)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT to_jsonb(p);
$$;

-- ---------- 6. Sesión del portal ----------
CREATE OR REPLACE FUNCTION public.staff_login(p_username text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.system_users;
  v_name text := lower(trim(coalesce(p_username, '')));
  v_ip text := public._client_ip();
  v_token text;
  v_expires timestamptz := now() + interval '12 hours';
BEGIN
  PERFORM public._check_rate('login', 'u:' || v_name, 5, interval '15 minutes');
  PERFORM public._check_rate('login', 'ip:' || v_ip, 20, interval '15 minutes');

  SELECT * INTO v_user FROM public.system_users WHERE lower(trim(username)) = v_name;

  IF NOT FOUND OR v_user.password_hash <> extensions.crypt(coalesce(p_password, ''), v_user.password_hash) THEN
    INSERT INTO public.security_attempts (kind, subject) VALUES ('login', 'u:' || v_name), ('login', 'ip:' || v_ip);
    RETURN jsonb_build_object('error', 'Usuario o contraseña incorrectos.');
  END IF;

  DELETE FROM public.security_attempts WHERE kind = 'login' AND subject = 'u:' || v_name;
  DELETE FROM public.staff_sessions WHERE expires_at < now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.staff_sessions (token_hash, user_id, expires_at)
  VALUES (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_user.id, v_expires);

  RETURN jsonb_build_object('token', v_token, 'expires_at', v_expires, 'user', public._user_json(v_user));
END $$;

CREATE OR REPLACE FUNCTION public.staff_session(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public._user_json(public._require_staff(p_token, ARRAY['admin', 'supervisor', 'domiciliario']));
END $$;

CREATE OR REPLACE FUNCTION public.staff_logout(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.staff_sessions
   WHERE token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- ---------- 7. Usuarios ----------
CREATE OR REPLACE FUNCTION public.staff_list_users(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me public.system_users := public._require_staff(p_token, ARRAY['admin', 'supervisor', 'domiciliario']);
BEGIN
  IF v_me.role = 'domiciliario' THEN
    RETURN jsonb_build_array(public._user_json(v_me));
  END IF;
  RETURN coalesce((SELECT jsonb_agg(public._user_json(u) ORDER BY u.name) FROM public.system_users u), '[]'::jsonb);
END $$;

-- p_original_id NULL = crear. p_password NULL/'' = conservar la actual (solo al editar).
CREATE OR REPLACE FUNCTION public.staff_save_user(p_token text, p_original_id text, p_user jsonb, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me public.system_users := public._require_staff(p_token, ARRAY['admin', 'supervisor']);
  v_target public.system_users;
  v_id text := trim(coalesce(p_user ->> 'id', ''));
  v_username text := trim(coalesce(nullif(trim(p_user ->> 'username'), ''), v_id));
  v_name text := trim(coalesce(p_user ->> 'name', ''));
  v_phone text := trim(coalesce(p_user ->> 'phone', ''));
  v_email text := trim(coalesce(p_user ->> 'email', ''));
  v_role text := coalesce(p_user ->> 'role', '');
  v_saved public.system_users;
BEGIN
  IF v_id !~ '^[0-9A-Za-z-]{4,50}$' THEN RAISE EXCEPTION 'Cédula/identificación inválida.'; END IF;
  IF v_username !~ '^[0-9A-Za-z._-]{3,100}$' THEN RAISE EXCEPTION 'Nombre de usuario inválido (3 a 100 caracteres, sin espacios).'; END IF;
  IF length(v_name) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'Nombre inválido.'; END IF;
  IF length(v_phone) > 50 OR length(v_email) > 150 THEN RAISE EXCEPTION 'Teléfono o correo demasiado largos.'; END IF;
  IF v_role NOT IN ('admin', 'supervisor', 'domiciliario') THEN RAISE EXCEPTION 'Rol inválido.'; END IF;
  IF v_me.role <> 'admin' AND v_role = 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede asignar el rol administrador.' USING ERRCODE = '42501';
  END IF;
  IF p_password IS NOT NULL AND p_password <> '' AND length(p_password) < 8 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 8 caracteres.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.system_users
              WHERE (id = v_id OR lower(username) = lower(v_username))
                AND id IS DISTINCT FROM p_original_id) THEN
    RAISE EXCEPTION 'Ya existe un colaborador con esa cédula o usuario.';
  END IF;

  IF p_original_id IS NULL THEN
    IF coalesce(p_password, '') = '' THEN RAISE EXCEPTION 'La contraseña es obligatoria.'; END IF;
    INSERT INTO public.system_users (id, username, password_hash, name, phone, email, role)
    VALUES (v_id, v_username, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), v_name, v_phone, v_email, v_role)
    RETURNING * INTO v_saved;
  ELSE
    SELECT * INTO v_target FROM public.system_users WHERE id = p_original_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El colaborador no existe.'; END IF;
    IF v_me.role <> 'admin' AND v_target.role = 'admin' THEN
      RAISE EXCEPTION 'Solo un administrador puede editar a otro administrador.' USING ERRCODE = '42501';
    END IF;
    IF v_target.role = 'admin' AND v_role <> 'admin'
       AND (SELECT count(*) FROM public.system_users WHERE role = 'admin') <= 1 THEN
      RAISE EXCEPTION 'Debe quedar al menos un administrador.';
    END IF;
    UPDATE public.system_users
       SET id = v_id, username = v_username, name = v_name, phone = v_phone, email = v_email, role = v_role,
           password_hash = CASE WHEN coalesce(p_password, '') = '' THEN password_hash
                                ELSE extensions.crypt(p_password, extensions.gen_salt('bf', 10)) END
     WHERE id = p_original_id
     RETURNING * INTO v_saved;
    -- Si cambió la contraseña o el rol de otro usuario, se cierran sus sesiones abiertas.
    IF (coalesce(p_password, '') <> '' OR v_target.role <> v_role) AND v_saved.id <> v_me.id THEN
      DELETE FROM public.staff_sessions WHERE user_id = v_saved.id;
    END IF;
  END IF;

  RETURN public._user_json(v_saved);
END $$;

CREATE OR REPLACE FUNCTION public.staff_delete_user(p_token text, p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me public.system_users := public._require_staff(p_token, ARRAY['admin', 'supervisor']);
  v_target public.system_users;
BEGIN
  SELECT * INTO v_target FROM public.system_users WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_target.id = v_me.id THEN RAISE EXCEPTION 'No puedes eliminar tu propio usuario.'; END IF;
  IF v_target.role = 'admin' THEN
    IF v_me.role <> 'admin' THEN
      RAISE EXCEPTION 'Solo un administrador puede eliminar a otro administrador.' USING ERRCODE = '42501';
    END IF;
    IF (SELECT count(*) FROM public.system_users WHERE role = 'admin') <= 1 THEN
      RAISE EXCEPTION 'Debe quedar al menos un administrador.';
    END IF;
  END IF;
  DELETE FROM public.system_users WHERE id = p_id;
END $$;

-- ---------- 8. Catálogo y configuración ----------
CREATE OR REPLACE FUNCTION public.staff_save_product(p_token text, p_product jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id text := trim(coalesce(p_product ->> 'id', ''));
  v_name text := trim(coalesce(p_product ->> 'name', ''));
  v_price int;
  v_discount int;
  v_category text := coalesce(p_product ->> 'category', '');
  v_image text := coalesce(p_product ->> 'image', '');
BEGIN
  PERFORM public._require_staff(p_token, ARRAY['admin', 'supervisor']);
  v_price := (p_product ->> 'price')::int;
  v_discount := coalesce((p_product ->> 'discount_percentage')::int, 0);
  IF v_id !~ '^[0-9A-Za-z_-]{1,50}$' THEN RAISE EXCEPTION 'Identificador de producto inválido.'; END IF;
  IF length(v_name) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'Nombre de producto inválido.'; END IF;
  IF v_price IS NULL OR v_price < 0 OR v_price > 50000000 THEN RAISE EXCEPTION 'Precio inválido.'; END IF;
  IF v_discount < 0 OR v_discount > 100 THEN RAISE EXCEPTION 'Descuento inválido.'; END IF;
  IF v_category NOT IN ('desayunos', 'flores', 'detalles') THEN RAISE EXCEPTION 'Categoría inválida.'; END IF;
  IF v_image !~ '^(https://|data:image/(png|jpeg|jpg|webp|gif);base64,)' THEN RAISE EXCEPTION 'Imagen inválida.'; END IF;
  IF length(v_image) > 3000000 OR length(coalesce(p_product ->> 'description', '')) > 5000 THEN
    RAISE EXCEPTION 'Imagen o descripción demasiado grandes.';
  END IF;

  INSERT INTO public.catalogo_productos (id, name, price, category, image, description, featured, discount_percentage)
  VALUES (v_id, v_name, v_price, v_category, v_image, p_product ->> 'description',
          coalesce((p_product ->> 'featured')::boolean, false), v_discount)
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name, price = EXCLUDED.price, category = EXCLUDED.category, image = EXCLUDED.image,
        description = EXCLUDED.description, featured = EXCLUDED.featured,
        discount_percentage = EXCLUDED.discount_percentage;
END $$;

CREATE OR REPLACE FUNCTION public.staff_delete_product(p_token text, p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._require_staff(p_token, ARRAY['admin', 'supervisor']);
  DELETE FROM public.catalogo_productos WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION public.staff_get_config(p_token text, p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._require_staff(p_token, ARRAY['admin', 'supervisor']);
  RETURN (SELECT value FROM public.configuracion WHERE key = p_key);
END $$;

CREATE OR REPLACE FUNCTION public.staff_save_config(p_token text, p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_k text;
BEGIN
  PERFORM public._require_staff(p_token, ARRAY['admin', 'supervisor']);
  IF p_key = 'category_discounts' THEN
    IF jsonb_typeof(p_value) <> 'object' THEN RAISE EXCEPTION 'Descuentos inválidos.'; END IF;
    FOR v_k IN SELECT jsonb_object_keys(p_value) LOOP
      IF v_k NOT IN ('desayunos', 'flores', 'detalles')
         OR jsonb_typeof(p_value -> v_k) <> 'number'
         OR (p_value ->> v_k)::numeric NOT BETWEEN 0 AND 100 THEN
        RAISE EXCEPTION 'Descuento inválido para %.', v_k;
      END IF;
    END LOOP;
  ELSIF p_key = 'id_prefix' THEN
    IF jsonb_typeof(p_value) <> 'string' OR (p_value #>> '{}') !~ '^[A-Z0-9-]{1,20}$' THEN
      RAISE EXCEPTION 'Prefijo inválido (solo letras, números y guiones).';
    END IF;
  ELSIF p_key = 'id_counter' THEN
    IF jsonb_typeof(p_value) <> 'number' OR (p_value #>> '{}')::numeric < 1 THEN
      RAISE EXCEPTION 'El contador debe ser un número mayor que 0.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Clave de configuración no permitida.';
  END IF;

  INSERT INTO public.configuracion (key, value) VALUES (p_key, p_value)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END $$;

-- ---------- 9. Pedidos: clientes ----------
-- Crea el pedido con id, precios y estado calculados en el servidor.
CREATE OR REPLACE FUNCTION public.create_order(p_order jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ip text := public._client_ip();
  v_items jsonb := p_order -> 'items';
  v_shipping jsonb := p_order -> 'shipping';
  v_receipt text := coalesce(p_order ->> 'paymentReceiptUrl', '');
  v_discounts jsonb;
  v_item jsonb;
  v_prod public.catalogo_productos;
  v_qty int;
  v_units int := 0;
  v_discount numeric;
  v_unit_price int;
  v_subtotal int := 0;
  v_fee int := coalesce((p_order ->> 'shippingFee')::int, 0);
  v_clean_items jsonb := '[]'::jsonb;
  v_prefix text;
  v_counter bigint;
  v_id text;
BEGIN
  PERFORM public._check_rate('order', 'ip:' || v_ip, 10, interval '1 hour');

  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'El pedido no tiene productos válidos.';
  END IF;
  IF jsonb_typeof(v_shipping) <> 'object' THEN RAISE EXCEPTION 'Faltan los datos de envío.'; END IF;
  IF coalesce(trim(v_shipping ->> 'buyerName'), '') = ''
     OR coalesce(trim(v_shipping ->> 'buyerPhone'), '') = ''
     OR coalesce(trim(v_shipping ->> 'buyerCedula'), '') !~ '^[0-9A-Za-z-]{4,20}$' THEN
    RAISE EXCEPTION 'Faltan los datos del comprador (nombre, celular y cédula).';
  END IF;
  IF v_receipt !~ '^(https://|data:image/(png|jpeg|jpg|webp|gif);base64,)' THEN
    RAISE EXCEPTION 'El comprobante de pago es obligatorio y debe ser una imagen.';
  END IF;
  IF length(p_order::text) > 12000000 THEN RAISE EXCEPTION 'El pedido es demasiado grande (imágenes muy pesadas).'; END IF;

  SELECT value INTO v_discounts FROM public.configuracion WHERE key = 'category_discounts';

  -- Precios tomados del catálogo, no del navegador.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_qty := (v_item ->> 'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Cantidad inválida.'; END IF;
    SELECT * INTO v_prod FROM public.catalogo_productos WHERE id = v_item #>> '{product,id}';
    IF NOT FOUND THEN RAISE EXCEPTION 'Uno de los productos ya no está disponible. Actualiza la página.'; END IF;
    v_discount := greatest(coalesce(v_prod.discount_percentage, 0),
                           coalesce((v_discounts ->> v_prod.category)::numeric, 0));
    v_unit_price := CASE WHEN v_discount <= 0 THEN v_prod.price
                         ELSE round(v_prod.price * (1 - v_discount / 100.0))::int END;
    v_subtotal := v_subtotal + v_unit_price * v_qty;
    v_units := v_units + v_qty;
    v_clean_items := v_clean_items || jsonb_build_array(
      v_item || jsonb_build_object('product', jsonb_build_object(
        'id', v_prod.id, 'name', v_prod.name, 'price', v_prod.price, 'category', v_prod.category,
        'image', v_prod.image, 'description', coalesce(v_prod.description, ''),
        'featured', v_prod.featured, 'discountPercentage', v_prod.discount_percentage)));
  END LOOP;

  -- Domicilio: tarifa fija de $12.000 por envío, máximo uno por unidad.
  IF v_fee < 0 OR v_fee % 12000 <> 0 OR v_fee > 12000 * greatest(v_units, 1) THEN
    RAISE EXCEPTION 'Valor de domicilio inválido.';
  END IF;
  IF (p_order ->> 'total') IS NOT NULL AND (p_order ->> 'total')::int <> v_subtotal + v_fee THEN
    RAISE EXCEPTION 'Los precios cambiaron mientras comprabas. Actualiza la página y revisa tu pedido.';
  END IF;

  -- Consecutivo atómico (evita ids repetidos con compras simultáneas).
  SELECT value #>> '{}' INTO v_prefix FROM public.configuracion WHERE key = 'id_prefix';
  UPDATE public.configuracion SET value = to_jsonb(((value #>> '{}')::bigint) + 1)
   WHERE key = 'id_counter'
   RETURNING ((value #>> '{}')::bigint) - 1 INTO v_counter;
  IF v_counter IS NULL THEN
    INSERT INTO public.configuracion (key, value) VALUES ('id_counter', '2'::jsonb)
    ON CONFLICT (key) DO NOTHING;
    v_counter := 1;
  END IF;
  v_id := coalesce(v_prefix, 'LDL-') || lpad(v_counter::text, 5, '0');

  -- Los datos del domiciliario solo los pone el portal.
  v_shipping := v_shipping - 'assignedDomiName' - 'assignedDomiPhone';

  INSERT INTO public.pedidos (id, shipping, items, total, subtotal, shipping_fee, payment_receipt_url,
                              status, created_at, payment_method)
  VALUES (v_id, v_shipping, v_clean_items, v_subtotal + v_fee, v_subtotal, v_fee, v_receipt,
          'En Validación', now(), left(p_order ->> 'paymentMethod', 120));

  INSERT INTO public.security_attempts (kind, subject) VALUES ('order', 'ip:' || v_ip);
  RETURN jsonb_build_object('id', v_id, 'total', v_subtotal + v_fee);
END $$;

-- Rastreo: exige número de orden y cédula del comprador.
CREATE OR REPLACE FUNCTION public.track_order(p_id text, p_cedula text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ip text := public._client_ip();
  v_order public.pedidos;
BEGIN
  PERFORM public._check_rate('track', 'ip:' || v_ip, 15, interval '15 minutes');
  SELECT * INTO v_order FROM public.pedidos
   WHERE upper(id) = upper(trim(coalesce(p_id, '')))
     AND trim(shipping ->> 'buyerCedula') = trim(coalesce(p_cedula, ''))
     AND trim(coalesce(p_cedula, '')) <> '';
  IF NOT FOUND THEN
    INSERT INTO public.security_attempts (kind, subject) VALUES ('track', 'ip:' || v_ip);
    RETURN NULL;
  END IF;
  RETURN public._order_json(v_order);
END $$;

-- ---------- 10. Pedidos: portal ----------
CREATE OR REPLACE FUNCTION public.staff_list_orders(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me public.system_users := public._require_staff(p_token, ARRAY['admin', 'supervisor', 'domiciliario']);
BEGIN
  IF v_me.role = 'domiciliario' THEN
    RETURN coalesce((
      SELECT jsonb_agg(public._order_json(p) ORDER BY p.created_at DESC)
        FROM public.pedidos p
       WHERE p.status IN ('En Reparto', 'Entregado')
         AND (p.assigned_domi_username = v_me.username
              OR (p.assigned_domi_username IS NULL AND v_me.username = 'domiciliario'))
    ), '[]'::jsonb);
  END IF;
  RETURN coalesce((SELECT jsonb_agg(public._order_json(p) ORDER BY p.created_at DESC) FROM public.pedidos p), '[]'::jsonb);
END $$;

-- p_domi_username: NULL = no cambiar, '' = quitar asignación.
CREATE OR REPLACE FUNCTION public.staff_update_order(
  p_token text, p_id text, p_status text, p_delivery_photo text, p_domi_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me public.system_users := public._require_staff(p_token, ARRAY['admin', 'supervisor', 'domiciliario']);
  v_order public.pedidos;
  v_domi public.system_users;
BEGIN
  SELECT * INTO v_order FROM public.pedidos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe.'; END IF;
  IF v_order.status = 'Entregado' THEN
    RAISE EXCEPTION 'El pedido % ya fue entregado y no se puede modificar ni reasignar.', p_id;
  END IF;
  IF p_status NOT IN ('En Validación', 'En Preparación', 'En Reparto', 'Entregado', 'Rechazado') THEN
    RAISE EXCEPTION 'Estado inválido.';
  END IF;
  IF p_status = 'Entregado' AND coalesce(p_delivery_photo, '') !~ '^data:image/(png|jpeg|jpg|webp|gif);base64,' THEN
    RAISE EXCEPTION 'Para marcar como entregado se requiere la foto de soporte.';
  END IF;
  IF length(coalesce(p_delivery_photo, '')) > 5000000 THEN RAISE EXCEPTION 'La foto es demasiado pesada.'; END IF;

  IF v_me.role = 'domiciliario' THEN
    IF p_status <> 'Entregado' OR p_domi_username IS NOT NULL OR v_order.status <> 'En Reparto'
       OR NOT (v_order.assigned_domi_username = v_me.username
               OR (v_order.assigned_domi_username IS NULL AND v_me.username = 'domiciliario')) THEN
      RAISE EXCEPTION 'Solo puedes cerrar con foto los pedidos en reparto asignados a ti.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_domi_username IS NOT NULL THEN
    IF p_domi_username = '' THEN
      v_order.assigned_domi_username := NULL;
      v_order.shipping := v_order.shipping - 'assignedDomiName' - 'assignedDomiPhone';
    ELSE
      SELECT * INTO v_domi FROM public.system_users WHERE username = p_domi_username AND role = 'domiciliario';
      IF NOT FOUND THEN RAISE EXCEPTION 'El domiciliario seleccionado no existe.'; END IF;
      v_order.assigned_domi_username := v_domi.username;
      v_order.shipping := v_order.shipping || jsonb_build_object(
        'assignedDomiName', v_domi.name, 'assignedDomiPhone', coalesce(v_domi.phone, ''));
    END IF;
  END IF;

  UPDATE public.pedidos
     SET status = p_status,
         assigned_domi_username = v_order.assigned_domi_username,
         shipping = v_order.shipping,
         delivery_photo_url = CASE WHEN p_status = 'Entregado' THEN p_delivery_photo ELSE delivery_photo_url END,
         delivered_at = CASE WHEN p_status = 'Entregado' THEN now() ELSE delivered_at END
   WHERE id = p_id
   RETURNING * INTO v_order;
  RETURN public._order_json(v_order);
END $$;

CREATE OR REPLACE FUNCTION public.staff_update_order_coords(p_token text, p_id text, p_lat double precision, p_lng double precision)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order public.pedidos;
BEGIN
  PERFORM public._require_staff(p_token, ARRAY['admin', 'supervisor']);
  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Coordenadas inválidas.'; END IF;
  UPDATE public.pedidos
     SET shipping = shipping || jsonb_build_object('locationLatLng', jsonb_build_object('lat', p_lat, 'lng', p_lng))
   WHERE id = p_id
   RETURNING * INTO v_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe.'; END IF;
  RETURN public._order_json(v_order);
END $$;

-- Borra los pedidos no entregados (los entregados se conservan siempre).
CREATE OR REPLACE FUNCTION public.staff_delete_orders(p_token text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM public._require_staff(p_token, ARRAY['admin']);
  DELETE FROM public.pedidos WHERE status <> 'Entregado';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- ---------- 11. Permisos de ejecución ----------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.staff_login(text, text),
  public.staff_session(text),
  public.staff_logout(text),
  public.staff_list_users(text),
  public.staff_save_user(text, text, jsonb, text),
  public.staff_delete_user(text, text),
  public.staff_save_product(text, jsonb),
  public.staff_delete_product(text, text),
  public.staff_get_config(text, text),
  public.staff_save_config(text, text, jsonb),
  public.create_order(jsonb),
  public.track_order(text, text),
  public.staff_list_orders(text),
  public.staff_update_order(text, text, text, text, text),
  public.staff_update_order_coords(text, text, double precision, double precision),
  public.staff_delete_orders(text)
TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
