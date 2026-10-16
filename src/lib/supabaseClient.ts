import { createClient } from '@supabase/supabase-js';
import { Product, Order, OrderStatus, SystemUser } from '../types';

// Limpia el valor de variables de entorno: quita espacios, saltos de línea,
// comillas envolventes y barras finales que suelen colarse al pegar en Vercel.
function cleanEnv(value: string | undefined): string {
  return (value || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '') // comillas al inicio/fin
    .replace(/\/+$/, '')           // barra(s) al final
    .trim();
}

const rawSupabaseUrl = cleanEnv(import.meta.env.VITE_SUPABASE_URL);
// Toma solo la URL base del proyecto (https://xxxxx.supabase.co) y descarta
// cualquier ruta extra que se haya pegado por error, p. ej. "/rest/v1".
const supabaseBaseMatch = rawSupabaseUrl.match(/^https:\/\/[a-z0-9-]+\.supabase\.co/i);
const supabaseUrl = supabaseBaseMatch ? supabaseBaseMatch[0] : rawSupabaseUrl;
const supabaseAnonKey = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

const hasValidSupabaseUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl);
const hasValidSupabaseAnonKey = Boolean(
  supabaseAnonKey &&
  supabaseAnonKey !== 'YOUR_ANON_PUBLIC_KEY' &&
  supabaseAnonKey !== 'your-anon-public-key'
);

export const isSupabaseConfigured = hasValidSupabaseUrl && hasValidSupabaseAnonKey;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const NOT_CONFIGURED = 'El servicio no está disponible en este momento. Intenta más tarde.';

// Helper to map DB Product to Client Product
function mapProductFromDb(dbProd: any): Product {
  return {
    id: dbProd.id,
    name: dbProd.name,
    price: dbProd.price,
    description: dbProd.description || '',
    category: dbProd.category as 'desayunos' | 'flores' | 'detalles',
    image: dbProd.image,
    featured: dbProd.featured,
    discountPercentage: dbProd.discount_percentage || 0
  };
}

// Helper to map Client Product to DB Product
function mapProductToDb(prod: Product) {
  return {
    id: prod.id,
    name: prod.name,
    price: prod.price,
    description: prod.description,
    category: prod.category,
    image: prod.image,
    featured: prod.featured || false,
    discount_percentage: prod.discountPercentage || 0
  };
}

// Helper to map DB Order to Client Order
function mapOrderFromDb(dbOrder: any): Order {
  return {
    id: dbOrder.id,
    shipping: dbOrder.shipping,
    items: dbOrder.items,
    total: dbOrder.total,
    subtotal: dbOrder.subtotal,
    shippingFee: dbOrder.shipping_fee,
    paymentReceiptUrl: dbOrder.payment_receipt_url || '',
    status: dbOrder.status,
    createdAt: dbOrder.created_at,
    deliveryPhotoUrl: dbOrder.delivery_photo_url,
    deliveredAt: dbOrder.delivered_at,
    paymentMethod: dbOrder.payment_method,
    assignedDomiUsername: dbOrder.assigned_domi_username
  };
}

// Llama a una función RPC y devuelve { data } o { error } con un mensaje apto para el usuario.
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  if (!supabase) return { error: NOT_CONFIGURED };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(`[Supabase] ${fn}:`, error.message);
    // Sesión vencida o revocada: se descarta para obligar a ingresar de nuevo.
    if (error.code === '28000') clearStaffSession();
    return { error: error.message || 'Ocurrió un error inesperado.' };
  }
  return { data: data as T };
}

// === SESIÓN DEL PORTAL ===
// Solo se guarda el token opaco y los datos públicos del usuario (nunca la contraseña).
const SESSION_KEY = 'ldl_staff_session';

interface StoredSession {
  token: string;
  expiresAt: string;
  user: SystemUser;
}

function readStaffSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    if (!session.token || new Date(session.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function staffToken(): string {
  return readStaffSession()?.token || '';
}

export function clearStaffSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

export function getCachedStaffUser(): SystemUser | null {
  return readStaffSession()?.user || null;
}

export async function staffLogin(username: string, password: string): Promise<{ user?: SystemUser; error?: string }> {
  const { data, error } = await rpc<any>('staff_login', { p_username: username, p_password: password });
  if (error) return { error };
  if (!data || data.error) return { error: data?.error || 'Usuario o contraseña incorrectos.' };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.token, expiresAt: data.expires_at, user: data.user }));
  } catch {}
  return { user: data.user as SystemUser };
}

// Confirma con el servidor que la sesión guardada sigue vigente.
export async function staffRestoreSession(): Promise<SystemUser | null> {
  const session = readStaffSession();
  if (!session) return null;
  const { data, error } = await rpc<SystemUser>('staff_session', { p_token: session.token });
  if (error || !data) {
    clearStaffSession();
    return null;
  }
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...session, user: data })); } catch {}
  return data;
}

export async function staffLogout(): Promise<void> {
  const token = staffToken();
  clearStaffSession();
  if (token) await rpc('staff_logout', { p_token: token });
}

// === DATABASE OPERATIONS ===

// 1. PRODUCTS
export async function getProducts(): Promise<Product[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('catalogo_productos')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching products from Supabase:', error);
    return null;
  }
  return (data || []).map(mapProductFromDb);
}

// Devuelve null si se guardó, o el mensaje de error.
export async function saveProduct(product: Product): Promise<string | null> {
  const { error } = await rpc('staff_save_product', { p_token: staffToken(), p_product: mapProductToDb(product) });
  return error || null;
}

export async function removeProduct(id: string): Promise<string | null> {
  const { error } = await rpc('staff_delete_product', { p_token: staffToken(), p_id: id });
  return error || null;
}

// 2. ORDERS
// El servidor asigna el número de orden y recalcula los precios con el catálogo.
export async function createOrder(order: Omit<Order, 'id'>): Promise<{ id?: string; error?: string }> {
  const { data, error } = await rpc<{ id: string }>('create_order', { p_order: order });
  if (error) return { error };
  return { id: data?.id };
}

export async function trackOrder(id: string, cedula: string): Promise<{ order?: Order | null; error?: string }> {
  const { data, error } = await rpc<any>('track_order', { p_id: id, p_cedula: cedula });
  if (error) return { error };
  return { order: data ? mapOrderFromDb(data) : null };
}

export async function getStaffOrders(): Promise<Order[] | null> {
  const { data, error } = await rpc<any[]>('staff_list_orders', { p_token: staffToken() });
  if (error) return null;
  return (data || []).map(mapOrderFromDb);
}

// domiUsername: undefined = no cambiar, '' = quitar asignación.
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  deliveryPhotoUrl?: string,
  domiUsername?: string
): Promise<{ order?: Order; error?: string }> {
  const { data, error } = await rpc<any>('staff_update_order', {
    p_token: staffToken(),
    p_id: id,
    p_status: status,
    p_delivery_photo: deliveryPhotoUrl ?? null,
    p_domi_username: domiUsername ?? null
  });
  if (error) return { error };
  return { order: mapOrderFromDb(data) };
}

export async function updateOrderCoords(id: string, lat: number, lng: number): Promise<{ order?: Order; error?: string }> {
  const { data, error } = await rpc<any>('staff_update_order_coords', { p_token: staffToken(), p_id: id, p_lat: lat, p_lng: lng });
  if (error) return { error };
  return { order: mapOrderFromDb(data) };
}

// Elimina todos los pedidos, incluidos los entregados (solo administrador).
export async function deleteOpenOrders(): Promise<{ count?: number; error?: string }> {
  const { data, error } = await rpc<number>('staff_delete_orders', { p_token: staffToken() });
  if (error) return { error };
  return { count: data ?? 0 };
}

// 3. USERS
export async function getSystemUsers(): Promise<SystemUser[] | null> {
  const { data, error } = await rpc<SystemUser[]>('staff_list_users', { p_token: staffToken() });
  if (error) return null;
  return data || [];
}

// originalId null = crear. password vacío al editar = conservar la actual.
// Devuelve null si todo salió bien, o el mensaje de error para mostrarlo al usuario.
export async function saveSystemUser(originalId: string | null, user: SystemUser, password: string): Promise<string | null> {
  const { password: _omit, ...publicUser } = user;
  const { error } = await rpc('staff_save_user', {
    p_token: staffToken(),
    p_original_id: originalId,
    p_user: publicUser,
    p_password: password || null
  });
  return error || null;
}

export async function deleteSystemUser(id: string): Promise<string | null> {
  const { error } = await rpc('staff_delete_user', { p_token: staffToken(), p_id: id });
  return error || null;
}

// 4. CONFIGURATION (Discounts, ID Prefix, ID Counter)
// Lectura pública: solo 'category_discounts' e 'id_prefix'.
export async function getConfig(key: string, defaultValue: any): Promise<any> {
  if (!supabase) return defaultValue;
  const { data, error } = await supabase
    .from('configuracion')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error(`Error getting config for ${key}:`, error);
    return defaultValue;
  }
  return data.value;
}

export async function getStaffConfig(key: string, defaultValue: any): Promise<any> {
  const { data, error } = await rpc<any>('staff_get_config', { p_token: staffToken(), p_key: key });
  if (error || data === null || data === undefined) return defaultValue;
  return data;
}

export async function saveConfig(key: string, value: any): Promise<string | null> {
  const { error } = await rpc('staff_save_config', { p_token: staffToken(), p_key: key, p_value: value });
  return error || null;
}

// Cambio de contraseña del propio usuario (exige la actual). Sin reglas de formato.
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<string | null> {
  const { error } = await rpc('staff_change_own_password', {
    p_token: staffToken(),
    p_current: currentPassword,
    p_new: newPassword
  });
  return error || null;
}
