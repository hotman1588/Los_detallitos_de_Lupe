-- =======================================================
-- "Eliminar todas las órdenes" (solo admin) borra TODOS los pedidos,
-- incluidos los entregados. Un pedido entregado sigue sin poder
-- modificarse, reasignarse ni borrarse por cualquier otra vía.
-- =======================================================

CREATE OR REPLACE FUNCTION public._pedido_entregado_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Única excepción: el borrado total que ejecuta staff_delete_orders.
  IF TG_OP = 'DELETE' AND current_setting('app.borrado_total_pedidos', true) = 'on' THEN
    RETURN OLD;
  END IF;
  IF OLD.status = 'Entregado' THEN
    RAISE EXCEPTION 'El pedido % ya fue entregado y no se puede modificar, reasignar ni eliminar.', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

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
  -- La marca vale solo dentro de esta transacción.
  PERFORM set_config('app.borrado_total_pedidos', 'on', true);
  DELETE FROM public.pedidos WHERE true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM set_config('app.borrado_total_pedidos', 'off', true);
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public._pedido_entregado_inmutable() FROM PUBLIC, anon, authenticated;
