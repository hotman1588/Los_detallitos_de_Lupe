-- =======================================================
-- La configuración del ID de venta (prefijo y contador) queda
-- reservada al administrador; el supervisor conserva los
-- descuentos por categoría.
-- =======================================================

CREATE OR REPLACE FUNCTION public.staff_get_config(p_token text, p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Prefijo y contador del ID de venta: solo administrador.
  IF p_key IN ('id_prefix', 'id_counter') THEN
    PERFORM public._require_staff(p_token, ARRAY['admin']);
  ELSE
    PERFORM public._require_staff(p_token, ARRAY['admin', 'supervisor']);
  END IF;
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
  -- Prefijo y contador del ID de venta: solo administrador.
  IF p_key IN ('id_prefix', 'id_counter') THEN
    PERFORM public._require_staff(p_token, ARRAY['admin']);
  ELSE
    PERFORM public._require_staff(p_token, ARRAY['admin', 'supervisor']);
  END IF;
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

