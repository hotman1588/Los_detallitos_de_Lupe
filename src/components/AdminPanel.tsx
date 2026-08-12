/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Product, Order, OrderStatus, SystemUser } from '../types';
import { 
  Eye, CheckCircle2, XCircle, Plus, Edit2, Trash2, ShieldCheck, LogOut, 
  ChevronDown, ChevronUp, Image as ImageIcon, MapPin, Compass, Camera, 
  Navigation, Upload, Clock, Truck, ExternalLink, Check, RefreshCcw, CheckSquare,
  Search, SlidersHorizontal, Database
} from 'lucide-react';
import { compressImageBase64 } from '../lib/promoUtils';
import MapPicker from './MapPicker';
import {
  isSupabaseConfigured,
  getSystemUsers,
  upsertSystemUser,
  upsertSystemUserWithError,
  deleteSystemUser,
  getConfig,
  saveConfig
} from '../lib/supabaseClient';

interface AdminPanelProps {
  products: Product[];
  orders: Order[];
  categoryDiscounts?: Record<string, number>;
  onUpdateCategoryDiscounts?: (discounts: Record<string, number>) => void;
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus, deliveryPhotoUrl?: string, assignedDomiUsername?: string, assignedDomiInfo?: { name: string; phone: string }) => void;
  onDeleteAllOrders: () => void;
  onAddOrder?: (newOrder: Order) => void;
  onUpdateOrderCoords?: (orderId: string, latlng: { lat: number; lng: number }, locationName?: string) => void;
}

export default function AdminPanel({
  products,
  orders,
  categoryDiscounts = { desayunos: 0, flores: 0, detalles: 0 },
  onUpdateCategoryDiscounts,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onUpdateOrderStatus,
  onDeleteAllOrders,
  onAddOrder,
  onUpdateOrderCoords
}: AdminPanelProps) {
  // Sesión persistida: mantiene el login del backoffice al recargar la página.
  // Solo se borra al presionar "Cerrar Sesión".
  const SESSION_KEY = 'dulce_amanecer_admin_session';
  const savedSession: SystemUser | null = (() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as SystemUser) : null;
    } catch {
      return null;
    }
  })();

  const [isLoggedIn, setIsLoggedIn] = useState(!!savedSession);
  const [userRole, setUserRole] = useState<SystemUser['role'] | null>(savedSession?.role ?? null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const canUseAdminDashboard = userRole === 'admin' || userRole === 'supervisor';
  const canDeleteOrders = userRole === 'admin';
  const canSimulateOrders = userRole === 'admin';
  const canAssignAdminRole = userRole === 'admin';
  const getRoleLabel = (role: SystemUser['role']) => {
    if (role === 'admin') return '🚨 Administrador';
    if (role === 'supervisor') return '🛡️ Supervisor';
    return '🛵 Domiciliario';
  };
  const getRoleBadgeClass = (role: SystemUser['role']) => {
    if (role === 'admin') return 'bg-rose-50 text-rose-700 border border-rose-100';
    if (role === 'supervisor') return 'bg-amber-50 text-amber-800 border border-amber-100';
    return 'bg-blue-50 text-blue-700 border border-blue-100';
  };

  // New Orders audio-visual tracking states
  const prevOrdersCountRef = React.useRef(orders ? orders.length : 0);
  const [newOrderAlert, setNewOrderAlert] = useState<Order | null>(null);

  const playNotificationTone = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      
      // Chime frequency pairs (Ding - Dong chime)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(659.25, now + 0.15); // E5
      
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.linearRampToValueAtTime(0.01, now + 0.45);
      
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.45);
    } catch (e) {
      console.warn("AudioContext blocked or failed: ", e);
    }
  };

  const handleGoToOrder = (orderId: string) => {
    setExpandedOrderID(orderId);
    setNewOrderAlert(null);
    playNotificationTone();
    
    // Smooth scroll down to order row or card
    setTimeout(() => {
      const element = document.getElementById(`admin-order-row-${orderId}`) || document.getElementById(`admin-order-card-${orderId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('ring-4', 'ring-amber-500', 'animate-pulse');
        setTimeout(() => {
          element.classList.remove('ring-4', 'ring-amber-500', 'animate-pulse');
        }, 3000);
      }
    }, 150);
  };

  // Monitor incoming orders to play chime and display top-left overlay
  React.useEffect(() => {
    if (orders && orders.length > prevOrdersCountRef.current) {
      // Isolate the newly added order
      const newOrder = orders.find(o => !orders.some(prevO => false)) || orders[0];
      if (newOrder && isLoggedIn && canUseAdminDashboard) {
        setNewOrderAlert(newOrder);
        playNotificationTone();
      }
    }
    prevOrdersCountRef.current = orders ? orders.length : 0;
  }, [orders, isLoggedIn, canUseAdminDashboard]);

  // Domiciliario Proof of Delivery states
  const [uploadingPhotos, setUploadingPhotos] = useState<Record<string, string>>({}); // orderId -> Base64
  const [activeCameraOrderId, setActiveCameraOrderId] = useState<string | null>(null);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [domiTab, setDomiTab] = useState<'entregar' | 'historial'>('entregar');
  const [domiClosingOrder, setDomiClosingOrder] = useState<Order | null>(null);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  // Users State persistent in localStorage / Supabase
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const ADMIN_DEFAULT_PASSWORD = 'Allus2013.**';

  React.useEffect(() => {
    async function loadUsers() {
      if (isSupabaseConfigured) {
        const dbUsers = await getSystemUsers();
        if (dbUsers === null) {
          // La consulta falló (red o permisos). No se siembran los usuarios por
          // defecto: hacerlo dejaría la lista incompleta y el siguiente guardado
          // borraría de la base los usuarios reales que no están en pantalla.
          console.error('[Usuarios] No se pudo leer system_users; se conserva la lista vacía.');
          return;
        }
        if (dbUsers.length > 0) {
          // Se respeta la contraseña almacenada en la base de datos (permite cambiarla).
          setSystemUsers(dbUsers);
        } else {
          const defaults: SystemUser[] = [
            {
              id: '1016016370',
              username: 'admin',
              password: ADMIN_DEFAULT_PASSWORD,
              name: 'Administrador Principal',
              phone: '3138005702',
              email: 'admin@detallitoslupe.com',
              role: 'admin'
            },
            {
              id: '1016016375',
              username: 'domiciliario',
              password: '1016016375',
              name: 'Domiciliario 1',
              phone: '3114445566',
              email: 'domi1@detallitoslupe.com',
              role: 'domiciliario'
            }
          ];
          setSystemUsers(defaults);
          for (const u of defaults) {
            await upsertSystemUser(u);
          }
        }
      } else {
        const saved = localStorage.getItem('dulce_amanecer_system_users');
        if (saved) {
          try {
            const savedUsers = JSON.parse(saved) as SystemUser[];
            // Se respeta la contraseña guardada (permite cambiarla en este dispositivo).
            setSystemUsers(savedUsers);
            return;
          } catch (e) {}
        }
        const defaults: SystemUser[] = [
          {
            id: '1016016370',
            username: 'admin',
            password: ADMIN_DEFAULT_PASSWORD,
            name: 'Administrador Principal',
            phone: '3138005702',
            email: 'admin@detallitoslupe.com',
            role: 'admin'
          },
          {
            id: '1016016375',
            username: 'domiciliario',
            password: '1016016375',
            name: 'Domiciliario 1',
            phone: '3114445566',
            email: 'domi1@detallitoslupe.com',
            role: 'domiciliario'
          }
        ];
        setSystemUsers(defaults);
        localStorage.setItem('dulce_amanecer_system_users', JSON.stringify(defaults));
      }
    }
    loadUsers();
  }, []);

  // Devuelve null si se guardó bien, o el mensaje de error para avisar al admin.
  const saveSystemUsers = async (newUsers: SystemUser[]): Promise<string | null> => {
    setSystemUsers(newUsers);
    if (isSupabaseConfigured) {
      const currentDbUsers = await getSystemUsers();
      // Solo se borran usuarios si la lectura fue exitosa; si falló (null) no se
      // toca nada, para no vaciar la tabla por un error temporal de conexión.
      if (currentDbUsers) {
        const toDelete = currentDbUsers.filter(dbU => !newUsers.some(u => u.id === dbU.id));
        for (const u of toDelete) {
          await deleteSystemUser(u.id);
        }
      }
      for (const u of newUsers) {
        const err = await upsertSystemUserWithError(u);
        if (err) return err;
      }
      return null;
    }
    try {
      localStorage.setItem('dulce_amanecer_system_users', JSON.stringify(newUsers));
      return null;
    } catch (e: any) {
      return e?.message || 'No se pudo guardar en el almacenamiento local del navegador.';
    }
  };

  const [currentUser, setCurrentUser] = useState<SystemUser | null>(savedSession);

  // Tab State
  const [activeTab, setActiveTab] = useState<'orders' | 'inventory' | 'users'>('orders');

  // Form states for creating a new user
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [newUserCedula, setNewUserCedula] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<SystemUser['role']>('domiciliario');

  // Form states for changing a user password
  const [changingPasswordUser, setChangingPasswordUser] = useState<SystemUser | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');

  // Expanded Order State (to view details)
  const [expandedOrderID, setExpandedOrderID] = useState<string | null>(null);

  // CRUD Product Form Modal States
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields for Product CRUD
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState(0);
  const [prodCategory, setProdCategory] = useState<'desayunos' | 'flores' | 'detalles'>('desayunos');
  const [prodDiscountPercentage, setProdDiscountPercentage] = useState(0);
  const [prodImage, setProdImage] = useState('');
  const [prodDescription, setProdDescription] = useState('');
  const [prodFeatured, setProdFeatured] = useState(false);

  // Full-screen Receipt Image Modal
  const [zoomReceiptUrl, setZoomReceiptUrl] = useState<string | null>(null);

  // Admin Start Custom ID configuration
  const [adminIdPrefix, setAdminIdPrefix] = useState(() => localStorage.getItem('dulce_amanecer_id_prefix') || 'LDL-');
  const [adminIdCounter, setAdminIdCounter] = useState(() => localStorage.getItem('dulce_amanecer_id_counter') || '1');

  React.useEffect(() => {
    async function loadConfig() {
      if (isSupabaseConfigured) {
        const prefix = await getConfig('id_prefix', 'LDL-');
        const counter = await getConfig('id_counter', '1');
        setAdminIdPrefix(prefix);
        setAdminIdCounter(String(counter));
      }
    }
    if (isLoggedIn && canUseAdminDashboard) {
      loadConfig();
    }
  }, [isLoggedIn, canUseAdminDashboard]);

  const [showIdConfigMsg, setShowIdConfigMsg] = useState(false);
  const [showIdConfigPanel, setShowIdConfigPanel] = useState(false);

  // Admin Search, Sorting & Table Mode
  const [ordersViewMode, setOrdersViewMode] = useState<'table' | 'cards'>('table');
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [adminSortColumn, setAdminSortColumn] = useState<'id' | 'fechaEntrega' | 'comprador' | 'destinatario' | 'municipio' | 'total' | 'status'>('id');
  const [adminSortOrder, setAdminSortOrder] = useState<'asc' | 'desc'>('desc');

  // Domiciliario Location Sort/Filter states
  const [domiSortCriterion, setDomiSortCriterion] = useState<'gps' | 'schedule' | 'id'>('schedule');
  const [domiCurrentCoords, setDomiCurrentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [domiSelectedLocality, setDomiSelectedLocality] = useState<string>('');
  const [domiIsGpsLoading, setDomiIsGpsLoading] = useState(false);
  const [domiSearchQuery, setDomiSearchQuery] = useState('');

  // Supabase Export Control States
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [supabaseTab, setSupabaseTab] = useState<'sql_schema' | 'sql_inserts' | 'csv'>('sql_schema');
  const [sqlCopySuccess, setSqlCopySuccess] = useState(false);

  // Custom dialog states for deleting orders and products
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteConfirmationStep, setBulkDeleteConfirmationStep] = useState(1);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Map adjustment and sandbox-safe confirmation state variables
  const [orderToEditCoords, setOrderToEditCoords] = useState<Order | null>(null);
  const [adminTempCoords, setAdminTempCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deletingUser, setDeletingUser] = useState<SystemUser | null>(null);
  const [domiCloseConfirmationRequired, setDomiCloseConfirmationRequired] = useState(false);

  // Compute filtered and sorted orders for Administrator view
  const filteredAndSortedOrders = React.useMemo(() => {
    let result = [...(orders || [])];
    
    // 1. Intelligent Search Filter (ID de venta, cedula, nombres, etc.)
    if (adminSearchQuery.trim()) {
      const q = adminSearchQuery.toLowerCase().trim();
      result = result.filter(order => {
        const s = order.shipping;
        return (
          order.id.toLowerCase().includes(q) ||
          (s.buyerCedula && s.buyerCedula.toLowerCase().includes(q)) ||
          s.buyerName.toLowerCase().includes(q) ||
          s.recipientName.toLowerCase().includes(q) ||
          (s.buyerPhone && s.buyerPhone.includes(q)) ||
          (s.recipientPhone && s.recipientPhone.includes(q)) ||
          s.municipio.toLowerCase().includes(q) ||
          (s.direccionDetallada && s.direccionDetallada.toLowerCase().includes(q))
        );
      });
    }

    // 2. Sorting of all columns (ID, Fecha Entrega, Comprador, Destinatario, Municipio, Total, Estado)
    result.sort((a, b) => {
      let fieldA: any = '';
      let fieldB: any = '';

      switch (adminSortColumn) {
        case 'id':
          fieldA = a.id;
          fieldB = b.id;
          break;
        case 'fechaEntrega':
          fieldA = a.shipping.fechaEntrega;
          fieldB = b.shipping.fechaEntrega;
          break;
        case 'comprador':
          fieldA = a.shipping.buyerName;
          fieldB = b.shipping.buyerName;
          break;
        case 'destinatario':
          fieldA = a.shipping.recipientName;
          fieldB = b.shipping.recipientName;
          break;
        case 'municipio':
          fieldA = a.shipping.municipio;
          fieldB = b.shipping.municipio;
          break;
        case 'total':
          fieldA = a.total;
          fieldB = b.total;
          break;
        case 'status':
          fieldA = a.status;
          fieldB = b.status;
          break;
        default:
          fieldA = a.id;
          fieldB = b.id;
      }

      if (typeof fieldA === 'string') {
        const strA = fieldA || '';
        const strB = fieldB || '';
        return adminSortOrder === 'asc'
          ? strA.localeCompare(strB)
          : strB.localeCompare(strA);
      } else {
        const numA = Number(fieldA) || 0;
        const numB = Number(fieldB) || 0;
        return adminSortOrder === 'asc' ? numA - numB : numB - numA;
      }
    });

    return result;
  }, [orders, adminSearchQuery, adminSortColumn, adminSortOrder]);

  // Approximate coordinate reference points for Bogotá and Soacha (Center coordinates)
  const LOCALITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
    // Bogotá Localidades (Lat, Lng)
    "Usaquén (Localidad 1)": { lat: 4.7014, lng: -74.0298 },
    "Chapinero (Localidad 2)": { lat: 4.6486, lng: -74.0603 },
    "Suba (Localidad 11)": { lat: 4.7412, lng: -74.0841 },
    "Teusaquillo (Localidad 13)": { lat: 4.6457, lng: -74.0844 },
    "Fontibón (Localidad 9)": { lat: 4.6732, lng: -74.1378 },
    "Kennedy (Localidad 8)": { lat: 4.6307, lng: -74.1531 },
    "Bosa (Localidad 7)": { lat: 4.6186, lng: -74.1952 },
    "Puente Aranda (Localidad 16)": { lat: 4.6192, lng: -74.1167 },
    "Engativá (Localidad 10)": { lat: 4.6953, lng: -74.1158 },
    "Barrios Unidos (Localidad 12)": { lat: 4.6682, lng: -74.0743 },
    // Soacha Comunas (Lat, Lng)
    "Comuna 1 - Compartir": { lat: 4.5670, lng: -74.2405 },
    "Comuna 2 - Centro": { lat: 4.5779, lng: -74.2201 },
    "Comuna 3 - La Despensa": { lat: 4.5938, lng: -74.2005 },
    "Comuna 5 - San Mateo": { lat: 4.5822, lng: -74.2114 },
    "Comuna 6 - San Humberto": { lat: 4.5681, lng: -74.2185 }
  };

  const getDistanceInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleSaveIdConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminIdPrefix.trim()) {
      alert("Introduce un prefijo válido para los IDs de venta.");
      return;
    }
    const parsedCounter = parseInt(adminIdCounter, 10);
    if (isNaN(parsedCounter) || parsedCounter < 1) {
      alert("El contador inicial de venta debe ser un número entero mayor que 0.");
      return;
    }
    const cleanPrefix = adminIdPrefix.toUpperCase().trim();
    if (isSupabaseConfigured) {
      await saveConfig('id_prefix', cleanPrefix);
      await saveConfig('id_counter', parsedCounter);
    } else {
      localStorage.setItem('dulce_amanecer_id_prefix', cleanPrefix);
      localStorage.setItem('dulce_amanecer_id_counter', String(parsedCounter));
    }
    setShowIdConfigMsg(true);
    setTimeout(() => {
      setShowIdConfigMsg(false);
    }, 4000);
  };

  // Helper SQL schema generator for Supabase
  const getSupabaseSqlSchema = () => {
    return `-- =======================================================
-- SCRIPT DE CREACIÓN DE TABLAS EN POSTGRESQL / SUPABASE
-- Copia y ejecuta este script en la pestaña SQL EDITOR de Supabase
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

ALTER TABLE catalogo_productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura publica de productos" ON catalogo_productos
    FOR SELECT USING (true);

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

CREATE POLICY "Permitir lectura de pedidos anonima" ON pedidos
    FOR SELECT USING (true);

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

CREATE POLICY "Permitir lectura de usuarios para autenticacion" ON system_users
    FOR SELECT USING (true);

CREATE POLICY "Permitir gestion de usuarios anonima" ON system_users
    FOR ALL USING (true) WITH CHECK (true);

-- 4. Tabla de Configuración de Negocio (Descuentos de categorías, prefijo, contador)
CREATE TABLE IF NOT EXISTS configuracion (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL
);

ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir lectura de configuraciones" ON configuracion
    FOR SELECT USING (true);

CREATE POLICY "Permitir actualizacion de configuraciones" ON configuracion
    FOR ALL USING (true) WITH CHECK (true);
`;
  };

  // Help generate real insertion strings based on the current orders
  const generateSupabaseSqlInserts = () => {
    let sql = `-- =======================================================\n`;
    sql += `-- INSERTS DE DATOS DINÁMICOS RELATIVOS A LA SESIÓN ACTUAL\n`;
    sql += `-- Ejecutar en Supabase para insertar instantáneamente las órdenes e inventario\n`;
    sql += `-- =======================================================\n\n`;

    sql += `-- --- INSERCIÓN EN TABLA DE "pedidos" ---\n`;
    if (orders.length === 0) {
      sql += `-- No hay órdenes activas aún. Por favor realice una orden de compra para generar el script SQL.\n`;
    } else {
      orders.forEach(order => {
        const s = order.shipping;
        const esc = (str: string) => (str || '').replace(/'/g, "''");
        const sub = order.subtotal || order.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
        const fee = typeof order.shippingFee === 'number' ? order.shippingFee : Math.max(0, order.total - sub);
        sql += `INSERT INTO pedidos (id, comprador_nombre, comprador_cedula, comprador_telefono, destinatario_nombre, destinatario_telefono, municipio, localidad, barrio, direccion_detallada, mensaje_tarjeta, subtotal, valor_domicilio, total, estado, metodo_pago, fecha_creacion) VALUES ('${esc(order.id)}', '${esc(s.buyerName)}', '${esc(s.buyerCedula)}', '${esc(s.buyerPhone)}', '${esc(s.recipientName)}', '${esc(s.recipientPhone)}', '${esc(s.municipio)}', '${esc(s.localidad)}', '${esc(s.barrio)}', '${esc(s.direccionDetallada)}', '${esc(s.mensajeTarjeta)}', ${sub}, ${fee}, ${order.total}, '${esc(order.status)}', '${esc(order.paymentMethod || 'Transferencia Directa')}', '${order.createdAt || new Date().toISOString()}');\n`;
      });
    }

    sql += `\n-- --- INSERCIÓN EN TABLA DE "catalogo_productos" ---\n`;
    if (products.length === 0) {
      sql += `-- No hay productos cargados en el inventario actual.\n`;
    } else {
      products.forEach(p => {
        const esc = (str: string) => (str || '').replace(/'/g, "''");
        sql += `INSERT INTO catalogo_productos (id, name, price, category, image, description, featured) VALUES ('${esc(p.id)}', '${esc(p.name)}', ${p.price}, '${esc(p.category)}', '${esc(p.image)}', '${esc(p.description)}', ${p.featured ? 'true' : 'false'});\n`;
      });
    }
    return sql;
  };

  // CSV Generator + immediate browser downloader
  const downloadCsvForSupabase = (type: 'orders' | 'inventory') => {
    let csvContent = "";
    let filename = "";

    if (type === 'orders') {
      filename = `dulce_amanecer_ordenes_supabase.csv`;
      // Byte order mark (BOM) to correctly display spanish accents in Excel
      csvContent += "id,comprador_nombre,comprador_cedula,comprador_telefono,destinatario_nombre,destinatario_telefono,municipio,localidad,barrio,direccion_detallada,mensaje_tarjeta,subtotal,valor_domicilio,total,estado,metodo_pago,fecha_creacion\n";

      orders.forEach(order => {
        const s = order.shipping;
        const sub = order.subtotal || order.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
        const fee = typeof order.shippingFee === 'number' ? order.shippingFee : Math.max(0, order.total - sub);
        const quote = (str: any) => `"${String(str || '').replace(/"/g, '""')}"`;

        const row = [
          quote(order.id),
          quote(s.buyerName),
          quote(s.buyerCedula),
          quote(s.buyerPhone),
          quote(s.recipientName),
          quote(s.recipientPhone),
          quote(s.municipio),
          quote(s.localidad),
          quote(s.barrio),
          quote(s.direccionDetallada),
          quote(s.mensajeTarjeta),
          sub,
          fee,
          order.total,
          quote(order.status),
          quote(order.paymentMethod || 'Transferencia Directa'),
          quote(order.createdAt || new Date().toISOString())
        ];
        csvContent += row.join(",") + "\n";
      });
    } else {
      filename = `dulce_amanecer_inventario_supabase.csv`;
      csvContent += "id,name,price,category,image,description,featured\n";

      products.forEach(p => {
        const quote = (str: any) => `"${String(str || '').replace(/"/g, '""')}"`;
        const row = [
          quote(p.id),
          quote(p.name),
          p.price,
          quote(p.category),
          quote(p.image),
          quote(p.description),
          p.featured ? "true" : "false"
        ];
        csvContent += row.join(",") + "\n";
      });
    }

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedUser = username.toLowerCase().trim();
    const foundUser = systemUsers.find(
      u => u.username.toLowerCase().trim() === normalizedUser && u.password === password
    );

    if (foundUser) {
      setIsLoggedIn(true);
      setUserRole(foundUser.role);
      setCurrentUser(foundUser);
      setLoginError('');
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(foundUser)); } catch {}
    } else {
      setLoginError('Usuario o contraseña incorrectos.');
    }
  };

  const stopCameraStreamForced = (streamParam: MediaStream | null) => {
    if (streamParam) {
      streamParam.getTracks().forEach(track => track.stop());
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole(null);
    setCurrentUser(null);
    setUsername('');
    setPassword('');
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    if (liveStream) {
      stopCameraStreamForced(liveStream);
      setLiveStream(null);
    }
    setActiveCameraOrderId(null);
  };

  // User management handler functions
  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserCedula.trim() || !newUserName.trim() || !newUserPhone.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      alert("Por favor completa todos los campos requeridos.");
      return;
    }
    const usernameVal = newUserUsername.trim() || newUserCedula.trim();
    if (!canAssignAdminRole && newUserRole === 'admin') {
      alert("El rol supervisor no puede crear ni asignar usuarios con rol administrador.");
      setNewUserRole('supervisor');
      return;
    }

    if (editingUser) {
      // Check duplicate
      const duplicate = systemUsers.some(u => u.id !== editingUser.id && (u.username.toLowerCase() === usernameVal.toLowerCase() || u.id === newUserCedula.trim()));
      if (duplicate) {
        alert(`El usuario con cédula o usuario "${usernameVal}" ya se encuentra registrado por otro colaborador.`);
        return;
      }

      const updated = systemUsers.map(u => 
        u.id === editingUser.id ? {
          ...u,
          id: newUserCedula.trim(),
          username: usernameVal,
          password: newUserPassword,
          name: newUserName.trim(),
          phone: newUserPhone.trim(),
          email: newUserEmail.trim(),
          role: newUserRole
        } : u
      );
      const saveError = await saveSystemUsers(updated);
      if (saveError) {
        alert(`No se pudo actualizar el usuario en la base de datos:\n\n${saveError}`);
        return;
      }
      alert(`¡Usuario "${newUserName.trim()}" actualizado con éxito!`);
    } else {
      // Check duplicate
      const duplicate = systemUsers.some(u => u.username.toLowerCase() === usernameVal.toLowerCase() || u.id === newUserCedula.trim());
      if (duplicate) {
        alert(`El usuario con cédula o usuario "${usernameVal}" ya se encuentra registrado.`);
        return;
      }

      const newUser: SystemUser = {
        id: newUserCedula.trim(),
        username: usernameVal,
        password: newUserPassword,
        name: newUserName.trim(),
        phone: newUserPhone.trim(),
        email: newUserEmail.trim(),
        role: newUserRole
      };

      const saveError = await saveSystemUsers([...systemUsers, newUser]);
      if (saveError) {
        // Se revierte el estado local para no mostrar un usuario que no quedó guardado.
        setSystemUsers(systemUsers);
        alert(`No se pudo registrar el usuario en la base de datos:\n\n${saveError}`);
        return;
      }
      alert(`¡Usuario "${newUser.name}" registrado con éxito!`);
    }
    
    // reset form fields
    setNewUserCedula('');
    setNewUserUsername('');
    setNewUserPassword('');
    setNewUserName('');
    setNewUserPhone('');
    setNewUserEmail('');
    setNewUserRole('domiciliario');
    setEditingUser(null);
    setShowUserModal(false);
  };

  const handleChangePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPasswordValue.trim() || !changingPasswordUser) {
      alert("Por favor ingresa una contraseña válida.");
      return;
    }

    const updated = systemUsers.map(u => 
      u.id === changingPasswordUser.id ? { ...u, password: newPasswordValue.trim() } : u
    );

    saveSystemUsers(updated);
    alert(`Contraseña del usuario "${changingPasswordUser.name}" actualizada con éxito.`);
    setChangingPasswordUser(null);
    setNewPasswordValue('');
  };

  // Live Camera handlers
  const startLiveCamera = async (orderId: string) => {
    if (liveStream) {
      stopCameraStreamForced(liveStream);
    }
    try {
      setActiveCameraOrderId(orderId);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      setLiveStream(stream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 150);
    } catch (err) {
      alert("Acceso a la cámara restringido o no disponible. Puedes usar la opción de subir archivo.");
      console.error(err);
      setActiveCameraOrderId(null);
      setLiveStream(null);
    }
  };

  const snapPhoto = (orderId: string) => {
    if (videoRef.current) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth || 640;
        canvas.height = videoRef.current.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setUploadingPhotos(prev => ({ ...prev, [orderId]: dataUrl }));
        }
      } catch (e) {
        console.error("Error drawing thumbnail", e);
      }
    }
    if (liveStream) {
      stopCameraStreamForced(liveStream);
      setLiveStream(null);
    }
    setActiveCameraOrderId(null);
  };

  const cancelLiveCamera = () => {
    if (liveStream) {
      stopCameraStreamForced(liveStream);
      setLiveStream(null);
    }
    setActiveCameraOrderId(null);
  };

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    setProdName('');
    setProdPrice(50000);
    setProdCategory('desayunos');
    setProdDiscountPercentage(0);
    setProdImage('https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=600&auto=format&fit=crop&q=80');
    setProdDescription('');
    setProdFeatured(false);
    setShowProductModal(true);
  };

  const handleOpenEditModal = (product: Product) => {
    setEditingProduct(product);
    setProdName(product.name);
    setProdPrice(product.price);
    setProdCategory(product.category);
    setProdDiscountPercentage(product.discountPercentage || 0);
    setProdImage(product.image);
    setProdDescription(product.description);
    setProdFeatured(!!product.featured);
    setShowProductModal(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || prodPrice <= 0 || !prodDescription.trim() || !prodImage.trim()) {
      alert("Por favor completa de forma válida todos los campos.");
      return;
    }

    if (editingProduct) {
      // Update
      const updated: Product = {
        ...editingProduct,
        name: prodName,
        price: Number(prodPrice),
        category: prodCategory,
        discountPercentage: Number(prodDiscountPercentage),
        image: prodImage,
        description: prodDescription,
        featured: prodFeatured
      };
      onUpdateProduct(updated);
    } else {
      // Create
      const newProd: Product = {
        id: `prod-${Date.now()}`,
        name: prodName,
        price: Number(prodPrice),
        category: prodCategory,
        discountPercentage: Number(prodDiscountPercentage),
        image: prodImage,
        description: prodDescription,
        featured: prodFeatured
      };
      onAddProduct(newProd);
    }
    setShowProductModal(false);
  };

  const toggleOrderExpand = (id: string) => {
    setExpandedOrderID(prev => (prev === id ? null : id));
  };

  if (!isLoggedIn) {
    return (
      <div id="admin-login-view" className="max-w-md mx-auto my-12 bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-sage-primary text-white p-6 text-center space-y-2">
          <ShieldCheck size={40} className="mx-auto" />
          <h2 className="text-xl font-bold font-sans">Backoffice Los Detallitos de Lupe</h2>
          <p className="text-xs text-peach-light font-sans">Módulo protegido para la administración del negocio</p>
        </div>
        <form onSubmit={handleLogin} className="p-6 md:p-8 space-y-4 font-sans">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de Usuario </label>
            <input
              type="text"
              id="admin-username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ingresa tu usuario"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-primary transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña de Acceso</label>
            <input
              type="password"
              id="admin-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-primary transition"
            />
          </div>

          {loginError && (
            <p className="text-xs text-red-600 font-semibold">{loginError}</p>
          )}

          <button
            type="submit"
            id="admin-login-submit"
            className="w-full bg-sage-primary hover:bg-earth-brown text-white font-semibold py-2.5 rounded-xl text-sm transition shadow-sm cursor-pointer"
          >
            Ingresar al Sistema
          </button>

          {/* Indicador de conexión: permite validar desde cualquier dispositivo
              si la app está usando la base de datos central (Supabase) o solo
              el almacenamiento local de este dispositivo. */}
          <div className={`flex items-center justify-center gap-2 text-[11px] font-semibold rounded-xl px-3 py-2 border ${
            isSupabaseConfigured
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isSupabaseConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
            {isSupabaseConfigured
              ? 'En línea · usuarios centralizados (Supabase)'
              : 'Modo local · este dispositivo no está conectado a Supabase'}
          </div>
        </form>
      </div>
    );
  }

  if (userRole === 'domiciliario') {
    // 1. GPS Trigger Handler
    const triggerDomiGpsFetch = () => {
      if (!navigator.geolocation) {
        alert("La geolocalización no está soportada por tu navegador.");
        return;
      }
      setDomiIsGpsLoading(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setDomiCurrentCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });
          setDomiSelectedLocality(''); // Prioritize live GPS
          setDomiSortCriterion('gps');
          setDomiIsGpsLoading(false);
          alert("✓ Ubicación GPS obtenida con éxito. Pedidos ordenados por proximidad a tu posición actual.");
        },
        (err) => {
          console.error(err);
          setDomiIsGpsLoading(false);
          alert(`No se pudo obtener la posición GPS (${err.message}). Por favor selecciona una localidad de origen para estimar.`);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    };

    // 2. Filter delivery orders based on tab, driver assignment, and smart search query
    const filteredDomiOrders = orders.filter(order => {
      const matchesStatus = domiTab === 'entregar' ? order.status === 'En Reparto' : order.status === 'Entregado';
      if (!matchesStatus) return false;

      // Filter by dynamic driver username
      const assignedToMe = order.assignedDomiUsername === currentUser?.username || 
                           (!order.assignedDomiUsername && currentUser?.username === 'domiciliario');
      if (!assignedToMe) return false;

      if (!domiSearchQuery.trim()) return true;
      const q = domiSearchQuery.toLowerCase().trim();
      const s = order.shipping;
      return (
        order.id.toLowerCase().includes(q) ||
        s.buyerName.toLowerCase().includes(q) ||
        s.recipientName.toLowerCase().includes(q) ||
        (s.buyerPhone && s.buyerPhone.includes(q)) ||
        (s.recipientPhone && s.recipientPhone.includes(q)) ||
        (s.buyerCedula && s.buyerCedula.includes(q)) ||
        (s.direccionDetallada && s.direccionDetallada.toLowerCase().includes(q)) ||
        (s.municipio && s.municipio.toLowerCase().includes(q)) ||
        (s.localidad && s.localidad.toLowerCase().includes(q)) ||
        (s.barrio && s.barrio.toLowerCase().includes(q))
      );
    });

    // 3. Obtain delivery coordinate anchors
    const getOrderCoords = (shipping: any) => {
      if (shipping.locationLatLng && typeof shipping.locationLatLng.lat === 'number' && typeof shipping.locationLatLng.lng === 'number') {
        return shipping.locationLatLng;
      }
      const loc = shipping.localidad || '';
      const mun = shipping.municipio || '';
      const matchKey = Object.keys(LOCALITY_COORDINATES).find(key => 
        loc.toLowerCase().includes(key.toLowerCase()) || 
        key.toLowerCase().includes(loc.toLowerCase()) ||
        mun.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(mun.toLowerCase())
      );
      return matchKey ? LOCALITY_COORDINATES[matchKey] : { lat: 4.5981, lng: -74.0760 }; // DEFAULT: Plaza Bolívar
    };

    const getHourWeight = (hourStr: string) => {
      if (!hourStr) return 9;
      const s = hourStr.toUpperCase();
      if (s.includes("06:00 AM") || s.includes("6:00 AM")) return 1;
      if (s.includes("08:00 AM") || s.includes("8:00 AM")) return 2;
      if (s.includes("10:00 AM") || s.includes("10:00 AM")) return 3;
      if (s.includes("12:00 PM") || s.includes("12:00 PM")) return 4;
      if (s.includes("02:00 PM") || s.includes("2:00 PM")) return 5;
      if (s.includes("04:00 PM") || s.includes("4:00 PM")) return 6;
      return 7;
    };

    // Determine current coordinates base
    let activeDomiCoords = domiCurrentCoords;
    if (!activeDomiCoords && domiSelectedLocality) {
      activeDomiCoords = LOCALITY_COORDINATES[domiSelectedLocality] || null;
    }

    // 4. Sort delivery orders according to criterion
    const deliveryOrders = [...filteredDomiOrders].sort((a, b) => {
      if (domiSortCriterion === 'id') {
        return a.id.localeCompare(b.id);
      } else if (domiSortCriterion === 'schedule') {
        const dateComp = a.shipping.fechaEntrega.localeCompare(b.shipping.fechaEntrega);
        if (dateComp !== 0) return dateComp;
        return getHourWeight(a.shipping.horaEntrega) - getHourWeight(b.shipping.horaEntrega);
      } else if (domiSortCriterion === 'gps') {
        if (!activeDomiCoords) return 0; // standard original array
        const coordsA = getOrderCoords(a.shipping);
        const coordsB = getOrderCoords(b.shipping);
        const distA = getDistanceInKm(activeDomiCoords.lat, activeDomiCoords.lng, coordsA.lat, coordsA.lng);
        const distB = getDistanceInKm(activeDomiCoords.lat, activeDomiCoords.lng, coordsB.lat, coordsB.lng);
        return distA - distB; // Cloest to furthest
      }
      return 0;
    });

    return (
      <div id="domiciliario-dashboard" className="max-w-7xl mx-auto my-6 px-4 font-sans animate-fadeIn">
        {/* Header bar styled precisely */}
        <div className="bg-slate-800 text-white rounded-3xl p-6 md:p-8 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-sage-primary rounded-2xl text-white">
              <Truck size={28} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold font-sans">Bandeja de Entregas - Domiciliario</h2>
              <p className="text-xs text-slate-300 font-sans">
                Rutas de entrega, geoposicionamiento instantáneo y evidencias fotográficas.
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="bg-slate-700 hover:bg-slate-600 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition cursor-pointer"
          >
            <LogOut size={14} />
            Cerrar Sesión Domiciliario
          </button>
        </div>

        {/* Tab Selection Filter */}
        <div className="flex gap-2 border-b border-slate-200 my-6">
          <button
            onClick={() => setDomiTab('entregar')}
            className={`px-5 py-2.5 font-bold text-sm border-b-2 transition flex items-center gap-2 ${
              domiTab === 'entregar'
                ? 'border-sage-primary text-sage-primary'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock size={16} />
            Pedidos por Entregar ({orders.filter(o => o.status === 'En Reparto').length})
          </button>
          <button
            onClick={() => setDomiTab('historial')}
            className={`px-5 py-2.5 font-bold text-sm border-b-2 transition flex items-center gap-2 ${
              domiTab === 'historial'
                ? 'border-sage-primary text-sage-primary'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckSquare size={16} />
            Historial de Completados ({orders.filter(o => o.status === 'Entregado').length})
          </button>
        </div>

        {/* Advanced Filters & Sorting Controls for Delivery Role */}
        <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-6 shadow-xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Intelligent Search Input */}
            <div className="flex-1 relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                <Search size={16} />
              </span>
              <input
                type="text"
                placeholder="Buscar entrega por ID, comprador, destinatario o dirección..."
                value={domiSearchQuery}
                onChange={(e) => setDomiSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sage-primary transition"
              />
              {domiSearchQuery && (
                <button
                  onClick={() => setDomiSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 text-xs transition"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sorting Criteria Selector */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-600 flex items-center gap-1">Ordenar por:</span>
              <button
                type="button"
                onClick={() => setDomiSortCriterion('schedule')}
                className={`px-3 py-1.5 rounded-xl font-bold transition duration-200 border cursor-pointer ${
                  domiSortCriterion === 'schedule'
                    ? 'bg-sage-primary text-white border-sage-primary'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-250/60'
                }`}
              >
                📅 Día y Hora
              </button>

              <button
                type="button"
                onClick={triggerDomiGpsFetch}
                disabled={domiIsGpsLoading}
                className={`px-3 py-1.5 rounded-xl font-bold transition duration-200 border flex items-center gap-1 cursor-pointer ${
                  domiIsGpsLoading ? 'opacity-50' : ''
                } ${
                  domiSortCriterion === 'gps' && domiCurrentCoords
                    ? 'bg-olive-dark text-white border-olive-dark'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-250/60'
                }`}
                title="Sincronizar ubicación espacial mediante el GPS del dispositivo"
              >
                {domiIsGpsLoading ? '⌛ Obteniendo GPS...' : '📍 GPS Real'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setDomiSortCriterion('gps');
                  if (!domiSelectedLocality) setDomiSelectedLocality('Chapinero (Localidad 2)');
                }}
                className={`px-3 py-1.5 rounded-xl font-bold transition duration-200 border cursor-pointer ${
                  domiSortCriterion === 'gps' && !domiCurrentCoords && domiSelectedLocality
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-250/60'
                }`}
              >
                🏔️ Por Punto Base
              </button>
            </div>
          </div>

          {/* Conditional location base point estimation selector */}
          {domiSortCriterion === 'gps' && (
            <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-150 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 animate-fadeIn">
              <div className="space-y-1">
                <p className="font-bold text-slate-700 flex items-center gap-1.5">
                  📌 Centroide de Referencia Terrestre:
                </p>
                {domiCurrentCoords ? (
                  <p className="text-[10px] text-green-700 font-mono font-semibold">
                    📍 Lat: {domiCurrentCoords.lat.toFixed(5)}, Lng: {domiCurrentCoords.lng.toFixed(5)} (Ubicación real de tu dispositivo)
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-500 font-mono">
                    Selecciona una Localidad/Comuna de origen para estimar la ruta más cercana:
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={domiSelectedLocality}
                  onChange={(e) => {
                    setDomiSelectedLocality(e.target.value);
                    setDomiCurrentCoords(null); // Clear live GPS coordinate if manual selector is chosen
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-full sm:max-w-xs focus:ring-1 focus:ring-sage-primary focus:outline-none"
                >
                  <option value="">-- Seleccionar punto de inicio --</option>
                  <optgroup label="Bogotá D.C.">
                    {Object.keys(LOCALITY_COORDINATES)
                      .filter(k => k.includes("Localidad"))
                      .map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))
                    }
                  </optgroup>
                  <optgroup label="Soacha">
                    {Object.keys(LOCALITY_COORDINATES)
                      .filter(k => k.includes("Comuna"))
                      .map(com => (
                        <option key={com} value={com}>{com}</option>
                      ))
                    }
                  </optgroup>
                </select>
                {domiCurrentCoords && (
                  <button
                    onClick={() => {
                      setDomiCurrentCoords(null);
                      setDomiSelectedLocality('');
                      setDomiSortCriterion('schedule');
                    }}
                    className="p-1 px-2.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-[10px] font-bold text-slate-700 transition"
                  >
                    Borrar Posición
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Deliveries display list */}
        {deliveryOrders.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Truck size={40} className="mx-auto text-slate-300 mb-2" />
            <p className="text-slate-500 text-sm font-semibold">No hay entregas registradas en esta sección.</p>
            {domiTab === 'entregar' && (
              <p className="text-slate-400 text-xs mt-1">
                Los pedidos aprobados por el Administrador con el estado "En Reparto" figurarán automáticamente en esta bandeja.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {deliveryOrders.map(order => {
              const exactLatLng = order.shipping.locationLatLng;
              const fullAddress = order.shipping.direccionDetallada
                ? `${order.shipping.direccionDetallada}, ${order.shipping.municipio || 'Bogotá'}, Colombia`
                : 'Bogotá, Colombia';
              
              const mapsSearchUrl = exactLatLng
                ? `https://www.google.com/maps/search/?api=1&query=${exactLatLng.lat},${exactLatLng.lng}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
              
              const wazeSearchUrl = exactLatLng
                ? `https://waze.com/ul?ll=${exactLatLng.lat},${exactLatLng.lng}&navigate=yes`
                : `https://waze.com/ul?q=${encodeURIComponent(fullAddress)}`;

              const iframeSrc = exactLatLng
                ? `https://maps.google.com/maps?q=${exactLatLng.lat},${exactLatLng.lng}&t=&z=16&ie=UTF8&iwloc=&output=embed`
                : `https://maps.google.com/maps?q=${encodeURIComponent(fullAddress)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;

              return (
                <div key={order.id} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4 hover:shadow-md transition">
                  <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Código de Orden</span>
                      <h3 className="font-mono text-base font-bold text-slate-800">{order.id}</h3>
                    </div>
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
                      order.status === 'Entregado' ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-blue-50 text-blue-750 border border-blue-200'
                    }`}>
                      {order.status === 'Entregado' ? '✅ ENTREGADO' : '🚚 EN LOGÍSTICA'}
                    </span>
                  </div>

                  {/* Buyer and Recipient contacts */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
                    <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-450 uppercase font-extrabold mb-1">👤 Quién Recibe</p>
                      <p className="font-bold text-slate-800">{order.shipping.recipientName}</p>
                      <p className="font-semibold text-slate-500 mt-0.5">Contacto: {order.shipping.recipientPhone}</p>
                    </div>
                    <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                      <p className="text-[10px] text-slate-450 uppercase font-extrabold mb-1">📅 Fecha de Entrega</p>
                      <p className="font-bold text-slate-800">{order.shipping.fechaEntrega}</p>
                      <p className="text-slate-500 text-[10px] mt-0.5">Hora: {order.shipping.horaEntrega || 'Por definir'}</p>
                    </div>

                    {/* DYNAMIC SMART LINK BOX FOR THE BUYER'S PHONE */}
                    <div className="bg-emerald-50/40 p-3 rounded-2xl border border-emerald-100 col-span-1 sm:col-span-2 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-emerald-800 uppercase font-extrabold tracking-wider flex items-center gap-1">
                          <span>👤</span> Comprador (Quien Paga)
                        </span>
                        {exactLatLng && (
                          <span className="text-[8px] sm:text-[9px] text-emerald-700 font-extrabold bg-emerald-100/50 px-2 py-0.5 rounded-full">
                            📍 GPS Pin Guardado
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-emerald-100/40 shadow-2xs">
                        <div>
                          <p className="font-extrabold text-slate-850 text-xs sm:text-sm">{order.shipping.buyerName}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5 font-bold">CC: {order.shipping.buyerCedula || 'No registrada'}</p>
                        </div>
                        <a
                          href={`tel:${order.shipping.buyerPhone?.replace(/\D/g, '')}`}
                          onClick={(e) => {
                            const cleanPhone = (order.shipping.buyerPhone || '').replace(/\D/g, '');
                            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                            if (!isMobile) {
                              e.preventDefault();
                              const fullPhone = cleanPhone.length === 10 ? `57${cleanPhone}` : cleanPhone;
                              window.open(`https://web.whatsapp.com/send?phone=${fullPhone}&text=${encodeURIComponent(`¡Hola ${order.shipping.buyerName}! Te habla el domiciliario de Los Detallitos de Lupe para coordinar los detalles de entrega de tu pedido #${order.id}.`)}`, '_blank');
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs py-2 px-3.5 rounded-xl flex items-center justify-center gap-1.5 transition duration-150 shadow-sm cursor-pointer border border-emerald-505"
                          title="Llamar directo (Teléfono) o Chatear por WhatsApp (PC)"
                        >
                          <span>📞 Contactar:</span>
                          <span className="underline tracking-wide">{order.shipping.buyerPhone}</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Addresses */}
                  <div className="border border-slate-100 bg-slate-50/20 p-4 rounded-2xl text-xs space-y-2">
                    <div className="flex items-center gap-1.5 border-b border-slate-100 pb-1.5 mb-1.5 text-slate-600 font-bold">
                      <MapPin size={13} className="text-sage-primary" />
                      <span>Dirección de Envío</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px] text-slate-600">
                      <p><strong className="font-sans text-[10px] uppercase text-slate-400">Municipio:</strong> {order.shipping.municipio}</p>
                      <p><strong className="font-sans text-[10px] uppercase text-slate-400">Localidad:</strong> {order.shipping.localidad}</p>
                      <p className="col-span-2"><strong className="font-sans text-[10px] uppercase text-slate-400">Barrio:</strong> {order.shipping.barrio}</p>
                      <p className="col-span-2 text-slate-900 border-t border-slate-100/50 pt-2 mt-1.5 font-sans text-xs">
                        <strong>Dirección:</strong> {order.shipping.direccionDetallada}
                      </p>
                    </div>
                    {order.shipping.indicacionesAdicionales && (
                      <div className="p-2.5 bg-white border border-slate-100 rounded-xl text-[11px] leading-relaxed text-slate-600 font-sans">
                        💡 <strong>Indicaciones adicionales:</strong> {order.shipping.indicacionesAdicionales}
                      </div>
                    )}
                  </div>

                  {/* GEOPOSITIONING INLINE FRAME (GEOPOSICIONADOR SEGUN DIRECCION FACILITADA) */}
                  <div className="border border-slate-200 p-3.5 rounded-3xl bg-white space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-sans font-bold text-xs text-slate-700">
                        <Compass size={14} className="text-olive-dark" />
                        <span>Confirmador de Punto de Entrega (GPS)</span>
                      </div>
                      <span className="text-[8px] font-extrabold text-olive-dark uppercase bg-olive-dark/10 border border-olive-dark/25 px-2 py-0.5 rounded-full">
                        {exactLatLng ? 'Pin Manual Cliente' : 'Posición Estimada'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {exactLatLng 
                        ? 'El cliente ha fijado un marcador de alta precisión por satélite. ¡Ruta ultra exacta!'
                        : 'El georreferenciador lee la dirección facilitada para generar el visor interactivo de confirmación:'
                      }
                    </p>
                    <div className="w-full relative h-40 bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 shadow-2xs">
                      <iframe
                        src={iframeSrc}
                        className="absolute inset-0 w-full h-full border-none"
                        allowFullScreen
                        loading="lazy"
                        title={`Mapa georreferenciado para ${order.id}`}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-slate-450 px-0.5">
                      <span>Ref: {(order.shipping.municipio || 'BOGOTÁ').toUpperCase()}</span>
                      <span>{exactLatLng ? `Pin: ${exactLatLng.lat.toFixed(5)}, ${exactLatLng.lng.toFixed(5)}` : 'Dirección Geocodificada'}</span>
                    </div>
                  </div>

                  {/* ROUTING COMPATIBILITY */}
                  <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-100 space-y-2">
                    <span className="text-[10px] font-bold text-slate-450 block uppercase tracking-wider">Enlaces para Dispositivo Móvil:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={mapsSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-750 font-bold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition text-center shadow-3xs"
                      >
                        <Compass className="text-blue-500" size={13} />
                        Google Maps
                        <ExternalLink size={9} className="text-slate-400" />
                      </a>
                      <a
                        href={wazeSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-sky-50 hover:bg-sky-100/60 border border-sky-100 text-sky-800 font-bold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition text-center shadow-3xs"
                      >
                        <Navigation className="text-[#33CCFF] fill-[#33CCFF]" size={13} />
                        Ruta Waze
                        <ExternalLink size={9} className="text-sky-600/70" />
                      </a>
                    </div>
                  </div>

                  {/* CHANGE STATUS VIA THE EXCLUSIVE DIALOG MODAL */}
                  {order.status === 'En Reparto' && (
                    <div className="bg-sage-light/10 p-4 rounded-2xl border border-sage-primary/20 space-y-3">
                      <p className="text-xs text-slate-650 leading-relaxed font-sans">
                        Una vez hayas entregado la sorpresa al destinatario, presiona el botón para agregar la foto de evidencia y archivar este pedido.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setDomiClosingOrder(order);
                        }}
                        className="w-full bg-sage-primary hover:bg-earth-brown text-white font-extrabold text-xs py-3 rounded-xl transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <CheckSquare size={15} />
                        Continuar para Cerrar Pedido
                      </button>
                    </div>
                  )}

                  {/* Read only details of historical delivery proof */}
                  {order.status === 'Entregado' && (
                    <div className="bg-green-50/50 border border-green-200/55 p-4 rounded-2xl text-xs space-y-2">
                      <p className="text-green-800 font-bold flex items-center gap-1">
                        <CheckCircle2 size={13} className="text-green-700" />
                        Soporte de Entrega Registrado:
                      </p>
                      {order.deliveryPhotoUrl ? (
                        <div className="relative group overflow-hidden rounded-xl border border-slate-200 max-w-[120px]">
                          <img
                            src={order.deliveryPhotoUrl}
                            alt="Prueba de entrega guardada"
                            className="w-full h-20 object-cover cursor-zoom-in"
                            onClick={() => setZoomReceiptUrl(order.deliveryPhotoUrl || null)}
                          />
                        </div>
                      ) : (
                        <p className="text-slate-400 text-[10px] italic">Sin registro de foto</p>
                      )}
                      {order.deliveredAt && (
                        <p className="text-[10px] text-slate-500 font-mono">
                          <strong>Registrado el:</strong> {new Date(order.deliveredAt).toLocaleString('es-CO')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Cart Items list */}
                  <div className="p-3 bg-slate-50/55 rounded-2xl border border-slate-100/60">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Items de la Compra:</p>
                    <div className="space-y-1 text-xs text-slate-700 max-h-24 overflow-y-auto">
                      {order.items.map(it => (
                        <div key={it.product.id} className="flex justify-between font-medium">
                          <span>{it.product.name} <strong className="text-sage-primary font-mono font-bold">x{it.quantity}</strong></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal display zoomed images */}
        {zoomReceiptUrl && (
          <div
            onClick={() => setZoomReceiptUrl(null)}
            className="fixed inset-0 bg-black/95 z-55 flex items-center justify-center p-4 backdrop-blur-md cursor-zoom-out animate-fadeIn"
          >
            <div className="max-w-3xl max-h-[90vh] relative">
              <span className="text-white text-[10px] font-base bg-black/50 py-1.5 px-3 rounded-full mb-2 inline-block">Click en cualquier lado para cerrar</span>
              <img
                src={zoomReceiptUrl}
                alt="Zoom"
                className="max-w-full max-h-[80vh] object-contain rounded-xl border border-white/20 shadow-2xl"
              />
            </div>
          </div>
        )}

        {/* Modal exclusivo para "Cerrar Pedido" de Domiciliario */}
        {domiClosingOrder && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div 
              className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-slate-100 space-y-5 relative text-slate-800"
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-150 pb-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Formalización de Entrega</span>
                  <h3 className="text-lg font-bold font-mono text-slate-800">Cerrar Pedido {domiClosingOrder.id}</h3>
                </div>
                <button 
                  onClick={() => {
                    cancelLiveCamera();
                    setDomiClosingOrder(null);
                  }}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Requirement Alert */}
              <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 text-xs text-amber-900 space-y-1">
                <p className="font-extrabold flex items-center gap-1">
                  ⚠️ Imagen de Entrega Obligatoria
                </p>
                <p className="leading-relaxed font-medium">
                  Debe anexar la fotografía de entrega para poder cerrar el pedido de manera válida en el sistema (rol domiciliario).
                </p>
              </div>

              {/* Upload & Snapshot Section */}
              <div className="space-y-4">
                {uploadingPhotos[domiClosingOrder.id] ? (
                  <div className="bg-emerald-50/50 border border-emerald-150 p-4 rounded-2xl space-y-3">
                    <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      ✓ Fotografía de entrega lista para archivar:
                    </p>
                    <div className="relative group overflow-hidden rounded-xl border border-slate-200 max-w-[180px] shadow-sm mx-auto">
                      <img
                        src={uploadingPhotos[domiClosingOrder.id]}
                        alt="Evidencia fotográfica"
                        className="w-full h-32 object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setUploadingPhotos(prev => {
                            const c = { ...prev };
                            delete c[domiClosingOrder.id];
                            return c;
                          });
                        }}
                        className="absolute top-1.5 right-1.5 bg-red-600 hover:bg-red-700 text-white font-bold w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-md transition cursor-pointer"
                        title="Eliminar Foto"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      Captura el soporte con la cámara en vivo de tu dispositivo o sube un archivo desde el almacenamiento local:
                    </p>

                    {/* Camera Selectors */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Upload */}
                      <label className="cursor-pointer bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 font-bold text-[11px] py-2.5 px-2 rounded-xl transition text-center shadow-3xs flex items-center justify-center gap-1.5">
                        <Upload size={14} className="text-slate-500" />
                        Subir Archivo
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const r = new FileReader();
                              r.onload = async (event) => {
                                if (event.target?.result) {
                                  try {
                                    const compressed = await compressImageBase64(event.target.result as string, 800, 800, 0.4);
                                    setUploadingPhotos(prev => ({ ...prev, [domiClosingOrder.id]: compressed }));
                                  } catch (err) {
                                    setUploadingPhotos(prev => ({ ...prev, [domiClosingOrder.id]: event.target!.result as string }));
                                  }
                                }
                              };
                              r.readAsDataURL(file);
                            }
                          }}
                          className="hidden"
                        />
                      </label>

                      {/* Live WebCam */}
                      <button
                        type="button"
                        onClick={() => startLiveCamera(domiClosingOrder.id)}
                        className="bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 font-bold text-[11px] py-2.5 px-2 rounded-xl transition text-center shadow-3xs flex items-center justify-center gap-1.5"
                      >
                        <Camera size={14} className="text-sage-primary" />
                        Usar Cámara
                      </button>
                    </div>

                    {/* Stream display */}
                    {activeCameraOrderId === domiClosingOrder.id && liveStream && (
                      <div className="bg-slate-900 p-3 rounded-2xl space-y-2.5 border border-slate-800 text-white animate-fadeIn">
                        <span className="text-[10px] font-extrabold text-slate-400 text-center block uppercase tracking-wider">Cámara en Vivo</span>
                        <div className="relative rounded-xl overflow-hidden bg-black aspect-video border border-slate-700">
                          <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => snapPhoto(domiClosingOrder.id)}
                              className="bg-red-650 hover:bg-red-700 text-white font-extrabold text-[11px] py-2 px-4 rounded-full flex items-center gap-1 shadow-md active:scale-95 cursor-pointer"
                            >
                              🔴 Capturar Foto
                            </button>
                            <button
                              type="button"
                              onClick={cancelLiveCamera}
                              className="bg-slate-800 text-slate-250 hover:bg-slate-700 font-bold text-[10px] py-1 px-3 rounded-full cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Operations Footer */}
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    cancelLiveCamera();
                    setDomiClosingOrder(null);
                    setDomiCloseConfirmationRequired(false);
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                
                {!domiCloseConfirmationRequired ? (
                  <button
                    type="button"
                    disabled={!uploadingPhotos[domiClosingOrder.id]}
                    onClick={() => {
                      const fileBase64 = uploadingPhotos[domiClosingOrder.id];
                      if (!fileBase64) {
                        alert("Por favor carga o toma una fotografía de entrega para archivar el pedido.");
                        return;
                      }
                      setDomiCloseConfirmationRequired(true);
                    }}
                    className={`flex-1 font-bold text-xs py-3 rounded-xl transition shadow-sm flex items-center justify-center gap-1 cursor-pointer ${
                      uploadingPhotos[domiClosingOrder.id]
                        ? 'bg-green-700 hover:bg-green-800 text-white text-bold animate-pulse'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Check size={14} />
                    Confirmar y Cerrar Pedido
                  </button>
                ) : (
                  <div className="w-full bg-amber-50 border border-amber-250 p-3.5 rounded-xl space-y-3 text-left animate-fadeIn">
                    <p className="text-xs font-extrabold text-amber-900 leading-tight">
                      🚨 ¿CONFIRMAR REGISTRO DE ENTREGA?
                    </p>
                    <p className="text-[11px] text-slate-600 leading-relaxed font-sans font-medium">
                      ¿Cerrar el pedido #{domiClosingOrder.id} como <strong>"ENTREGADO"</strong>? Esto publicará el comprobante fotográfico en el portal de seguimiento del cliente permanentemente.
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setDomiCloseConfirmationRequired(false)}
                        className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[10px] px-3 py-1.5 rounded-lg cursor-pointer"
                      >
                        No, regresar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const fileBase64 = uploadingPhotos[domiClosingOrder.id];
                          onUpdateOrderStatus(domiClosingOrder.id, 'Entregado', fileBase64);
                          setDomiClosingOrder(null);
                          setDomiCloseConfirmationRequired(false);
                          alert(`✅ ¡Excelente! El pedido ${domiClosingOrder.id} ha sido entregado satisfactoriamente.`);
                        }}
                        className="bg-green-700 hover:bg-green-800 text-white font-extrabold text-[10px] px-3 py-1.5 rounded-lg cursor-pointer shadow-xs"
                      >
                        Sí, Confirmar Entrega
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Helper to render sortable table headers for Order Database view
  const renderSortableHeader = (column: 'id' | 'fechaEntrega' | 'comprador' | 'destinatario' | 'municipio' | 'total' | 'status', label: string) => {
    const isCurrent = adminSortColumn === column;
    return (
      <th 
        onClick={() => {
          if (adminSortColumn === column) {
            setAdminSortOrder(adminSortOrder === 'asc' ? 'desc' : 'asc');
          } else {
            setAdminSortColumn(column);
            setAdminSortOrder('asc');
          }
        }}
        className="px-4 py-3 bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition select-none"
      >
        <div className="flex items-center gap-1.5 justify-center sm:justify-start">
          <span>{label}</span>
          <span className="text-[10px] text-slate-400">
            {isCurrent ? (adminSortOrder === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </div>
      </th>
    );
  };

  return (
    <div id="admin-dashboard" className="max-w-7xl mx-auto my-6 px-4 font-sans relative">
      {/* ALERTA VISUAL EN LA PARTE SUPERIOR IZQUIERDA (NUEVO PEDIDO) */}
      {newOrderAlert && (
        <div className="fixed top-24 left-6 z-50 max-w-sm w-full bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-2xl p-4 animate-fadeIn font-sans">
          <div className="flex items-start gap-4">
            <span className="text-3xl animate-bounce select-none">🛎️</span>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-black uppercase tracking-widest text-amber-400">¡Pedido Recibido!</h4>
              <p className="text-xs text-slate-300 mt-1 leading-normal">
                La orden <strong className="text-white font-bold">{newOrderAlert.id}</strong> fue registrada por <strong className="text-white font-bold">{newOrderAlert.shipping.buyerName}</strong>.
              </p>
              
              <div className="flex items-center gap-2 mt-3 text-xs">
                <button
                  type="button"
                  onClick={() => playNotificationTone()}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold px-2 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer select-none"
                  title="Reproducir sonido de notificación"
                >
                  🔊 Sonar Tono
                </button>
                <button
                  type="button"
                  onClick={() => handleGoToOrder(newOrderAlert.id)}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10px] font-black px-3 py-1.5 rounded-lg shadow-xs transition-all text-center cursor-pointer select-none"
                >
                  Validar y Tramitar ➔
                </button>
              </div>
            </div>
            <button
              onClick={() => setNewOrderAlert(null)}
              className="text-slate-500 hover:text-slate-200 transition text-sm p-1 cursor-pointer font-bold"
              type="button"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="bg-slate-800 text-white rounded-3xl p-6 md:p-8 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-sage-primary rounded-2xl">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold font-sans">Consola de Control Privada</h2>
            <p className="text-xs text-slate-300 font-sans">Gestión de inventario de detalles y verificación logística de órdenes.</p>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isSupabaseConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
              <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">
                {isSupabaseConfigured ? '🟢 Conectado a Supabase' : '🟡 Modo Local (LocalStorage)'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowSupabaseModal(true)}
            className="bg-sky-700 hover:bg-sky-800 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition cursor-pointer text-white shadow-xs"
          >
            <Database size={14} />
            Exportador Supabase
          </button>
          <button
            onClick={() => {
              setActiveTab('orders');
              setTimeout(() => {
                const element = document.getElementById('automated-id-config-card');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  element.classList.add('ring-4', 'ring-offset-2', 'ring-sage-primary');
                  setTimeout(() => {
                    element.classList.remove('ring-4', 'ring-offset-2', 'ring-sage-primary');
                  }, 2500);
                }
              }, 150);
            }}
            className="bg-olive-dark hover:bg-earth-brown text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition cursor-pointer text-white shadow-xs"
          >
            <SlidersHorizontal size={14} />
            Configurar ID de Venta
          </button>
          {canDeleteOrders && (
          <button
            onClick={() => {
              setBulkDeleteConfirmationStep(1);
              setShowBulkDeleteConfirm(true);
            }}
            className="bg-rose-600 hover:bg-rose-700 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 transition cursor-pointer text-white shadow-xs"
          >
            <Trash2 size={14} />
            Eliminar Órdenes Totales
          </button>
          )}
          {onAddOrder && canSimulateOrders && (
            <button
              onClick={() => {
                const randomIdNum = Math.floor(10000 + Math.random() * 90000);
                const mockOrder: Order = {
                  id: `${adminIdPrefix || 'LDL-'}${randomIdNum}`,
                  shipping: {
                    buyerName: ["Sofia Gómez D.", "Mauricio Ospina", "Luisa Fernanda", "Camilo Torres"][Math.floor(Math.random() * 4)],
                    buyerPhone: "315" + Math.floor(1000000 + Math.random() * 9000000),
                    buyerCedula: "1016016" + Math.floor(100 + Math.random() * 900),
                    recipientName: "Liliana Restrepo V.",
                    recipientPhone: "320" + Math.floor(1000000 + Math.random() * 9000000),
                    municipio: "Bogotá D.C.",
                    localidad: "Engativá (Localidad 10)",
                    barrio: "Minuto de Dios",
                    direccionDetallada: "Calle 80 # 73A - 15 Casa 4",
                    indicacionesAdicionales: "Frente al parque principal",
                    fechaEntrega: "2026-06-28",
                    horaEntrega: "07:00 AM - 09:00 AM",
                    mensajeTarjeta: "Para la flor más hermosa de mi jardín, un detalle con todo mi corazón. ¡Feliz día!"
                  },
                  items: [
                    {
                      product: products[0] || { id: 'sample', name: 'Desayuno Sorpresa Amor Práctico', price: 95000, description: 'Desayuno fresco artesanal', category: 'desayunos', image: 'https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=600&auto=format&fit=crop&q=80' },
                      quantity: 1
                    }
                  ],
                  total: (products[0]?.price || 95000) + 12000,
                  paymentReceiptUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&auto=format&fit=crop&q=80",
                  status: "En Validación",
                  createdAt: new Date().toISOString()
                };
                onAddOrder(mockOrder);
              }}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-sm border border-amber-400"
            >
              <span>🪄 Simular Pedido</span>
            </button>
          )}

          <button
            onClick={handleLogout}
            className="bg-slate-700 hover:bg-slate-600 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 transition cursor-pointer text-slate-200 border border-slate-600"
          >
            <LogOut size={14} />
            Cerrar Sesión Admin
          </button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex gap-2 border-b border-slate-200 my-6">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-5 py-2.5 font-bold text-sm border-b-2 transition ${
            activeTab === 'orders'
              ? 'border-sage-primary text-sage-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📦 Órdenes Recibidas ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-5 py-2.5 font-bold text-sm border-b-2 transition ${
            activeTab === 'inventory'
              ? 'border-sage-primary text-sage-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📋 Inventario de Catálogo ({products.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-5 py-2.5 font-bold text-sm border-b-2 transition ${
            activeTab === 'users'
              ? 'border-sage-primary text-sage-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          👤 Gestión de Usuarios ({systemUsers.length})
        </button>
      </div>

      {/* TAB 1: ORDERS SECTION */}
      {activeTab === 'orders' && (
        <div id="admin-orders-tab" className="space-y-6">
          {/* Automated ID Generation Config Card */}
          <div id="automated-id-config-card" className="bg-white rounded-3xl border-2 border-olive-dark/20 p-6 shadow-xs animate-fadeIn space-y-4 font-sans transition-all duration-300">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <span className="text-lg">⚙️</span> Configuración del Generador de ID de Ventas
                </h3>
                <p className="text-xs text-slate-550 mt-1">
                  Ajusta las reglas de autonumeración y prefijos para todas las nuevas órdenes creadas por los compradores.
                </p>
              </div>
              <span className="text-xs bg-olive-dark/10 text-olive-dark px-2.5 py-1 rounded-full font-bold">Activo</span>
            </div>

            <form onSubmit={handleSaveIdConfig} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-650 mb-1.5 mb-1">Prefijo de Orden</label>
                <input
                  type="text"
                  value={adminIdPrefix}
                  onChange={(e) => setAdminIdPrefix(e.target.value)}
                  placeholder="LDL-"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-sage-primary text-slate-800 font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-655 mb-1.5 font-sans">Contador Inicial o Siguiente</label>
                <input
                  type="number"
                  min="1"
                  value={adminIdCounter}
                  onChange={(e) => setAdminIdCounter(e.target.value)}
                  placeholder="70411"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-sage-primary text-slate-800 font-bold font-mono"
                />
              </div>
              <div>
                <button
                  type="submit"
                  className="w-full bg-sage-primary hover:bg-earth-brown text-white font-bold text-xs py-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Check size={14} /> Guardar Cambios
                </button>
              </div>
            </form>

            <div className="bg-slate-50 p-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
              <div>
                Siguiente orden será generada con el ID: <strong className="font-mono text-olive-dark bg-white px-2 py-0.5 rounded-md border border-olive-dark/10">{adminIdPrefix.toUpperCase().trim()}{String(parseInt(adminIdCounter, 10) || 1).padStart(5, '0')}</strong>
              </div>
              {showIdConfigMsg && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full animate-fadeIn border border-emerald-150">
                  ✓ ¡Configuración de ID guardada con éxito!
                </span>
              )}
            </div>
          </div>

          {/* Controls Bar for Searching and switching layout */}
          <div className="bg-white rounded-3xl border border-slate-100 p-4 sm:p-5 shadow-xs space-y-4 font-sans">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Intelligent Search Input */}
              <div className="flex-1 relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                  <Search size={18} />
                </span>
                <input
                  type="text"
                  placeholder="Buscador inteligente: busca por ID, cédula, nombre de comprador o destinatario, cel, dirección..."
                  value={adminSearchQuery}
                  onChange={(e) => setAdminSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-sage-primary transition font-sans"
                />
                {adminSearchQuery && (
                  <button
                    onClick={() => setAdminSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition text-sm font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* View Selector Switcher */}
              <div className="flex items-center gap-2 self-start lg:self-center">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mr-1 font-sans">Visualización:</span>
                <button
                  type="button"
                  onClick={() => setOrdersViewMode('table')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border font-sans ${
                    ordersViewMode === 'table'
                      ? 'bg-sage-primary text-white border-sage-primary shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  📊 Tabla Base
                </button>
                <button
                  type="button"
                  onClick={() => setOrdersViewMode('cards')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border font-sans ${
                    ordersViewMode === 'cards'
                      ? 'bg-sage-primary text-white border-sage-primary shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  🃏 Tarjetas
                </button>
              </div>
            </div>

            {/* Quick Sorter Hint if in card view */}
            {ordersViewMode === 'cards' && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500 font-sans">
                <span className="font-bold text-slate-600">Ordenar tarjetas por:</span>
                {(['id', 'fechaEntrega', 'comprador', 'destinatario', 'municipio', 'total', 'status'] as const).map((col) => (
                  <button
                    key={col}
                    onClick={() => {
                      if (adminSortColumn === col) {
                        setAdminSortOrder(adminSortOrder === 'asc' ? 'desc' : 'asc');
                      } else {
                        setAdminSortColumn(col);
                        setAdminSortOrder('asc');
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg border transition ${
                      adminSortColumn === col
                        ? 'bg-sage-primary/10 text-sage-primary border-sage-primary/30 font-bold'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {col.toUpperCase()} {adminSortColumn === col ? (adminSortOrder === 'asc' ? '▲' : '▼') : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ORDERS RENDER SECTION */}
          {orders.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200 font-sans">
              <p className="text-slate-500 text-sm font-medium">No se han registrado órdenes aún en esta sesión.</p>
            </div>
          ) : filteredAndSortedOrders.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200 font-sans">
              <Search size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 text-sm font-medium">Ningún pedido coincide con tu búsqueda inteligente.</p>
              <button
                onClick={() => setAdminSearchQuery('')}
                className="mt-2 text-xs font-bold text-sage-primary hover:underline font-mono"
              >
                Limpiar filtros de búsqueda
              </button>
            </div>
          ) : ordersViewMode === 'table' ? (
            /* TYPE BASE: DATABASE STYLE GRID TABLE */
            <div className="overflow-x-auto rounded-3xl border border-slate-100 shadow-sm bg-white font-sans">
              <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-[900px]">
                <thead>
                  <tr className="border-b border-slate-150">
                    {renderSortableHeader('id', 'ID de Venta')}
                    {renderSortableHeader('fechaEntrega', 'Fecha Entrega')}
                    {renderSortableHeader('comprador', 'Comprador (Cédula)')}
                    {renderSortableHeader('destinatario', 'Destinatario')}
                    {renderSortableHeader('municipio', 'Municipio')}
                    {renderSortableHeader('total', 'Detalle Pago (Prod/Envío/Total)')}
                    {renderSortableHeader('status', 'Estado de Órden')}
                    <th className="px-4 py-3 bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider text-center select-none w-20">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAndSortedOrders.map((order) => {
                    const isExpanded = expandedOrderID === order.id;
                    const sub = order.subtotal || order.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
                    const fee = typeof order.shippingFee === 'number' ? order.shippingFee : Math.max(0, order.total - sub);
                    return (
                      <React.Fragment key={order.id}>
                        {/* Summary Interactive Row */}
                        <tr 
                          id={`admin-order-row-${order.id}`}
                          onClick={() => toggleOrderExpand(order.id)}
                          className={`hover:bg-slate-50/80 transition cursor-pointer ${isExpanded ? 'bg-slate-50/40 font-medium' : ''}`}
                        >
                          <td className="px-4 py-4 font-mono font-bold text-slate-900">{order.id}</td>
                          <td className="px-4 py-4 text-slate-600 font-medium">{order.shipping.fechaEntrega}</td>
                          <td className="px-4 py-4">
                            <span className="font-semibold text-slate-800 block">{order.shipping.buyerName}</span>
                            <span className="text-[10px] text-slate-400 font-mono block font-medium">CC: {order.shipping.buyerCedula || 'N/A'}</span>
                          </td>
                          <td className="px-4 py-4 text-slate-700 font-medium">{order.shipping.recipientName}</td>
                          <td className="px-4 py-4">
                            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold font-sans">{order.shipping.municipio}</span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-col gap-0.5 text-xs">
                              <div className="text-[11px] text-slate-500 font-sans">Prod: <span className="font-semibold text-slate-700">${sub.toLocaleString('es-CO')}</span></div>
                              <div className="text-[11px] text-slate-500 font-sans">Envío: <span className="font-semibold text-slate-700">${fee.toLocaleString('es-CO')}</span></div>
                              <div className="font-extrabold text-olive-dark mt-0.5">Total: ${order.total.toLocaleString('es-CO')}</div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                              order.status === 'En Preparación'
                                ? 'bg-indigo-100 text-indigo-805'
                                : order.status === 'En Reparto'
                                ? 'bg-blue-100 text-blue-805'
                                : order.status === 'Entregado'
                                ? 'bg-teal-100 text-teal-800'
                                : order.status === 'Rechazado'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-805'
                            }`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleOrderExpand(order.id);
                              }}
                              className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition cursor-pointer"
                              title="Ver detalles de la preparación"
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <Eye size={16} />}
                            </button>
                          </td>
                        </tr>

                        {/* Collapsed Detailed Box in a Nested Row */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="bg-slate-50/50 p-5 border-b border-slate-150">
                              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 animate-fadeIn font-sans">
                                {/* Left Side Box: Shipping addresses and message */}
                                <div className="md:col-span-8 space-y-4">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
                                    <div>
                                      <h4 className="text-[10px] uppercase font-extrabold text-slate-400 mb-1">Destinatario</h4>
                                      <p className="text-sm font-bold text-slate-800">{order.shipping.recipientName}</p>
                                      <p className="text-xs text-slate-500">Cel: {order.shipping.recipientPhone}</p>
                                    </div>
                                    <div>
                                      <h4 className="text-[10px] uppercase font-extrabold text-slate-400 mb-1">Comprador</h4>
                                      <p className="text-sm font-bold text-slate-800">{order.shipping.buyerName}</p>
                                      <p className="text-xs text-slate-500">Cel: {order.shipping.buyerPhone}</p>
                                    </div>
                                  </div>

                                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs space-y-3">
                                    <h4 className="text-[10px] uppercase font-extrabold text-slate-400">Ubicación y Datos de Entrega</h4>
                                    <div className="text-xs text-slate-700 grid grid-cols-2 gap-2 font-mono">
                                      <p><strong>Municipio:</strong> {order.shipping.municipio}</p>
                                      <p><strong>Localidad/Zona:</strong> {order.shipping.localidad}</p>
                                      <p><strong>Barrio:</strong> {order.shipping.barrio}</p>
                                      <p className="col-span-2"><strong>Dirección:</strong> {order.shipping.direccionDetallada}</p>
                                      {order.shipping.indicacionesAdicionales && (
                                        <p className="col-span-2 text-slate-500"><strong>Detalles de Guía:</strong> {order.shipping.indicacionesAdicionales}</p>
                                      )}
                                      {order.shipping.horaEntrega && (
                                        <p className="col-span-2 text-rose-700 font-bold"><strong>⏰ Hora de Entrega Programada:</strong> {order.shipping.horaEntrega}</p>
                                      )}
                                    </div>

                                    {/* Geolocalization / Coordenadas details */}
                                    <div className="border bg-slate-50 border-slate-200 p-2.5 rounded-xl space-y-1.5 font-sans">
                                      <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-500">
                                        <span>📍 Geolocalización Satelital:</span>
                                      </div>
                                      {order.shipping.locationLatLng ? (
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-[10.5px] text-green-800 font-mono font-semibold">
                                            Fijado (Lat: {order.shipping.locationLatLng.lat.toFixed(5)}, Lng: {order.shipping.locationLatLng.lng.toFixed(5)})
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-[10.5px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-250">
                                            ⚠️ Sin geolocalización de cliente
                                          </span>
                                        </div>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOrderToEditCoords(order);
                                          setAdminTempCoords(order.shipping.locationLatLng || null);
                                        }}
                                        className="w-full h-8 flex items-center justify-center gap-1.5 bg-sage-primary hover:bg-slate-800 text-white text-[11px] font-bold px-3 rounded-lg transition-all active:scale-95 cursor-pointer shadow-3xs"
                                      >
                                        <MapPin size={12} />
                                        {order.shipping.locationLatLng ? "Ajustar Coordenadas Satelitales" : "Asignar Coordenadas Satelitales"}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs space-y-2">
                                    <h4 className="text-[10px] uppercase font-extrabold text-slate-400">Dedicatoria de Tarjeta</h4>
                                    <p className="text-xs italic bg-slate-50 p-2.5 rounded-lg text-slate-700 border-l-2 border-sage-primary">
                                      "{order.shipping.mensajeTarjeta}"
                                    </p>
                                    {((order.shipping.cardPhotos && order.shipping.cardPhotos.length > 0) || order.shipping.cardPhotoUrl) && (
                                      <div className="mt-2.5 space-y-1.5 font-sans">
                                        <span className="text-[9px] uppercase font-semibold text-slate-400 block">
                                          {order.shipping.cardPhotos && order.shipping.cardPhotos.length > 1 ? `📸 Fotos Adjuntas (${order.shipping.cardPhotos.length}):` : '📸 Foto Adjunta para Tarjeta:'}
                                        </span>
                                        <div className="flex flex-wrap gap-2.5">
                                          {order.shipping.cardPhotos && order.shipping.cardPhotos.length > 0 ? (
                                            order.shipping.cardPhotos.map((photo, pIdx) => (
                                              <div key={pIdx} className="relative group overflow-hidden rounded-lg border border-slate-200 w-24 h-24 bg-slate-50">
                                                <img
                                                  src={photo.url}
                                                  alt={`Foto tarjeta ${pIdx + 1}`}
                                                  className="w-full h-full object-cover cursor-pointer transition transform hover:scale-105"
                                                  onClick={() => setZoomReceiptUrl(photo.url)}
                                                  referrerPolicy="no-referrer"
                                                />
                                                <div className="absolute inset-x-0 bottom-0 bg-black/50 text-[8px] text-white py-0.5 px-1 truncate text-center font-medium">
                                                  {photo.name}
                                                </div>
                                              </div>
                                            ))
                                          ) : (
                                            <div className="relative group overflow-hidden rounded-lg border border-slate-200 w-24 h-24 bg-slate-50">
                                              <img
                                                src={order.shipping.cardPhotoUrl}
                                                alt="Foto tarjeta"
                                                className="w-full h-full object-cover cursor-pointer transition transform hover:scale-105"
                                                onClick={() => setZoomReceiptUrl(order.shipping.cardPhotoUrl!)}
                                                referrerPolicy="no-referrer"
                                              />
                                              {order.shipping.cardPhotoName && (
                                                <div className="absolute inset-x-0 bottom-0 bg-black/50 text-[8px] text-white py-0.5 px-1 truncate text-center font-medium">
                                                  {order.shipping.cardPhotoName}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Products detail list */}
                                  <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs">
                                    <h4 className="text-[10px] uppercase font-extrabold text-slate-400 mb-2">Artículos Incluidos</h4>
                                    <div className="divide-y divide-slate-100">
                                      {order.items.map((item) => (
                                        <div key={item.product.id} className="py-2 flex items-center justify-between text-xs font-sans">
                                          <div className="flex items-center gap-2">
                                            <span className="bg-peach-light text-earth-brown px-1.5 py-0.5 rounded font-mono font-bold">x{item.quantity}</span>
                                            <span className="font-semibold text-slate-805">{item.product.name}</span>
                                          </div>
                                          <span className="text-slate-500 font-bold">${(item.product.price * item.quantity).toLocaleString('es-CO')}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                {/* Right Side Box: Payment validation and administrative actions */}
                                <div className="md:col-span-4 flex flex-col justify-between space-y-4">
                                  {/* Receipt support */}
                                  <div className="bg-white p-4 rounded-xl border border-slate-100 flex flex-col items-center shadow-xs">
                                    <h4 className="text-[10px] uppercase font-extrabold text-slate-400 mb-2 self-start font-bold">Soporte de Transferencia</h4>
                                    {order.paymentReceiptUrl ? (
                                      <div className="relative group overflow-hidden rounded-lg border border-slate-200">
                                        <img
                                          src={order.paymentReceiptUrl}
                                          alt="Comprobante"
                                          className="w-full max-h-[160px] object-cover cursor-pointer transition transform hover:scale-105"
                                          onClick={() => setZoomReceiptUrl(order.paymentReceiptUrl)}
                                          referrerPolicy="no-referrer"
                                        />
                                        <div
                                          className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                                          onClick={() => setZoomReceiptUrl(order.paymentReceiptUrl)}
                                        >
                                          <span className="text-[10px] font-bold text-white bg-slate-900/80 px-2.5 py-1 rounded-full flex items-center gap-1">
                                            <Eye size={12} /> Ampliar Comprobante
                                          </span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-center py-6 text-slate-400 w-full">
                                        <ImageIcon size={32} className="mx-auto text-slate-300" />
                                        <p className="text-xs mt-1">Sin comprobante asignado</p>
                                      </div>
                                    )}
                                  </div>

                                  {/* Quick administrative buttons */}
                                  <div className="bg-white p-3 rounded-xl border border-slate-100 space-y-2 shadow-xs">
                                    <h5 className="text-[9px] uppercase font-bold text-slate-400 text-center select-none">Acciones Logísticas</h5>
                                    
                                    <button
                                      onClick={() => {
                                        onUpdateOrderStatus(order.id, 'En Preparación');
                                        alert(`Orden ${order.id} aprobada con éxito.`);
                                      }}
                                      disabled={order.status === 'En Preparación' || order.status === 'En Reparto' || order.status === 'Entregado'}
                                      className="w-full bg-olive-dark hover:bg-earth-brown disabled:opacity-50 text-white font-semibold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                                    >
                                      <CheckCircle2 size={13} />
                                      Aprobar Pedido (En Preparación)
                                    </button>

                                    {/* Motorizado dropdown selector (Asignación o reasignación) */}
                                    <div className="bg-slate-50 p-2 border border-slate-200 rounded-xl space-y-1">
                                      <label className="text-[9px] font-extrabold text-slate-550 uppercase block flex items-center gap-1">
                                        <Truck size={10} className="text-blue-600" />
                                        Asignar/Reasignar Domiciliario
                                      </label>
                                      <select
                                        value={order.assignedDomiUsername || ''}
                                        onChange={(e) => {
                                          const selectedVal = e.target.value;
                                          const nextStatus = order.status === 'En Validación' || order.status === 'En Preparación' || order.status === 'En Vali' ? 'En Reparto' : order.status;
                                          const selectedDomi = systemUsers.find(u => u.username === selectedVal);
                                          onUpdateOrderStatus(order.id, nextStatus, undefined, selectedVal, selectedDomi ? { name: selectedDomi.name, phone: selectedDomi.phone } : undefined);
                                          const label = selectedDomi?.name || 'Ninguno';
                                          alert(`Asignado con éxito a ${label}.`);
                                        }}
                                        className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-sage-primary"
                                      >
                                        <option value="">-- Sin Asignar / Cancelar --</option>
                                        {systemUsers.filter(u => u.role === 'domiciliario').map(domi => (
                                          <option key={domi.username} value={domi.username}>
                                            🛵 {domi.name} ({domi.id})
                                          </option>
                                        ))}
                                      </select>
                                      {order.assignedDomiUsername && (
                                        <div className="text-[9px] font-semibold text-emerald-700 flex items-center gap-0.5">
                                          <Check size={10} /> Asignado a {systemUsers.find(u => u.username === order.assignedDomiUsername)?.name || order.assignedDomiUsername}
                                        </div>
                                      )}
                                    </div>

                                    <button
                                      onClick={() => {
                                        onUpdateOrderStatus(order.id, 'En Reparto');
                                        alert(`Pedido ${order.id} despachado En Reparto.`);
                                      }}
                                      disabled={order.status === 'En Reparto' || order.status === 'Entregado'}
                                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                                    >
                                      <Truck size={13} />
                                      Despachar a Reparto
                                    </button>

                                    <button
                                      onClick={() => {
                                        onUpdateOrderStatus(order.id, 'Rechazado');
                                        alert(`Orden ${order.id} rechazada.`);
                                      }}
                                      disabled={order.status === 'Rechazado' || order.status === 'Entregado'}
                                      className="w-full bg-red-600 hover:bg-red-750 disabled:opacity-50 text-white font-semibold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                                    >
                                      <XCircle size={13} />
                                      Rechazar Transacción
                                    </button>
                                  </div>

                                  {/* Delivery Evidence */}
                                  {order.deliveryPhotoUrl && (
                                    <div className="bg-green-50/50 p-3 rounded-xl border border-green-100 flex flex-col items-center shadow-xs">
                                      <h5 className="text-[9px] uppercase font-extrabold text-green-700 mb-1.5 self-start flex items-center gap-1">
                                        ✓ Soporte de Domicilio
                                      </h5>
                                      <div className="relative group overflow-hidden rounded-lg border border-slate-250 w-full">
                                        <img
                                          src={order.deliveryPhotoUrl}
                                          alt="Prueba de entrega"
                                          className="w-full h-24 object-cover cursor-zoom-in"
                                          onClick={() => setZoomReceiptUrl(order.deliveryPhotoUrl || null)}
                                        />
                                      </div>
                                      {order.deliveredAt && (
                                        <span className="text-[9px] text-slate-500 font-mono mt-1.5 block self-start">
                                          <strong>Entregado:</strong> {new Date(order.deliveredAt).toLocaleString('es-CO')}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* CARDS ALTERNATIVE LOGIC */
            <div className="space-y-3 font-sans">
              {filteredAndSortedOrders.map((order) => {
                const isExpanded = expandedOrderID === order.id;
                const sub = order.subtotal || order.items.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
                const fee = typeof order.shippingFee === 'number' ? order.shippingFee : Math.max(0, order.total - sub);
                return (
                  <div
                    key={order.id}
                    id={`admin-order-card-${order.id}`}
                    className="bg-white border rounded-2xl overflow-hidden shadow-xs border-slate-100 transition-all"
                  >
                    {/* Header Row summary */}
                    <div
                      onClick={() => toggleOrderExpand(order.id)}
                      className="p-4 sm:p-5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 text-sm sm:text-base">{order.id}</span>
                          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            order.status === 'En Preparación'
                              ? 'bg-indigo-100 text-indigo-805'
                              : order.status === 'En Reparto'
                              ? 'bg-blue-100 text-blue-805'
                              : order.status === 'Entregado'
                              ? 'bg-teal-100 text-teal-800'
                              : order.status === 'Rechazado'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          Comprador: <strong>{order.shipping.buyerName}</strong> • {order.items.length} productos
                        </p>
                      </div>

                      <div className="flex items-center gap-6 text-right sm:text-left">
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase font-semibold text-center sm:text-left">Entrega</span>
                          <span className="text-xs sm:text-sm font-bold text-slate-700 block mt-1">{order.shipping.fechaEntrega}</span>
                        </div>
                        <div className="text-right sm:text-left">
                          <span className="text-[10px] text-slate-400 block uppercase font-semibold">Desglose de Pago</span>
                          <div className="text-[10px] text-slate-500 whitespace-nowrap">Prod: <span className="font-semibold text-slate-700">${sub.toLocaleString('es-CO')}</span></div>
                          <div className="text-[10px] text-slate-500 whitespace-nowrap">Envío: <span className="font-semibold text-slate-700">${fee.toLocaleString('es-CO')}</span></div>
                          <span className="text-xs sm:text-sm font-bold text-sage-primary block mt-0.5">${order.total.toLocaleString('es-CO')}</span>
                        </div>
                        {isExpanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
                      </div>
                    </div>

                    {/* Expandable Details Container */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-5 grid grid-cols-1 md:grid-cols-12 gap-6 animate-fadeIn">
                        {/* Column 1: Info (Shipping details, items, card message) */}
                        <div className="md:col-span-8 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white p-4 rounded-xl border border-slate-100 shadow-xs animate-fadeIn">
                            <div>
                              <h4 className="text-xs uppercase font-extrabold text-slate-400 mb-1 font-bold">Destinatario</h4>
                              <p className="text-sm font-bold text-slate-800">{order.shipping.recipientName}</p>
                              <p className="text-xs text-slate-500">Cel: {order.shipping.recipientPhone}</p>
                            </div>
                            <div>
                              <h4 className="text-xs uppercase font-extrabold text-slate-400 mb-1 font-bold">Comprador</h4>
                              <p className="text-sm font-bold text-slate-800">{order.shipping.buyerName}</p>
                              <p className="text-xs text-slate-500">Cel: {order.shipping.buyerPhone}</p>
                            </div>
                          </div>

                          <div className="bg-white p-4 rounded-xl border border-slate-100 space-y-3 shadow-xs">
                            <h4 className="text-xs uppercase font-extrabold text-slate-400 font-bold">Dirección de Envío</h4>
                            <div className="text-xs text-slate-700 grid grid-cols-2 gap-2 font-mono font-medium">
                              <p><strong>Municipio:</strong> {order.shipping.municipio}</p>
                              <p><strong>Localidad/Zona:</strong> {order.shipping.localidad}</p>
                              <p><strong>Barrio:</strong> {order.shipping.barrio}</p>
                              <p className="col-span-2"><strong>Dirección:</strong> {order.shipping.direccionDetallada}</p>
                              {order.shipping.indicacionesAdicionales && (
                                <p className="col-span-2 text-slate-500"><strong>Guía:</strong> {order.shipping.indicacionesAdicionales}</p>
                              )}
                              {order.shipping.horaEntrega && (
                                <p className="col-span-2 text-rose-700 font-bold"><strong>⏰ Hora de Entrega Programada:</strong> {order.shipping.horaEntrega}</p>
                              )}
                            </div>

                            {/* Geolocalization / Coordenadas details */}
                            <div className="border bg-slate-50 border-slate-200 p-2.5 rounded-xl space-y-1.5 font-sans">
                              <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-500">
                                <span>📍 Geolocalización Satelital:</span>
                              </div>
                              {order.shipping.locationLatLng ? (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10.5px] text-green-800 font-mono font-semibold">
                                    Fijado (Lat: {order.shipping.locationLatLng.lat.toFixed(5)}, Lng: {order.shipping.locationLatLng.lng.toFixed(5)})
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10.5px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-250 font-medium animate-pulse">
                                    ⚠️ Sin geolocalización de cliente
                                  </span>
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setOrderToEditCoords(order);
                                  setAdminTempCoords(order.shipping.locationLatLng || null);
                                }}
                                className="w-full h-8 flex items-center justify-center gap-1.5 bg-sage-primary hover:bg-slate-800 text-white text-[11px] font-bold px-3 rounded-lg transition-all active:scale-95 cursor-pointer shadow-3xs"
                              >
                                <MapPin size={12} />
                                {order.shipping.locationLatLng ? "Ajustar Coordenadas Satelitales" : "Asignar Coordenadas Satelitales"}
                              </button>
                            </div>
                          </div>

                          <div className="bg-white p-4 rounded-xl border border-slate-100 space-y-2 shadow-xs">
                            <h4 className="text-xs uppercase font-extrabold text-slate-400 font-sans font-bold">Dedicatoria para Tarjeta</h4>
                            <p className="text-xs italic bg-slate-50 p-2.5 rounded-lg text-slate-700 border-l-2 border-sage-primary">
                              "{order.shipping.mensajeTarjeta}"
                            </p>
                            {((order.shipping.cardPhotos && order.shipping.cardPhotos.length > 0) || order.shipping.cardPhotoUrl) && (
                                      <div className="mt-2.5 space-y-1.5 font-sans">
                                        <span className="text-[10px] uppercase font-semibold text-slate-500 block text-left">
                                          {order.shipping.cardPhotos && order.shipping.cardPhotos.length > 1 ? `📸 Fotos Adjuntas (${order.shipping.cardPhotos.length}):` : '📸 Foto Tarjeta Adjunta:'}
                                        </span>
                                        <div className="flex flex-wrap gap-2.5 justify-start">
                                          {order.shipping.cardPhotos && order.shipping.cardPhotos.length > 0 ? (
                                            order.shipping.cardPhotos.map((photo, pIdx) => (
                                              <div key={pIdx} className="relative group overflow-hidden rounded-lg border border-slate-200 w-24 h-24 bg-slate-50">
                                                <img
                                                  src={photo.url}
                                                  alt={`Foto tarjeta ${pIdx + 1}`}
                                                  className="w-full h-full object-cover cursor-pointer transition transform hover:scale-105"
                                                  onClick={() => setZoomReceiptUrl(photo.url)}
                                                  referrerPolicy="no-referrer"
                                                />
                                                <div className="absolute inset-x-0 bottom-0 bg-black/50 text-[8px] text-white py-0.5 px-1 truncate text-center font-medium">
                                                  {photo.name}
                                                </div>
                                              </div>
                                            ))
                                          ) : (
                                            <div className="relative group overflow-hidden rounded-lg border border-slate-200 w-24 h-24 bg-slate-50">
                                              <img
                                                src={order.shipping.cardPhotoUrl}
                                                alt="Foto tarjeta"
                                                className="w-full h-full object-cover cursor-pointer transition transform hover:scale-105"
                                                onClick={() => setZoomReceiptUrl(order.shipping.cardPhotoUrl!)}
                                                referrerPolicy="no-referrer"
                                              />
                                              {order.shipping.cardPhotoName && (
                                                <div className="absolute inset-x-0 bottom-0 bg-black/50 text-[8px] text-white py-0.5 px-1 truncate text-center font-medium">
                                                  {order.shipping.cardPhotoName}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                          </div>

                          {/* Items included */}
                          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-xs font-sans">
                            <h4 className="text-xs uppercase font-extrabold text-slate-400 mb-2 font-bold font-sans">Detalle de Productos</h4>
                            <div className="divide-y divide-slate-100 font-medium">
                              {order.items.map((item) => (
                                <div key={item.product.id} className="py-2.5 flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-2 font-sans">
                                    <span className="bg-peach-light text-earth-brown px-1.5 py-0.5 rounded font-mono font-bold">x{item.quantity}</span>
                                    <span className="font-semibold text-slate-800">{item.product.name}</span>
                                  </div>
                                  <span className="text-slate-500 font-bold">${(item.product.price * item.quantity).toLocaleString('es-CO')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Column 2: Comprobante & Actions */}
                        <div className="md:col-span-4 flex flex-col justify-between space-y-4 font-sans">
                          <div className="bg-white p-4 rounded-xl border border-slate-100/80 flex flex-col items-center shadow-xs">
                            <h4 className="text-xs uppercase font-extrabold text-slate-400 mb-2 self-start font-bold">Soporte de Transferencia</h4>
                            {order.paymentReceiptUrl ? (
                              <div className="relative group overflow-hidden rounded-lg border border-slate-200">
                                <img
                                  src={order.paymentReceiptUrl}
                                  alt="Comprobante"
                                  className="w-full max-h-[160px] object-cover cursor-pointer transition transform hover:scale-105"
                                  onClick={() => setZoomReceiptUrl(order.paymentReceiptUrl)}
                                  referrerPolicy="no-referrer"
                                />
                                <div
                                  className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                                  onClick={() => setZoomReceiptUrl(order.paymentReceiptUrl)}
                                >
                                  <span className="text-[10px] font-bold text-white bg-slate-900/80 px-2.5 py-1 rounded-full flex items-center gap-1">
                                    <Eye size={12} /> Ampliar Recibo
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-6 text-slate-400 w-full">
                                <ImageIcon size={32} className="mx-auto text-slate-300" />
                                <p className="text-xs mt-1">Sin comprobante asignado</p>
                              </div>
                            )}
                          </div>

                          <div className="bg-white p-3 rounded-xl border border-slate-100 space-y-2 shadow-xs">
                            <h5 className="text-[10px] uppercase font-bold text-slate-400 text-center col-span-2 select-none">Acciones Logísticas</h5>
                            <button
                              id={`approve-order-${order.id}`}
                              onClick={() => {
                                onUpdateOrderStatus(order.id, 'En Preparación');
                                alert(`Orden ${order.id} aprobada con éxito.`);
                              }}
                              disabled={order.status === 'En Preparación' || order.status === 'En Reparto' || order.status === 'Entregado'}
                              className="w-full bg-olive-dark hover:bg-earth-brown disabled:opacity-50 text-white font-semibold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                            >
                              <CheckCircle2 size={13} />
                              Aprobar Pedido (En Preparación)
                            </button>

                            {/* Motorizado dropdown selector for card view (Asignación o reasignación) */}
                            <div className="bg-slate-50 p-2 border border-slate-200 rounded-xl space-y-1">
                              <label className="text-[9px] font-extrabold text-slate-550 uppercase block flex items-center gap-1">
                                <Truck size={10} className="text-blue-600" />
                                Asignar/Reasignar Domiciliario
                              </label>
                              <select
                                value={order.assignedDomiUsername || ''}
                                onChange={(e) => {
                                  const selectedVal = e.target.value;
                                  const nextStatus = order.status === 'En Validación' || order.status === 'En Preparación' || order.status === 'En Vali' ? 'En Reparto' : order.status;
                                  const selectedDomi = systemUsers.find(u => u.username === selectedVal);
                                  onUpdateOrderStatus(order.id, nextStatus, undefined, selectedVal, selectedDomi ? { name: selectedDomi.name, phone: selectedDomi.phone } : undefined);
                                  const label = selectedDomi?.name || 'Ninguno';
                                  alert(`Asignado con éxito a ${label}.`);
                                }}
                                className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-sage-primary"
                              >
                                <option value="">-- Sin Asignar / Cancelar --</option>
                                {systemUsers.filter(u => u.role === 'domiciliario').map(domi => (
                                  <option key={domi.username} value={domi.username}>
                                    🛵 {domi.name} ({domi.id})
                                  </option>
                                ))}
                              </select>
                              {order.assignedDomiUsername && (
                                <div className="text-[9px] font-semibold text-emerald-700 flex items-center gap-0.5">
                                  <Check size={10} /> Asignado a {systemUsers.find(u => u.username === order.assignedDomiUsername)?.name || order.assignedDomiUsername}
                                </div>
                              )}
                            </div>

                            <button
                              id={`route-order-${order.id}`}
                              onClick={() => {
                                onUpdateOrderStatus(order.id, 'En Reparto');
                                alert(`Pedido ${order.id} enviado En Reparto.`);
                              }}
                              disabled={order.status === 'En Reparto' || order.status === 'Entregado'}
                              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                            >
                              <Truck size={13} />
                              Despachar a Reparto
                            </button>

                            <button
                              id={`reject-order-${order.id}`}
                              onClick={() => {
                                onUpdateOrderStatus(order.id, 'Rechazado');
                                alert(`Orden ${order.id} rechazada.`);
                              }}
                              disabled={order.status === 'Rechazado' || order.status === 'Entregado'}
                              className="w-full bg-red-600 hover:bg-red-750 disabled:opacity-50 text-white font-semibold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
                            >
                              <XCircle size={13} />
                              Rechazar Pedido
                            </button>
                          </div>

                          {order.deliveryPhotoUrl && (
                            <div className="bg-green-50/50 p-3 rounded-xl border border-green-100 flex flex-col items-center shadow-xs">
                              <h5 className="text-[9px] uppercase font-extrabold text-green-700 mb-1.5 self-start flex items-center gap-1">
                                ✓ Entregado con Soporte
                              </h5>
                              <div className="relative group overflow-hidden rounded-lg border border-slate-200 w-full">
                                <img
                                  src={order.deliveryPhotoUrl}
                                  alt="Prueba de entrega"
                                  className="w-full h-24 object-cover cursor-zoom-in font-medium"
                                  onClick={() => setZoomReceiptUrl(order.deliveryPhotoUrl || null)}
                                />
                              </div>
                              {order.deliveredAt && (
                                <span className="text-[9px] text-slate-500 font-mono mt-1.5 block self-start">
                                  <strong>Hora de entrega:</strong> {new Date(order.deliveredAt).toLocaleString('es-CO')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INVENTORY CRUD */}
      {activeTab === 'inventory' && (
        <div id="admin-inventory-tab" className="space-y-6 animate-fadeIn">
          
          {/* SECTION: CATEGORY DISCOUNTS CONTROL */}
          <div className="bg-slate-50 rounded-3xl border border-slate-200 p-6 space-y-4 font-sans animate-fadeIn">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                🏷️ Central de Descuentos Temporales por Categoría
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Define descuentos temporales para categorías enteras de productos (flores, desayunos, detalles). El sistema aplicará y mostrará estos descuentos de manera instantánea y tachará el precio real en el catálogo de clientes.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['flores', 'desayunos', 'detalles'].map((cat) => {
                const currentDiscount = categoryDiscounts[cat] || 0;
                return (
                  <div key={cat} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex flex-col justify-between space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] font-black uppercase tracking-wider text-[#E07A5F]">
                        {cat === 'flores' ? '🌸 Floristería' : cat === 'desayunos' ? '☕ Desayunadores' : '🎁 Detalles de Regalo'}
                      </span>
                      <span className="bg-rose-50 text-rose-700 font-extrabold text-[10px] px-2 py-0.5 rounded-full border border-rose-100">
                        {currentDiscount}% OFF
                      </span>
                    </div>

                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="90"
                          step="5"
                          value={currentDiscount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            if (onUpdateCategoryDiscounts) {
                              onUpdateCategoryDiscounts({
                                ...categoryDiscounts,
                                [cat]: val
                              });
                            }
                          }}
                          className="w-full accent-rose-600 h-1 bg-slate-100 rounded-lg cursor-pointer"
                        />
                        <span className="text-[11px] font-bold text-slate-700 w-8 text-right">{currentDiscount}%</span>
                      </div>

                      <div className="flex gap-1 pt-1">
                        {[0, 10, 15, 20, 30].map((val) => (
                          <button
                            key={val}
                            onClick={() => {
                              if (onUpdateCategoryDiscounts) {
                                onUpdateCategoryDiscounts({
                                  ...categoryDiscounts,
                                  [cat]: val
                                });
                              }
                            }}
                            className={`flex-1 text-[9px] font-extrabold py-1 rounded-md border transition-all cursor-pointer ${
                              currentDiscount === val
                                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                                : 'bg-slate-50 text-slate-600 border-slate-150 hover:bg-slate-100'
                            }`}
                          >
                            {val}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Crea nuevos desayunos sorpresa, edita precios de arreglos florales o elimina detalles según disponibilidad.
            </p>
            <button
              onClick={handleOpenAddModal}
              id="admin-add-product"
              className="bg-sage-primary hover:bg-[#5C614E] text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <Plus size={14} />
              Agregar Producto
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                    <th className="py-3 px-4">Producto</th>
                    <th className="py-3 px-4">Categoría</th>
                    <th className="py-3 px-4">Precio (COP)</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-3.5 px-4 flex items-center gap-3">
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-10 h-10 object-cover rounded-lg border"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <span className="font-bold text-slate-800 text-sm block">{p.name}</span>
                          <span className="text-[10px] text-slate-400 line-clamp-1 max-w-[280px]">{p.description}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 uppercase font-semibold text-[10px] tracking-wider text-slate-500">
                        {p.category}
                      </td>
                      <td className="py-3.5 px-4">
                        {p.discountPercentage && p.discountPercentage > 0 ? (
                          <div className="flex flex-col">
                            <span className="text-[10px] line-through text-slate-400 font-bold">${p.price.toLocaleString('es-CO')}</span>
                            <div className="flex items-center gap-1">
                              <span className="font-extrabold text-xs text-rose-600">
                                ${Math.round(p.price * (1 - p.discountPercentage / 100)).toLocaleString('es-CO')}
                              </span>
                              <span className="bg-rose-50 text-[8px] text-rose-700 font-black px-1.5 py-0.5 rounded-full border border-rose-150">-{p.discountPercentage}%</span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800">${p.price.toLocaleString('es-CO')}</span>
                            {categoryDiscounts[p.category] > 0 && (
                              <span className="text-[8px] text-[#E07A5F] font-black tracking-wider uppercase mt-0.5 bg-rose-50 border border-rose-100 px-1 py-0.2 rounded-full self-start inline-block">-{categoryDiscounts[p.category]}% CAT</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {p.featured ? (
                          <span className="bg-peach-light text-earth-brown text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-sage-light/10">Destacado</span>
                        ) : (
                          <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2.5 py-0.5 rounded-full">Catálogo</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            id={`edit-prod-${p.id}`}
                            onClick={() => handleOpenEditModal(p)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition"
                            title="Editar Atributos"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            id={`delete-prod-${p.id}`}
                            onClick={() => {
                              setProductToDelete(p);
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 text-red-500 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                            title="Eliminar de catálogo"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SYSTEM USERS MANAGEMENT */}
      {activeTab === 'users' && (
        <div id="admin-users-tab" className="space-y-4 animate-fadeIn">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                👥 Módulo de Gestión Interna de Usuarios
              </h3>
              <p className="text-xs text-slate-505 mt-1">
                Crea administradores o domiciliarios autónomos. Cada domiciliario registrado visualizará únicamente sus pedidos asignados de manera independiente.
              </p>
            </div>
            <button
              onClick={() => {
                setNewUserCedula('');
                setNewUserUsername('');
                setNewUserPassword('');
                setNewUserName('');
                setNewUserPhone('');
                setNewUserEmail('');
                setNewUserRole('domiciliario');
                setShowUserModal(true);
              }}
              className="bg-sage-primary hover:bg-[#5C614E] text-white font-semibold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition shadow-xs cursor-pointer inline-flex justify-center"
            >
              <Plus size={14} />
              Crear Nuevo Usuario
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-xs">
            <div className="overflow-x-auto font-sans">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100">
                    <th className="py-4 px-5">Nombre Completo</th>
                    <th className="py-4 px-5">Usuario / Cédula</th>
                    <th className="py-4 px-5">Rol / Privilegios</th>
                    <th className="py-4 px-5">Contacto</th>
                    <th className="py-4 px-5 text-right">Fórmula de Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {systemUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-4 px-5 font-bold text-slate-900">{user.name}</td>
                      <td className="py-4 px-5 font-mono text-xs">
                        <div className="space-y-0.5">
                          <div><span className="text-slate-400">Cédula:</span> {user.id}</div>
                          <div><span className="text-slate-400">Usuario y Clave:</span> {user.username}</div>
                        </div>
                      </td>
                      <td className="py-4 px-5">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${getRoleBadgeClass(user.role)}`}>{getRoleLabel(user.role)}</span>
                      </td>
                      <td className="py-4 px-5">
                        <div className="space-y-0.5 text-slate-600">
                          <div>📞 {user.phone}</div>
                          <div className="text-slate-400 text-[10px]">{user.email}</div>
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              if (!canAssignAdminRole && user.role === 'admin') {
                                alert("El rol supervisor no puede modificar usuarios administradores.");
                                return;
                              }
                              setEditingUser(user);
                              setNewUserCedula(user.id);
                              setNewUserUsername(user.username);
                              setNewUserPassword(user.password);
                              setNewUserName(user.name);
                              setNewUserPhone(user.phone);
                              setNewUserEmail(user.email);
                              setNewUserRole(user.role);
                              setShowUserModal(true);
                            }}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-amber-200 transition cursor-pointer"
                            title="Editar Datos del Usuario"
                          >
                            ✏️ Editar Datos
                          </button>

                          <button
                            onClick={() => {
                              if (!canAssignAdminRole && user.role === 'admin') {
                                alert("El rol supervisor no puede cambiar la clave de un administrador.");
                                return;
                              }
                              setChangingPasswordUser(user);
                              setNewPasswordValue(user.password);
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-indigo-100 transition cursor-pointer"
                            title="Actualizar Clave"
                          >
                            🔑 Cambiar Contraseña
                          </button>
                          
                          {/* Protect critical or current accounts from elimination */}
                          {user.username !== 'admin' && user.id !== currentUser?.id && (canAssignAdminRole || user.role !== 'admin') && (
                            <button
                              onClick={() => {
                                setDeletingUser(user);
                              }}
                              className="text-red-500 hover:bg-red-50 hover:text-red-750 p-1.5 rounded-lg border border-transparent transition cursor-pointer"
                              title="Dar de baja"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CRUD Product Modal (Create & Update) */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-lg w-full border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="bg-sage-primary text-white px-6 py-4 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-base font-sans">
                {editingProduct ? 'Editar Producto del Catálogo' : 'Agregar Nuevo Producto'}
              </h3>
              <button onClick={() => setShowProductModal(false)} className="text-white/80 hover:text-white font-bold text-sm cursor-pointer">✖</button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 space-y-4 text-xs font-sans flex-1 min-h-0 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-600 mb-1">Nombre del Producto *</label>
                  <input
                    type="text"
                    required
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    placeholder="Ej. Desayuno Sensación de Amor"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-primary transition"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Precio (COP) *</label>
                  <input
                    type="number"
                    required
                    min={100}
                    value={prodPrice}
                    onChange={(e) => setProdPrice(Number(e.target.value))}
                    placeholder="Ej. 120000"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-primary transition"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Categoría del Catálogo *</label>
                  <select
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-primary transition"
                  >
                    <option value="desayunos">Desayunos Sorpresa</option>
                    <option value="flores">Floristería y Arreglos</option>
                    <option value="detalles">Cajas de Detalles</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <div className="bg-rose-50/50 rounded-2xl p-4 border border-rose-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <label className="block font-bold text-rose-800 text-xs uppercase tracking-wider">Descuento Individual del Producto (%)</label>
                      <p className="text-[10px] text-rose-600/80 mt-0.5">Aplica un descuento temporal del 0% al 90% exclusivo para este artículo.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="90"
                        value={prodDiscountPercentage}
                        onChange={(e) => setProdDiscountPercentage(Math.max(0, Math.min(90, parseInt(e.target.value) || 0)))}
                        className="w-16 bg-white border border-rose-200 rounded-xl px-2.5 py-1.5 text-center text-xs font-black text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 animate-pulse"
                      />
                      <span className="font-bold text-rose-700 text-xs">% OFF</span>
                    </div>
                  </div>
                </div>

                <div className="col-span-2 space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                    <label className="block font-bold text-slate-700">Imagen del Producto *</label>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">URL o Archivo Local</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Opción A: Ingresar enlace (URL) público de la imagen</label>
                    <input
                      type="url"
                      value={prodImage.startsWith('data:') ? '' : prodImage}
                      onChange={(e) => setProdImage(e.target.value)}
                      placeholder="https://images.unsplash.com/photo-..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-primary transition font-mono text-[10px]"
                    />
                  </div>

                  <div className="bg-slate-50/50 p-3 rounded-2xl border border-dashed border-slate-200">
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Opción B: Subir archivo de imagen desde el Escritorio</label>
                    <div className="flex items-center gap-3 mt-1.5 font-sans">
                      <label className="cursor-pointer bg-white border border-slate-250 hover:bg-slate-50 text-slate-700 font-semibold text-[11px] px-3.5 py-2 rounded-xl transition inline-block shadow-2xs">
                        📎 Buscar en la Computadora
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = async (event) => {
                                if (event.target?.result) {
                                  try {
                                    const compressed = await compressImageBase64(event.target.result as string, 800, 800, 0.4);
                                    setProdImage(compressed);
                                  } catch (err) {
                                    setProdImage(event.target.result as string);
                                  }
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                      {prodImage.startsWith('data:') && (
                        <span className="text-[10px] text-green-700 font-bold bg-green-55/40 border border-green-200/60 px-2.5 py-1 rounded-full flex items-center gap-1">
                          ✓ Cargado desde Escritorio
                        </span>
                      )}
                    </div>
                  </div>

                  {prodImage && (
                    <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-2xl border border-slate-100">
                      <img
                        src={prodImage}
                        alt="Vista Previa"
                        className="w-12 h-12 object-cover rounded-xl border border-slate-200"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=120";
                        }}
                      />
                      <div className="flex-1 overflow-hidden">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-tight">VISTA PREVIA DE IMAGEN</span>
                        <span className="text-[10px] text-slate-500 truncate block max-w-[280px]">
                          {prodImage.startsWith('data:') ? 'Imagen cargada localmente (Base64)' : prodImage}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProdImage('')}
                        className="text-red-500 hover:text-red-700 font-bold text-xs p-2 transition cursor-pointer"
                        title="Eliminar imagen actual"
                      >
                        Limpiar
                      </button>
                    </div>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="block font-bold text-slate-600 mb-1">Descripción Detallada (Incluye componentes de alimentos o flores) *</label>
                  <textarea
                    required
                    rows={4}
                    value={prodDescription}
                    onChange={(e) => setProdDescription(e.target.value)}
                    placeholder="Describe los componentes del desayuno sorpresa o tipos de flores..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-primary transition"
                  />
                </div>

                <div className="col-span-2 flex items-center gap-2 mb-2 pb-2">
                  <input
                    type="checkbox"
                    id="checkbox-featured"
                    checked={prodFeatured}
                    onChange={(e) => setProdFeatured(e.target.checked)}
                    className="w-4 h-4 text-sage-primary focus:ring-sage-primary border-slate-300 rounded-sm shrink-0"
                  />
                  <label htmlFor="checkbox-featured" className="font-bold text-slate-700">Destacar en el carrusel de la página de inicio</label>
                </div>
              </div>

              <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-white border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="admin-product-save"
                  className="bg-sage-primary hover:bg-[#5C614E] text-white px-5 py-2 rounded-xl text-sm font-semibold transition shadow-xs cursor-pointer"
                >
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full-Screen Receipt Image modal */}
      {zoomReceiptUrl && (
        <div
          onClick={() => setZoomReceiptUrl(null)}
          className="fixed inset-0 bg-black/95 z-55 flex items-center justify-center p-4 backdrop-blur-md cursor-zoom-out animate-fadeIn"
        >
          <div className="max-w-3xl max-h-[90vh] relative">
            <p className="text-white text-xs text-center mb-2 font-sans bg-black/60 py-1.5 px-3 rounded-full inline-block">Click en cualquier lado para cerrar</p>
            <img
              src={zoomReceiptUrl}
              alt="Ampliado"
              className="max-w-full max-h-[80vh] object-contain rounded-xl border border-white/20 shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}

      {/* SUPABASE EXPORT MODAL */}
      {showSupabaseModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 animate-scaleUp text-slate-800">
            
            {/* Header */}
            <div className="bg-sky-900 text-white p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-sky-800 rounded-2xl text-sky-200">
                  <Database size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Consola de Exportación a Supabase / PostgreSQL</h3>
                  <p className="text-xs text-sky-200">Migra y sincroniza fácilmente tu base de datos y pedidos en la nube.</p>
                </div>
              </div>
              <button
                onClick={() => setShowSupabaseModal(false)}
                className="text-white/80 hover:text-white hover:bg-sky-800 p-2 rounded-xl transition cursor-pointer text-sm"
              >
                ✕ Cerrar
              </button>
            </div>

            {/* Step Guides / Instructions */}
            <div className="bg-sky-50 border-b border-sky-100 px-6 py-4">
              <span className="text-[10px] font-bold text-sky-800 uppercase tracking-wider block mb-1">Guía Rápida de Integración</span>
              <ol className="text-xs text-sky-900 space-y-1 list-decimal list-inside font-medium">
                <li>Crea un proyecto gratis en <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline font-bold hover:text-sky-950">Supabase.com</a>.</li>
                <li>Ve a la pestaña <strong>SQL Editor</strong> en Supabase, pega el <strong>Script de Creación (DDL)</strong> y ejecútalo.</li>
                <li>Pega el <strong>Script de Inserción</strong> para cargar las órdenes actuales o descarga los archivos <strong>CSV</strong> a tu PC.</li>
              </ol>
            </div>

            {/* Navigation Tabs bar inside modal */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-6 font-semibold text-xs py-1">
              <button
                onClick={() => setSupabaseTab('sql_schema')}
                className={`py-3 px-4 border-b-2 transition cursor-pointer ${
                  supabaseTab === 'sql_schema'
                    ? 'border-sky-700 text-sky-800 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                📁 1. Estructura de Tablas (SQL DDL)
              </button>
              <button
                onClick={() => setSupabaseTab('sql_inserts')}
                className={`py-3 px-4 border-b-2 transition cursor-pointer ${
                  supabaseTab === 'sql_inserts'
                    ? 'border-sky-700 text-sky-800 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                ⚡ 2. Script de Datos Dinámicos (SQL DML)
              </button>
              <button
                onClick={() => setSupabaseTab('csv')}
                className={`py-3 px-4 border-b-2 transition cursor-pointer ${
                  supabaseTab === 'csv'
                    ? 'border-sky-700 text-sky-800 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                💾 3. Descarga CSV
              </button>
            </div>

            {/* Context/View panels */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {supabaseTab === 'sql_schema' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 block">Código SQL para crear tablas en Supabase:</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(getSupabaseSqlSchema());
                        setSqlCopySuccess(true);
                        setTimeout(() => setSqlCopySuccess(false), 2500);
                      }}
                      className="bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {sqlCopySuccess ? '✓ ¡Copiado!' : '📋 Copiar Código SQL'}
                    </button>
                  </div>
                  <pre className="bg-slate-900 text-slate-200 text-xs p-4 rounded-xl font-mono overflow-x-auto max-h-[280px] border border-slate-800 select-all leading-relaxed shadow-inner">
                    {getSupabaseSqlSchema()}
                  </pre>
                </div>
              )}

              {supabaseTab === 'sql_inserts' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 block">Script de inserción con órdenes y catálogo actual ({orders.length} pedidos, {products.length} productos):</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generateSupabaseSqlInserts());
                        setSqlCopySuccess(true);
                        setTimeout(() => setSqlCopySuccess(false), 2500);
                      }}
                      className="bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {sqlCopySuccess ? '✓ ¡Copiado!' : '📋 Copiar Código SQL'}
                    </button>
                  </div>
                  <pre className="bg-slate-900 text-slate-200 text-[11px] p-4 rounded-xl font-mono overflow-x-auto max-h-[280px] border border-slate-800 select-all leading-relaxed shadow-inner">
                    {generateSupabaseSqlInserts()}
                  </pre>
                </div>
              )}

              {supabaseTab === 'csv' && (
                <div className="space-y-6">
                  <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-2xl text-yellow-900 text-xs font-medium">
                    💡 <strong>Consejo Supabase:</strong> Si no deseas usar comandos SQL, puedes descargar estos archivos CSV y subirlos arrastrándolos directamente a la interfaz web de Supabase en "Table Editor" -&gt; "New Table" -&gt; "Import data via CSV".
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-slate-150 p-5 rounded-2xl hover:border-sky-500 transition-colors bg-slate-50/50 flex flex-col justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-805">Órdenes de Venta ({orders.length})</h4>
                        <p className="text-xs text-slate-500 mt-1">Archivo CSV formateado para la tabla pedidos.</p>
                      </div>
                      <button
                        onClick={() => downloadCsvForSupabase('orders')}
                        className="mt-4 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 w-full shadow-xs"
                      >
                        📥 Descargar órdenes.csv
                      </button>
                    </div>

                    <div className="border border-slate-150 p-5 rounded-2xl hover:border-sky-500 transition-colors bg-slate-50/50 flex flex-col justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-805 font-semibold">Catálogo de Productos ({products.length})</h4>
                        <p className="text-xs text-slate-500 mt-1">Archivo CSV formateado para la tabla catalogo_productos.</p>
                      </div>
                      <button
                        onClick={() => downloadCsvForSupabase('inventory')}
                        className="mt-4 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs py-2 px-4 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 w-full shadow-xs"
                      >
                        📥 Descargar catálogo.csv
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer buttons of the modal */}
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSupabaseModal(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cerrar Exportador
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 1: CONFIRMACIÓN DE ELIMINACIÓN DE TODAS LAS ÓRDENES */}
      {showBulkDeleteConfirm && canDeleteOrders && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-rose-100 animate-scaleUp text-slate-800">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#590212] to-[#8C0428] text-white p-5 flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider">Advertencia de Administrador</h3>
                <p className="text-[10px] text-rose-200">Acción Crítica e Irreversible</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {bulkDeleteConfirmationStep === 1 ? (
                <>
                  <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                    ¿Estás absolutamente seguro de que deseas eliminar <strong className="text-[#8C0428] font-bold">TODAS las órdenes</strong> registradas en el sistema?
                  </p>
                  <div className="bg-rose-50 border border-rose-100 p-3.5 rounded-2xl text-[11px] text-[#590212] font-medium leading-relaxed">
                    Esta acción es sumamente drástica, borrará el historial completo de ventas, los registros y todos los logs de entrega asociados. No puede deshacerse.
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-bold text-[#590212] leading-relaxed">
                    🚨 ¡CONFIRMACIÓN FINAL REQUERIDA!
                  </p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Se vaciará por completo la base de datos de órdenes activas y archivadas. Por favor, confirma si deseas proceder de forma definitiva.
                  </p>
                </>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowBulkDeleteConfirm(false);
                  setBulkDeleteConfirmationStep(1);
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>

              {bulkDeleteConfirmationStep === 1 ? (
                <button
                  type="button"
                  onClick={() => setBulkDeleteConfirmationStep(2)}
                  className="bg-[#8C0428] hover:bg-[#590212] text-white text-xs font-bold px-5 py-2 rounded-xl transition cursor-pointer"
                >
                  Siguiente paso ➔
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteAllOrders();
                    setShowBulkDeleteConfirm(false);
                    setBulkDeleteConfirmationStep(1);
                  }}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-5 py-2 rounded-xl transition cursor-pointer shadow-sm animate-pulse"
                >
                  Confirmar Eliminación Total
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRMACIÓN DE ELIMINACIÓN DE PRODUCTO INDIVIDUAL */}
      {productToDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-100 animate-scaleUp text-slate-800">
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center gap-2.5">
              <span className="text-xl">🗑️</span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider">Confirmar Eliminación</h3>
                <p className="text-[10px] text-slate-400">Modificación de Catálogo</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-3 text-center sm:text-left">
              {productToDelete.image && (
                <div className="flex justify-center mb-3">
                  <img 
                    src={productToDelete.image} 
                    alt={productToDelete.name} 
                    className="w-16 h-16 object-cover rounded-xl border border-slate-100 shadow-xs"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de eliminar <strong className="text-slate-900 font-extrabold">"{productToDelete.name}"</strong> del catálogo virtual?
              </p>
              <p className="text-[11px] text-[#8C0428] bg-rose-50 border border-rose-100 p-2.5 rounded-xl font-medium">
                Esta acción es irreversible y retirará el artículo de la tienda de forma inmediata.
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="bg-slate-50 px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                No, mantener
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProduct(productToDelete.id);
                  setProductToDelete(null);
                }}
                className="bg-[#8C0428] hover:bg-[#590212] text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer shadow-xs"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CLIENT-SAFE: CONFIRMACIÓN DE DE BAJA DE COLABORADOR */}
      {deletingUser && (
        <div id="delete-user-modal" className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-100 animate-scaleUp text-slate-800">
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center gap-2.5">
              <span className="text-xl">👤</span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider">Dar de Baja Colaborador</h3>
                <p className="text-[10px] text-slate-400 font-bold">Control de Acceso de Personal</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-3 text-center sm:text-left">
              <p className="text-xs text-slate-600 leading-relaxed">
                ¿Estás seguro de que deseas eliminar permanentemente al usuario <strong className="text-slate-900 font-extrabold">"{deletingUser.name}"</strong>?
              </p>
              <p className="text-[11px] text-[#8C0428] bg-rose-50 border border-rose-100 p-2.5 rounded-xl font-medium">
                Esta acción revocará su acceso al panel de control y al módulo de entregas logísticas de forma irreversible.
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="bg-slate-50 px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-00 text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                No, mantener activo
              </button>
              <button
                type="button"
                onClick={() => {
                  const updated = systemUsers.filter(u => u.id !== deletingUser.id);
                  saveSystemUsers(updated);
                  setDeletingUser(null);
                  alert("✅ Colaborador eliminado correctamente.");
                }}
                className="bg-[#8C0428] hover:bg-[#590212] text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer shadow-xs"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: AJUSTAR COORDENADAS SATELITALES DESDE EL ADMINISTRADOR */}
      {orderToEditCoords && (
        <div id="admin-map-edit-modal" className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs font-sans text-slate-800">
          <div className="bg-white rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-100 animate-scaleUp">
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📍</span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider">Ajustar Georreferenciación</h3>
                  <p className="text-[10px] text-slate-400">Pedido #{orderToEditCoords.id} - {orderToEditCoords.shipping.recipientName}</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  setOrderToEditCoords(null);
                  setAdminTempCoords(null);
                }} 
                className="text-white hover:text-slate-300 font-bold font-sans cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl text-[11px] text-slate-600 leading-normal">
                <p><strong>Dirección Reportada:</strong> {orderToEditCoords.shipping.direccionDetallada}, {orderToEditCoords.shipping.barrio}, {orderToEditCoords.shipping.localidad} ({orderToEditCoords.shipping.municipio})</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {orderToEditCoords.shipping.locationLatLng 
                    ? `📍 Coordenadas actuales del Cliente: Lat ${orderToEditCoords.shipping.locationLatLng.lat.toFixed(5)}, Lng ${orderToEditCoords.shipping.locationLatLng.lng.toFixed(5)}`
                    : `⚠️ El cliente NO especificó un punto en el mapa. Selecciona la posición exacta a continuación.`}
                </p>
              </div>

              {/* Map Picker Component */}
              <div className="border border-slate-150 rounded-2xl overflow-hidden shadow-xs">
                <MapPicker
                  municipio={orderToEditCoords.shipping.municipio || ''}
                  localidad={orderToEditCoords.shipping.localidad || ''}
                  barrio={orderToEditCoords.shipping.barrio || ''}
                  direccionDetallada={orderToEditCoords.shipping.direccionDetallada || ''}
                  value={adminTempCoords || orderToEditCoords.shipping.locationLatLng}
                  onChange={(latlng) => {
                    setAdminTempCoords(latlng);
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-50 px-5 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setOrderToEditCoords(null);
                  setAdminTempCoords(null);
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer font-sans"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (adminTempCoords && onUpdateOrderCoords) {
                    onUpdateOrderCoords(orderToEditCoords.id, adminTempCoords);
                  }
                  setOrderToEditCoords(null);
                  setAdminTempCoords(null);
                }}
                className="bg-sage-primary hover:bg-slate-800 text-white text-xs font-bold px-5 py-2 rounded-xl transition cursor-pointer shadow-xs font-sans"
              >
                Guardar Coordenadas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: REGISTRAR NUEVO USUARIO */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-md w-full border border-slate-100 animate-scaleUp">
            <div className="bg-sage-primary text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold text-sm tracking-wider uppercase flex items-center gap-1.5 font-sans">
                {editingUser ? '👤 Editar Colaborador / Cuenta' : '👤 Crear Colaborador / Cuenta'}
              </h3>
              <button onClick={() => { setShowUserModal(false); setEditingUser(null); }} className="text-white hover:text-slate-200 font-bold cursor-pointer text-sm">✖</button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="p-6 space-y-4 text-xs">
              <div className="space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cédula o ID (Será el Nombre de Usuario por defecto) *</label>
                  <input
                    type="text"
                    required
                    value={newUserCedula}
                    onChange={(e) => {
                      setNewUserCedula(e.target.value);
                    }}
                    placeholder="Ej. 1016016370"
                    className="w-full bg-slate-55/40 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-sage-primary text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nombre de Usuario para Login (Opcional, en blanco usa Cédula)</label>
                  <input
                    type="text"
                    value={newUserUsername}
                    onChange={(e) => setNewUserUsername(e.target.value)}
                    placeholder="Ej. nicolas.domi"
                    className="w-full bg-slate-55/40 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-sage-primary text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">{editingUser ? 'Contraseña de Acceso *' : 'Contraseña Inicial Otorgada *'}</label>
                  <input
                    type="password"
                    required
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Fija una contraseña de seguridad"
                    className="w-full bg-slate-55/40 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-sage-primary text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nombre Completo del Colaborador *</label>
                  <input
                    type="text"
                    required
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Ej. Nicolás Rodríguez"
                    className="w-full bg-slate-55/40 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-sage-primary text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Número Celular *</label>
                    <input
                      type="text"
                      required
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      placeholder="Ej. 3138005702"
                      className="w-full bg-slate-55/40 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-sage-primary text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Correo Electrónico *</label>
                    <input
                      type="email"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="colaborador@correo.com"
                      className="w-full bg-slate-55/40 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-sage-primary text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Asignación de Rol *</label>
                  <div className={`grid ${canAssignAdminRole ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mt-1`}>
                    <label className={`border rounded-xl p-3 flex flex-col items-center gap-1 cursor-pointer transition ${
                      newUserRole === 'domiciliario' 
                        ? 'border-blue-600 bg-blue-50 text-blue-900 font-extrabold' 
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}>
                      <input
                        type="radio"
                        name="newUserRole"
                        checked={newUserRole === 'domiciliario'}
                        onChange={() => setNewUserRole('domiciliario')}
                        className="sr-only"
                      />
                      <span>🛵 Domiciliario</span>
                      <span className="text-[9px] text-slate-400 font-normal">Reparto Autónomo</span>
                    </label>
                    <label className={`border rounded-xl p-3 flex flex-col items-center gap-1 cursor-pointer transition ${
                      newUserRole === 'supervisor' 
                        ? 'border-amber-600 bg-amber-50 text-amber-900 font-extrabold' 
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}>
                      <input
                        type="radio"
                        name="newUserRole"
                        checked={newUserRole === 'supervisor'}
                        onChange={() => setNewUserRole('supervisor')}
                        className="sr-only"
                      />
                      <span>Supervisor</span>
                      <span className="text-[9px] text-slate-400 font-normal">Sin eliminar ordenes</span>
                    </label>

                    {canAssignAdminRole && (

                    <label className={`border rounded-xl p-3 flex flex-col items-center gap-1 cursor-pointer transition ${
                      newUserRole === 'admin' 
                        ? 'border-rose-600 bg-rose-50 text-rose-900 font-extrabold' 
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}>
                      <input
                        type="radio"
                        name="newUserRole"
                        checked={newUserRole === 'admin'}
                        onChange={() => setNewUserRole('admin')}
                        className="sr-only"
                      />
                      <span>🚨 Administrador</span>
                      <span className="text-[9px] text-slate-400 font-normal">Backoffice Completo</span>
                    </label>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => { setShowUserModal(false); setEditingUser(null); }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-sage-primary hover:bg-[#5C614E] text-white px-5 py-2 rounded-xl text-xs font-semibold transition shadow-xs cursor-pointer"
                >
                  {editingUser ? 'Actualizar Colaborador' : 'Registrar Colaborador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CAMBIO DE CONTRASEÑA DE USUARIO */}
      {changingPasswordUser && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs font-sans">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-sm w-full border border-slate-100 animate-scaleUp text-slate-800">
            <div className="bg-slate-900 text-white px-5 py-4 flex justify-between items-center">
              <h3 className="font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                🔑 Cambiar Clave de Acceso
              </h3>
              <button onClick={() => setChangingPasswordUser(null)} className="text-white hover:text-slate-200 font-bold cursor-pointer text-sm">✖</button>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="p-5 space-y-4 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-150 space-y-1">
                <span className="text-[10px] font-bold text-slate-450 uppercase block select-none">Usuario Seleccionado</span>
                <p className="text-slate-800 font-bold">{changingPasswordUser.name}</p>
                <p className="text-[10px] font-mono text-slate-500">ID/Cédula: {changingPasswordUser.id} | Rol: {getRoleLabel(changingPasswordUser.role)}</p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nueva Contraseña Otorgada *</label>
                <input
                  type="text"
                  required
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  placeholder="Digita la nueva clave del usuario"
                  className="w-full bg-slate-55/40 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-sage-primary text-slate-800 font-mono"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setChangingPasswordUser(null)}
                  className="bg-slate-150 hover:bg-slate-200 text-slate-800 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-slate-900 hover:bg-slate-850 text-white px-5 py-2 rounded-xl text-xs font-semibold transition shadow-xs cursor-pointer"
                >
                  Actualizar Contraseña
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}





