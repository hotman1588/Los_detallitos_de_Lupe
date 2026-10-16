-- =======================================================
-- Contraseñas libres: cualquier combinación de números, letras
-- y símbolos, sin longitud mínima. Cada colaborador puede
-- cambiar su propia contraseña desde el portal.
-- =======================================================

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

-- Cambio de contraseña propio: exige la contraseña actual y cierra
-- las demás sesiones abiertas del mismo usuario.
CREATE OR REPLACE FUNCTION public.staff_change_own_password(p_token text, p_current text, p_new text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me public.system_users := public._require_staff(p_token, ARRAY['admin', 'supervisor', 'domiciliario']);
  v_subject text := 'u:' || lower(trim(v_me.username));
BEGIN
  PERFORM public._check_rate('login', v_subject, 5, interval '15 minutes');
  IF v_me.password_hash <> extensions.crypt(coalesce(p_current, ''), v_me.password_hash) THEN
    INSERT INTO public.security_attempts (kind, subject) VALUES ('login', v_subject);
    RAISE EXCEPTION 'La contraseña actual no es correcta.' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(p_new, '') = '' THEN
    RAISE EXCEPTION 'Escribe la nueva contraseña.';
  END IF;

  UPDATE public.system_users
     SET password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10))
   WHERE id = v_me.id;
  DELETE FROM public.staff_sessions
   WHERE user_id = v_me.id
     AND token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex');
END $$;

REVOKE EXECUTE ON FUNCTION public.staff_change_own_password(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_change_own_password(text, text, text) TO anon, authenticated;
