import { createClient } from '@supabase/supabase-js';
import { Product, Order, SystemUser } from '../types';

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

// Diagnóstico en consola del navegador (no expone la clave completa).
if (typeof window !== 'undefined') {
  console.info(
    '[Supabase] configurado:', hasValidSupabaseUrl && hasValidSupabaseAnonKey,
    '| URL detectada:', supabaseUrl || '(vacía)',
    '| URL válida:', hasValidSupabaseUrl,
    '| ANON key presente:', hasValidSupabaseAnonKey
  );
}

export const isSupabaseConfigured = hasValidSupabaseUrl && hasValidSupabaseAnonKey;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

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

// Helper to map Client Order to DB Order
function mapOrderToDb(order: Order) {
  return {
    id: order.id,
    shipping: order.shipping,
    items: order.items,
    total: order.total,
    subtotal: order.subtotal || null,
    shipping_fee: order.shippingFee || null,
    payment_receipt_url: order.paymentReceiptUrl,
    status: order.status,
    created_at: order.createdAt,
    delivery_photo_url: order.deliveryPhotoUrl || null,
    delivered_at: order.deliveredAt || null,
    payment_method: order.paymentMethod || null,
    assigned_domi_username: order.assignedDomiUsername || null
  };
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

export async function upsertProduct(product: Product): Promise<boolean> {
  if (!supabase) return false;
  const dbProd = mapProductToDb(product);
  const { error } = await supabase
    .from('catalogo_productos')
    .upsert(dbProd);

  if (error) {
    console.error('Error saving product to Supabase:', error);
    return false;
  }
  return true;
}

export async function deleteProduct(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('catalogo_productos')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting product from Supabase:', error);
    return false;
  }
  return true;
}

// 2. ORDERS
export async function getOrders(): Promise<Order[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('pedidos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching orders from Supabase:', error);
    return null;
  }
  return (data || []).map(mapOrderFromDb);
}

export async function upsertOrder(order: Order): Promise<boolean> {
  if (!supabase) return false;
  const dbOrder = mapOrderToDb(order);
  const { error } = await supabase
    .from('pedidos')
    .upsert(dbOrder);

  if (error) {
    console.error('Error saving order to Supabase:', error);
    return false;
  }
  return true;
}

export async function deleteOrder(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('pedidos')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting order from Supabase:', error);
    return false;
  }
  return true;
}

export async function deleteAllOrders(): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('pedidos')
    .delete()
    .neq('id', 'placeholder_non_existent');

  if (error) {
    console.error('Error deleting all orders from Supabase:', error);
    return false;
  }
  return true;
}

// 3. USERS
export async function getSystemUsers(): Promise<SystemUser[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('system_users')
    .select('*');

  if (error) {
    console.error('Error fetching system users from Supabase:', error);
    return null;
  }
  return data || [];
}

export async function upsertSystemUser(user: SystemUser): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('system_users')
    .upsert(user);

  if (error) {
    console.error('Error saving system user to Supabase:', error);
    return false;
  }
  return true;
}

export async function deleteSystemUser(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('system_users')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting system user from Supabase:', error);
    return false;
  }
  return true;
}

// 4. CONFIGURATION (Discounts, ID Prefix, ID Counter)
export async function getConfig(key: string, defaultValue: any): Promise<any> {
  if (!supabase) return defaultValue;
  const { data, error } = await supabase
    .from('configuracion')
    .select('value')
    .eq('key', key)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      await saveConfig(key, defaultValue);
      return defaultValue;
    }
    console.error(`Error getting config for ${key}:`, error);
    return defaultValue;
  }
  return data?.value;
}

export async function saveConfig(key: string, value: any): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('configuracion')
    .upsert({ key, value });

  if (error) {
    console.error(`Error saving config for ${key}:`, error);
    return false;
  }
  return true;
}

// Helper to increment order ID counter safely in Supabase
export async function incrementIdCounter(): Promise<number> {
  if (!supabase) {
    const counterStr = localStorage.getItem('dulce_amanecer_id_counter') || '1';
    const counter = parseInt(counterStr, 10) || 1;
    localStorage.setItem('dulce_amanecer_id_counter', String(counter + 1));
    return counter;
  }

  try {
    const { data, error } = await supabase
      .from('configuracion')
      .select('value')
      .eq('key', 'id_counter')
      .single();

    let currentCounter = 1;
    if (!error && data) {
      currentCounter = parseInt(data.value, 10) || 1;
    }

    const nextCounter = currentCounter + 1;
    await supabase
      .from('configuracion')
      .upsert({ key: 'id_counter', value: nextCounter });

    return currentCounter;
  } catch (e) {
    console.error('Error incrementing ID counter in Supabase:', e);
    return 1;
  }
}
