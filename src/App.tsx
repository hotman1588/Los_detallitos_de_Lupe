/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Product, CartItem, Order, OrderStatus } from './types';
import { INITIAL_PRODUCTS } from './initialProducts';
import PromoBanner from './components/PromoBanner';
import ProductCarousel from './components/ProductCarousel';
import CheckoutFlow from './components/CheckoutFlow';
import AdminPanel from './components/AdminPanel';
import OrderTracker from './components/OrderTracker';
import CartSideTab from './components/CartSideTab';
import { ZONA_COBERTURA, SOACHA_HABILITADA } from './divipola';
import { getProductDiscount, getProductEffectivePrice } from './lib/promoUtils';
import { ShoppingCart, Search, Eye, ShoppingBag, ListFilter, CheckCircle, Heart, Truck, Gift, MessageCircle, Flower2, Crown } from 'lucide-react';
import {
  isSupabaseConfigured,
  getProducts,
  saveProduct,
  removeProduct,
  getStaffOrders,
  createOrder,
  updateOrderStatus,
  updateOrderCoords,
  deleteOpenOrders,
  getConfig,
  saveConfig
} from './lib/supabaseClient';

export default function App() {
  // Navigation State: 'catalog' | 'tracker' | 'checkout' | 'admin'
  const [view, setView] = useState<'catalog' | 'tracker' | 'checkout' | 'admin'>('catalog');

  // Estilos de las pestañas del header: la activa resalta con el degradado de marca
  const navActiveClass = 'bg-gradient-to-r from-sage-primary to-sage-light text-white shadow-md shadow-sage-primary/30 ring-2 ring-sage-light/30';
  const navIdleClass = 'text-slate-600 hover:bg-rose-50 hover:text-sage-primary';

  // Products and Orders persistence
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [categoryDiscounts, setCategoryDiscounts] = useState<Record<string, number>>({ desayunos: 0, flores: 0, detalles: 0 });

  // Search and Category Filtering States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Product Preview Modal State
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  
  // Added Product Success Popup State
  const [addedProduct, setAddedProduct] = useState<Product | null>(null);
  // Cambia en cada "agregar" para reiniciar el temporizador aunque sea el mismo producto.
  const [addedTick, setAddedTick] = useState(0);
  const ADDED_POPUP_MS = 3000;

  // La confirmación de "producto agregado" se cierra sola a los 3 segundos.
  useEffect(() => {
    if (!addedProduct) return;
    const timer = window.setTimeout(() => setAddedProduct(null), ADDED_POPUP_MS);
    return () => window.clearTimeout(timer);
  }, [addedTick]);

  // Barra negra de la bandeja: aparece 3 segundos al cerrarse la confirmación
  // (antes quedaría tapada por ella) y luego se oculta; la pestaña lateral queda disponible.
  const [showCartBanner, setShowCartBanner] = useState(false);
  const [cartBannerTick, setCartBannerTick] = useState(0);
  const prevAddedRef = React.useRef<Product | null>(null);
  useEffect(() => {
    if (prevAddedRef.current && !addedProduct) {
      setShowCartBanner(true);
      setCartBannerTick(t => t + 1);
    }
    prevAddedRef.current = addedProduct;
  }, [addedProduct]);
  useEffect(() => {
    if (!showCartBanner) return;
    const timer = window.setTimeout(() => setShowCartBanner(false), ADDED_POPUP_MS);
    return () => window.clearTimeout(timer);
  }, [cartBannerTick]);

  // Exit-intent overlay trigger state
  const [showExitIntent, setShowExitIntent] = useState(false);

  // Status Alerts
  const [notification, setNotification] = useState<string | null>(null);

  // Toast notifier helper
  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Initialize from LocalStorage or Load Defaults / Supabase
  useEffect(() => {
    async function loadData() {
      if (isSupabaseConfigured) {
        // Load products (los pedidos solo se cargan al ingresar al portal)
        const dbProducts = await getProducts();
        setProducts(dbProducts && dbProducts.length > 0 ? dbProducts : INITIAL_PRODUCTS);

        // Load category discounts
        const dbDiscounts = await getConfig('category_discounts', { desayunos: 0, flores: 0, detalles: 0 });
        setCategoryDiscounts(dbDiscounts);
      } else {
        // 1. Products
        const storedProducts = localStorage.getItem('dulce_amanecer_products');
        if (storedProducts) {
          try {
            setProducts(JSON.parse(storedProducts));
          } catch (e) {
            setProducts(INITIAL_PRODUCTS);
          }
        } else {
          setProducts(INITIAL_PRODUCTS);
        }

        // 2. Category Discounts State
        const storedCategoryDiscounts = localStorage.getItem('dulce_amanecer_category_discounts');
        if (storedCategoryDiscounts) {
          try {
            setCategoryDiscounts(JSON.parse(storedCategoryDiscounts));
          } catch (e) {
            setCategoryDiscounts({ desayunos: 0, flores: 0, detalles: 0 });
          }
        }
      }

      // 3. Cart State (always local)
      const storedCart = localStorage.getItem('dulce_amanecer_cart');
      if (storedCart) {
        try {
          setCart(JSON.parse(storedCart));
        } catch (e) {
          setCart([]);
        }
      }
    }

    loadData();
  }, []);

  // Unload alert reminding the user to complete checkout if cart has items
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (cart.length > 0) {
        e.preventDefault();
        e.returnValue = 'Tienes un pedido pendiente en tu bandeja de Los Detallitos de Lupe. Termina de personalizar tu dedicatoria para asegurar la entrega.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [cart]);

  // Exit intent trigger - captures cursor leaving window at top representing exit desire
  useEffect(() => {
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY < 18 && cart.length > 0) {
        const alreadyDismissed = sessionStorage.getItem('dulce_lupe_exit_dismissed');
        if (!alreadyDismissed) {
          setShowExitIntent(true);
        }
      }
    };
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [cart]);

  // Update cart in state & sync to localStorage
  const updateCartState = (newCart: CartItem[]) => {
    setCart(newCart);
    localStorage.setItem('dulce_amanecer_cart', JSON.stringify(newCart));
  };

  const handleUpdateCategoryDiscounts = async (newDiscounts: Record<string, number>) => {
    const previous = categoryDiscounts;
    setCategoryDiscounts(newDiscounts);
    const error = await saveConfig('category_discounts', newDiscounts);
    if (error) {
      setCategoryDiscounts(previous);
      showToast(`⚠️ No se guardaron los descuentos: ${error}`);
    }
  };

  const handleAddToCart = (product: Product) => {
    const existing = cart.find(item => item.product.id === product.id);
    if (existing) {
      updateCartState(
        cart.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      updateCartState([...cart, { product, quantity: 1 }]);
    }
    setAddedProduct(product);
    setAddedTick(t => t + 1);
  };

  const handleUpdateCartQty = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      handleRemoveFromCart(productId);
      return;
    }
    updateCartState(
      cart.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const handleRemoveFromCart = (productId: string) => {
    updateCartState(cart.filter(item => item.product.id !== productId));
    showToast(`🗑️ Producto removido del carrito.`);
  };

  const handleClearCart = () => {
    updateCartState([]);
  };

  // Order Submission (triggered from Checkout Flow). El servidor asigna el número de orden.
  const handleNewOrder = async (newOrder: Omit<Order, 'id'>): Promise<{ id?: string; error?: string }> => {
    return createOrder(newOrder);
  };

  // Pedidos visibles en el portal según el rol de la sesión activa.
  const refreshStaffOrders = async () => {
    const staffOrders = await getStaffOrders();
    setOrders(staffOrders || []);
  };

  const replaceOrder = (updated: Order) => {
    setOrders(prev => prev.map(o => (o.id === updated.id ? updated : o)));
  };

  // ADMIN ACTIONS: Catalog CRUD + Order Approvals
  const handleAddNewProductGroup = async (newProd: Product) => {
    const error = await saveProduct(newProd);
    if (error) {
      showToast(`⚠️ No se pudo crear el producto: ${error}`);
      return;
    }
    setProducts(prev => [newProd, ...prev]);
    showToast(`✨ Producto "${newProd.name}" creado e ingresado al catálogo virtual.`);
  };

  const handleUpdateProductGroup = async (updatedProd: Product) => {
    const error = await saveProduct(updatedProd);
    if (error) {
      showToast(`⚠️ No se guardaron los cambios: ${error}`);
      return;
    }
    setProducts(prev => prev.map(p => p.id === updatedProd.id ? updatedProd : p));
    showToast(`💾 Cambios guardados para "${updatedProd.name}".`);
  };

  const handleDeleteProductGroup = async (id: string) => {
    const error = await removeProduct(id);
    if (error) {
      showToast(`⚠️ No se pudo eliminar el producto: ${error}`);
      return;
    }
    setProducts(prev => prev.filter(p => p.id !== id));
    showToast(`🗑️ Producto eliminado del catálogo.`);
  };

  // assignedDomiUsername: undefined = no cambiar, '' = quitar asignación.
  const handleUpdateOrderStatus = async (
    orderId: string,
    status: OrderStatus,
    deliveryPhotoUrl?: string,
    assignedDomiUsername?: string
  ): Promise<boolean> => {
    const { order, error } = await updateOrderStatus(orderId, status, deliveryPhotoUrl, assignedDomiUsername);
    if (error || !order) {
      alert(`No se pudo actualizar el pedido ${orderId}:

${error || 'Error desconocido.'}`);
      return false;
    }
    replaceOrder(order);
    return true;
  };

  const handleUpdateOrderCoords = async (orderId: string, latlng: { lat: number; lng: number }) => {
    const { order, error } = await updateOrderCoords(orderId, latlng.lat, latlng.lng);
    if (error || !order) {
      showToast(`⚠️ No se actualizó la ubicación: ${error || 'Error desconocido.'}`);
      return;
    }
    replaceOrder(order);
    showToast(`📍 Georreferenciación de orden #${orderId} actualizada con éxito.`);
  };

  const handleDeleteAllOrders = async () => {
    const { count, error } = await deleteOpenOrders();
    if (error) {
      showToast(`⚠️ No se eliminaron los pedidos: ${error}`);
      return;
    }
    await refreshStaffOrders();
    showToast(`🗑️ Se eliminaron ${count} pedidos del sistema.`);
  };

  // Filter Catalog Products
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const cartCount = cart.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="min-h-screen bg-natural-bg flex flex-col font-sans">
      {/* 1. TOP PROMOTIONAL AD BANNER */}
      <PromoBanner />

      {/* 2. HEADER NAVIGATION BAR */}
      <header id="main-header" className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-sage-light/20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Logo Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('catalog')}>
            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-tr from-sage-primary to-sage-light flex items-center justify-center shadow-md ring-1 ring-sage-light/30 transition-transform duration-300 hover:scale-110 hover:rotate-3">
              <Flower2 className="text-white" size={24} strokeWidth={2.2} />
              <Gift className="text-white/90 absolute -bottom-1 -right-1 bg-terracotta rounded-full p-0.5" size={16} strokeWidth={2.4} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 leading-tight font-sans tracking-tight">
                Los Detallitos de Lupe
              </h1>
              <span className="text-[10px] text-terracotta font-bold uppercase tracking-widest block">
                Regalos & Floristería
              </span>
            </div>
          </div>

          {/* Navigation Action tabs */}
          <nav className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setView('catalog')}
              id="nav-catalogo"
              aria-current={view === 'catalog' ? 'page' : undefined}
              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 cursor-pointer ${
                view === 'catalog' ? navActiveClass : navIdleClass
              }`}
            >
              🛍️ Catálogo Virtual
            </button>
            <button
              onClick={() => setView('tracker')}
              id="nav-tracker"
              aria-current={view === 'tracker' ? 'page' : undefined}
              className={`px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 cursor-pointer ${
                view === 'tracker' ? navActiveClass : navIdleClass
              }`}
            >
              📋 Consultar Pedido
            </button>
            <button
              onClick={() => setView('checkout')}
              id="nav-checkout"
              aria-current={view === 'checkout' ? 'page' : undefined}
              className={`px-4.5 py-2 rounded-full text-xs sm:text-sm font-extrabold transition-all duration-300 flex items-center gap-2 cursor-pointer ${
                view === 'checkout'
                  ? navActiveClass
                  : cartCount > 0
                  ? 'bg-[#E07A5F] text-white hover:bg-[#D66B4E] ring-4 ring-[#E07A5F]/20 animate-pulse font-extrabold shadow-sm'
                  : 'text-slate-700 bg-white hover:bg-slate-50 border border-slate-300'
              }`}
            >
              <ShoppingCart size={16} className={cartCount > 0 && view !== 'checkout' ? "animate-bounce" : ""} />
              <span>Mi Pedido ({cartCount})</span>
              {cartCount > 0 && (
                <span className="bg-white text-[#E07A5F] text-[9px] font-black px-2 py-0.5 rounded-full border border-rose-100 leading-none">
                  VER BANDEJA
                </span>
              )}
            </button>
            <button
              onClick={() => setView('admin')}
              id="nav-admin"
              aria-current={view === 'admin' ? 'page' : undefined}
              className={`group relative px-4.5 py-2 rounded-full text-xs sm:text-sm font-bold tracking-wide transition-all duration-300 flex items-center gap-1.5 cursor-pointer ${
                view === 'admin'
                  ? 'bg-gradient-to-r from-earth-brown via-sage-primary to-earth-brown text-terracotta shadow-lg shadow-earth-brown/30 ring-2 ring-terracotta/70'
                  : 'bg-gradient-to-r from-earth-brown to-sage-primary text-white shadow-md shadow-earth-brown/20 ring-1 ring-terracotta/40 hover:ring-2 hover:ring-terracotta/80 hover:shadow-lg hover:-translate-y-0.5'
              }`}
            >
              <Crown size={15} className="text-terracotta transition-transform duration-300 group-hover:-rotate-12" />
              Ingresar a Portal
            </button>
          </nav>
        </div>
      </header>

      {/* 3. ALERTS & TOASTS NOTIFICATIONS */}
      {notification && (
        <div className="fixed bottom-6 left-6 z-50 max-w-sm bg-slate-900 border border-slate-800 text-white text-xs px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-fadeIn">
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="ml-auto text-white/60 hover:text-white font-bold">✕</button>
        </div>
      )}

      {/* 4. CHANNELS/MAIN CONTAINER */}
      <main className="flex-1 pb-20">
        
        {/* VIEW: CATALOGUE & CAROUSEL */}
        {view === 'catalog' && (
          <div id="catalog-view" className="space-y-8 animate-fadeIn">
            {/* Brand hero banner */}
            <section id="hero-banner" className="relative w-full overflow-hidden bg-peach-light">
              <img
                src="/brand/banner.jpg"
                alt="Los Detallitos de Lupe - Regalos y Floristería"
                className="w-full h-[160px] sm:h-[220px] md:h-[300px] object-contain animate-fadeIn"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
              />
            </section>

            {/* Carousel container highlighting products of the month */}
            <ProductCarousel
              products={products}
              categoryDiscounts={categoryDiscounts}
              onSelectProduct={(p) => setPreviewProduct(p)}
              onAddToCart={handleAddToCart}
            />

            {/* Catalog Grid Section with Search Filters */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
              
              {/* Value Proposition Banners */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-3 border-b border-sage-light/20">
                <div className="flex items-center gap-3 p-3 bg-peach-light/20 rounded-2xl border border-sage-light/10">
                  <Truck className="text-sage-primary shrink-0" size={20} />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Despachos Especiales</h4>
                    <p className="text-[10px] text-slate-500">{ZONA_COBERTURA} (7 am a 6 pm)</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-peach-light/30 rounded-2xl border border-sage-light/10">
                  <Gift className="text-terracotta shrink-0" size={20} />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Dedicatoria Premium</h4>
                    <p className="text-[10px] text-slate-500">Tarjeta personalizada con fotos</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-[#F5EBE0]/40 rounded-2xl border border-sage-light/10">
                  <Heart className="text-earth-brown shrink-0" size={20} />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Artesanos con Amor</h4>
                    <p className="text-[10px] text-slate-500">Ingredientes frescos y flores seleccionadas</p>
                  </div>
                </div>
              </div>

              {/* Filtering block */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pt-4">
                <div>
                  <h3 className="text-lg font-serif font-bold text-slate-800 flex items-center gap-2">
                    <ListFilter size={18} className="text-sage-primary" />
                    Catálogo de Detalles y Arreglos
                  </h3>
                  <p className="text-xs text-slate-500">Filtra desayunos sorpresa, ramilletes de rosas y más.</p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {/* Search Bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                    <input
                      type="text"
                      id="search-input"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar sorpresa, fresas..."
                      className="bg-white border border-[#E6E6E6] rounded-full pl-9 pr-4 py-2 text-xs w-full sm:w-60 focus:outline-none focus:ring-2 focus:ring-sage-primary focus:border-transparent transition text-slate-700"
                    />
                  </div>

                  {/* Category Switchers */}
                  <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
                    {[
                      { id: 'all', label: '🌸 Todos' },
                      { id: 'desayunos', label: '🥞 Desayunos' },
                      { id: 'flores', label: '🌹 Flores' },
                      { id: 'detalles', label: '🎁 Detalles' }
                    ].map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        id={`filter-btn-${cat.id}`}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition ${
                          selectedCategory === cat.id
                            ? 'bg-sage-primary text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Grid of Catalogue Products */}
              {filteredProducts.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-[#E6E6E6] space-y-3">
                  <p className="text-sm text-slate-500">Ningún producto coincide con tus filtros o término de búsqueda.</p>
                  <button
                    onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }}
                    className="text-xs font-semibold text-sage-primary hover:underline"
                  >
                    Restaurar Filtros de Búsqueda
                  </button>
                </div>
              ) : (
                <div id="product-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {filteredProducts.map((p, idx) => (
                    <article
                      key={p.id}
                      id={`product-card-${p.id}`}
                      style={{ animationDelay: `${Math.min(idx * 60, 480)}ms` }}
                      className="bg-white rounded-3xl border border-[#E6E6E6] overflow-hidden shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between group animate-fadeInUp will-change-transform"
                    >
                      <div className="relative h-[220px] overflow-hidden bg-slate-100">
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-full h-full object-cover transition duration-500 group-hover:scale-105"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent"></div>
                        <span className="absolute top-3 left-3 bg-peach-light text-[10px] font-bold text-earth-brown uppercase px-2.5 py-1 rounded-full shadow-xs">
                          {p.category}
                        </span>
                      </div>

                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div className="space-y-2">
                          <h4 className="text-base font-serif font-semibold text-slate-800 leading-tight group-hover:text-sage-primary transition">
                            {p.name}
                          </h4>
                          <p className="text-[11px] text-slate-500 line-clamp-3 leading-relaxed">
                            {p.description}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div>
                            {getProductDiscount(p, categoryDiscounts) > 0 ? (
                              <div className="flex flex-col">
                                <span className="text-[10px] line-through text-slate-400 font-bold">
                                  ${p.price.toLocaleString('es-CO')} COP
                                </span>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm sm:text-base font-extrabold text-rose-600 font-sans">
                                    ${getProductEffectivePrice(p, categoryDiscounts).toLocaleString('es-CO')}
                                  </span>
                                  <span className="bg-rose-50 text-rose-700 font-black text-[9px] px-1.5 py-0.5 rounded-full border border-rose-100">
                                    -{getProductDiscount(p, categoryDiscounts)}%
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-base font-bold text-sage-primary font-sans">
                                ${p.price.toLocaleString('es-CO')} <span className="text-[10px] text-slate-400 font-normal">COP</span>
                              </span>
                            )}
                          </div>

                          <div className="flex gap-1">
                            <button
                              id={`btn-preview-${p.id}`}
                              onClick={() => setPreviewProduct(p)}
                              className="p-2 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors cursor-pointer"
                              title="Ver Detalles Completos"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              id={`btn-add-cart-${p.id}`}
                              onClick={() => handleAddToCart(p)}
                              className="bg-sage-primary hover:bg-[#5C614E] text-white font-semibold text-xs px-3 py-2 rounded-full flex items-center gap-1.5 transition-all duration-200 shadow-xs cursor-pointer hover:scale-105 active:scale-95"
                              title="Añadir a mi pedido"
                            >
                              <ShoppingBag size={12} />
                              Comprar
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: ORDER STATUS TRACKER */}
        {view === 'tracker' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 animate-fadeIn">
            <OrderTracker />
          </div>
        )}

        {/* VIEW: CHECKOUT / CART PROCESS */}
        {view === 'checkout' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 animate-fadeIn">
            <CheckoutFlow
              cartItems={cart}
              categoryDiscounts={categoryDiscounts}
              onUpdateQty={handleUpdateCartQty}
              onRemoveItem={handleRemoveFromCart}
              onClearCart={handleClearCart}
              onSubmitOrder={handleNewOrder}
              onClose={() => setView('catalog')}
            />
          </div>
        )}

        {/* VIEW: PROTECTED BACKOFFICE */}
        {view === 'admin' && (
          <div className="animate-fadeIn">
            <AdminPanel
              products={products}
              orders={orders}
              categoryDiscounts={categoryDiscounts}
              onUpdateCategoryDiscounts={handleUpdateCategoryDiscounts}
              onAddProduct={handleAddNewProductGroup}
              onUpdateProduct={handleUpdateProductGroup}
              onDeleteProduct={handleDeleteProductGroup}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onDeleteAllOrders={handleDeleteAllOrders}
              onAddOrder={handleNewOrder}
              onUpdateOrderCoords={handleUpdateOrderCoords}
              onRefreshOrders={refreshStaffOrders}
            />
          </div>
        )}
      </main>

      {/* 5. MODAL: DETAILED PRODUCT VIEWER */}
      {previewProduct && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-2xl w-full border border-slate-100 flex flex-col md:flex-row max-h-[90vh]">
            {/* Picture block */}
            <div className="md:w-1/2 relative h-64 md:h-auto bg-slate-100">
              <img
                src={previewProduct.image}
                alt={previewProduct.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <span className="absolute top-4 left-4 bg-terracotta text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-md">
                {previewProduct.category}
              </span>
            </div>

            {/* Information block */}
            <div className="md:w-1/2 p-6 sm:p-8 flex flex-col justify-between overflow-y-auto space-y-6">
              <div>
                <div className="flex justify-between items-start gap-2">
                  <h3 className="text-xl font-serif font-bold text-slate-800 leading-tight">
                    {previewProduct.name}
                  </h3>
                  <button
                    onClick={() => setPreviewProduct(null)}
                    className="text-slate-400 hover:text-slate-600 font-bold text-sm bg-slate-100 hover:bg-slate-200 p-1 rounded-full cursor-pointer h-6 w-6 flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
                {getProductDiscount(previewProduct, categoryDiscounts) > 0 ? (
                  <div className="mt-2 flex flex-col">
                    <span className="text-xs line-through text-slate-400 font-bold">
                      ${previewProduct.price.toLocaleString('es-CO')} COP
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-extrabold text-rose-600 font-sans">
                        ${getProductEffectivePrice(previewProduct, categoryDiscounts).toLocaleString('es-CO')} COP
                      </span>
                      <span className="bg-rose-55 border border-rose-100 text-rose-700 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                        {getProductDiscount(previewProduct, categoryDiscounts)}% DESCUENTO
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-lg font-bold text-sage-primary font-sans mt-2">
                    ${previewProduct.price.toLocaleString('es-CO')} COP
                  </p>
                )}
                <div className="h-px bg-sage-light/20 my-3"></div>
                <p className="text-xs text-slate-600 leading-relaxed font-sans">
                  {previewProduct.description}
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-4">
                <button
                  id={`dialog-add-brand-${previewProduct.id}`}
                  onClick={() => {
                    handleAddToCart(previewProduct);
                    setPreviewProduct(null);
                  }}
                  className="w-full bg-sage-primary hover:bg-[#5C614E] text-white font-semibold text-sm py-2.5 rounded-full flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <ShoppingBag size={16} />
                  Añadir al Carrito
                </button>
                <button
                  onClick={() => setPreviewProduct(null)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-2 rounded-full transition cursor-pointer"
                >
                  Cerrar Ventana
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD-TO-CART PRODUCT CONFIRMATION MODAL */}
      {addedProduct && (
        <div
          id="added-product-modal"
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn"
          onClick={() => setAddedProduct(null)}
        >
          <div
            className="relative bg-white rounded-3xl overflow-hidden shadow-2xl max-w-md w-full border border-slate-100 p-6 space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Barra que se vacía mientras corre el temporizador de cierre */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-slate-100">
              <div
                key={addedTick}
                className="h-full bg-gradient-to-r from-sage-primary to-terracotta animate-shrinkBar"
                style={{ animationDuration: `${ADDED_POPUP_MS}ms` }}
              />
            </div>
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-3xl shadow-sm border border-emerald-100">
                🎉
              </div>
              <h3 className="text-xl font-serif font-black text-slate-800">
                ¡Producto Agregado con Éxito!
              </h3>
              <p className="text-xs text-slate-505">
                Se ha añadido el siguiente detalle sorpresa a tu bandeja de pedido.
              </p>
            </div>

            <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100 flex items-center gap-4">
              <img
                src={addedProduct.image}
                alt={addedProduct.name}
                className="w-16 h-16 object-cover rounded-xl border border-slate-200"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-800 text-sm truncate">{addedProduct.name}</h4>
                <p className="text-[10px] text-slate-450 uppercase font-extrabold tracking-wider">{addedProduct.category}</p>
                <p className="text-xs font-bold text-sage-primary mt-1">
                  ${getProductEffectivePrice(addedProduct, categoryDiscounts).toLocaleString('es-CO')} COP
                  {getProductDiscount(addedProduct, categoryDiscounts) > 0 && (
                    <span className="text-[9px] text-rose-600 font-extrabold ml-1.5 bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-100">
                      -{getProductDiscount(addedProduct, categoryDiscounts)}%
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  setAddedProduct(null);
                  setView('checkout');
                }}
                className="w-full bg-[#E07A5F] hover:bg-[#D66B4E] text-white font-extrabold text-xs py-3 rounded-full flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-transform active:scale-98 cursor-pointer"
              >
                <span>💳 Ir a Pagar / Personalizar Dedicatoria</span>
              </button>
              <button
                onClick={() => setAddedProduct(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs py-2.5 rounded-full transition cursor-pointer"
              >
                🛍️ Seguir Comprando en el Catálogo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA LATERAL DE LA BANDEJA (se despliega solo cuando el cliente la toca) */}
      {view !== 'checkout' && view !== 'admin' && (
        <CartSideTab
          cart={cart}
          categoryDiscounts={categoryDiscounts}
          highlight={!!addedProduct}
          onCheckout={() => setView('checkout')}
          onRemoveItem={handleRemoveFromCart}
          onClearCart={handleClearCart}
        />
      )}

      {/* EXIT-INTENT RECORDATORIO DE COMPRA MODAL */}
      {showExitIntent && cart.length > 0 && (
        <div id="exit-intent-modal" className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl overflow-hidden shadow-2xl max-w-lg w-full border border-slate-105 p-6 sm:p-8 space-y-6 relative">
            <button
              onClick={() => {
                sessionStorage.setItem('dulce_lupe_exit_dismissed', 'true');
                setShowExitIntent(false);
              }}
              className="absolute top-4 right-4 text-slate-450 hover:text-slate-600 font-bold bg-slate-105 hover:bg-slate-200 rounded-full w-6 h-6 flex items-center justify-center cursor-pointer transition text-xs"
              title="Cerrar recordatorio"
            >
              ✕
            </button>
            <div className="text-center space-y-2">
              <span className="text-4xl">🎁</span>
              <p className="text-xs text-rose-600 font-extrabold uppercase tracking-wider">¡No dejes pasar esta oportunidad!</p>
              <h3 className="text-xl sm:text-2xl font-serif font-black text-slate-850 leading-tight">
                ¿Te vas sin asegurar tu sorpresa?
              </h3>
              <p className="text-xs text-slate-505 max-w-md mx-auto leading-relaxed">
                Tienes productos espectaculares listos en tu bandeja de pedido. Al terminar tu compra ahora, podemos agendar tu fecha y hora exacta de reparto en {SOACHA_HABILITADA ? 'Bogotá o Soacha' : 'Bogotá'}.
              </p>
            </div>

            <div className="bg-slate-50/75 rounded-2xl p-4 border border-slate-100 space-y-3">
              <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">🛒 Tu Pedido Actual ({cart.reduce((ac, c) => ac + c.quantity, 0)} productos):</p>
              <div className="max-h-32 overflow-y-auto divide-y divide-slate-150/40 pr-1 space-y-2">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-3 pt-2 first:pt-0">
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="w-10 h-10 object-cover rounded-lg border border-slate-250"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{item.product.name}</p>
                      <p className="text-[10px] text-slate-500">Cantidad: {item.quantity}</p>
                    </div>
                    <span className="font-extrabold text-xs text-sage-primary">
                      ${(getProductEffectivePrice(item.product, categoryDiscounts) * item.quantity).toLocaleString('es-CO')} COP
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => {
                  setShowExitIntent(false);
                  setView('checkout');
                }}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white font-extrabold text-xs py-3 rounded-full shadow-md transition duration-150 active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>💖 Completar Mi Pedido Ahora</span>
              </button>
              <button
                onClick={() => {
                  sessionStorage.setItem('dulce_lupe_exit_dismissed', 'true');
                  setShowExitIntent(false);
                }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-extrabold text-xs py-3 px-5 rounded-full transition cursor-pointer"
              >
                Seguir Navegando
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PERSISTENT FLOATING PROFESSIONAL CART TRACKER BANNER */}
      {showCartBanner && cartCount > 0 && view !== 'checkout' && view !== 'admin' && (
        <div id="floating-cart-tracker" className="fixed bottom-24 right-6 left-6 md:left-auto md:right-6 md:bottom-24 z-40 bg-slate-900 border border-slate-800 text-white shadow-2xl rounded-3xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-fadeIn max-w-sm md:w-[380px] overflow-hidden">
          {/* Barra que se vacía mientras corre el temporizador de cierre */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800">
            <div
              key={cartBannerTick}
              className="h-full bg-gradient-to-r from-emerald-400 to-terracotta animate-shrinkBar"
              style={{ animationDuration: `${ADDED_POPUP_MS}ms` }}
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400 shrink-0">
              <ShoppingCart size={18} />
              <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full border border-slate-900 leading-none">
                {cartCount}
              </span>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                <span>Tu Bandeja de Pedido</span>
                <span className="bg-emerald-500/15 text-emerald-400 text-[8px] font-extrabold px-1.5 py-0.5 rounded-full">
                  ACTIVA
                </span>
              </p>
              <p className="text-[11px] text-slate-450 mt-0.5">
                Total Parcial: <strong className="text-emerald-400 text-xs">${cart.reduce((total, item) => total + getProductEffectivePrice(item.product, categoryDiscounts) * item.quantity, 0).toLocaleString('es-CO')}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => { setShowCartBanner(false); setView('checkout'); }}
              className="flex-grow md:flex-grow-0 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl flex items-center justify-center gap-1 transition-all duration-150 cursor-pointer shadow-sm shadow-rose-900/10"
            >
              <span>💳 Pagar Ahora</span>
            </button>
            <button
              onClick={() => {
                if (confirm('¿Estás seguro de que deseas vaciar tu carrito de compras?')) {
                  handleClearCart();
                }
              }}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-705 text-slate-400 hover:text-slate-200 transition cursor-pointer"
              title="Vaciar mi bandeja"
            >
              🗑️
            </button>
          </div>
        </div>
      )}

      {/* 6. FLOATING SUPPORT/CONTACT DIRECT BUTTON */}
      <a
        href="https://wa.me/573138005702?text=Hola%20Los%20Detallitos%20de%20Lupe,%20me%20gustar%C3%ADa%20solicitar%20un%20desayuno%20sorpresa%20o%20arreglo%20de%20florister%C3%ADa."
        target="_blank"
        rel="noopener noreferrer"
        id="floating-contact-btn"
        className="fixed bottom-6 right-6 z-40 bg-green-500 hover:bg-green-600 hover:shadow-lg hover:shadow-green-100 text-white p-4 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform hover:scale-110 active:scale-95 group"
        title="Canal de soporte en WhatsApp"
      >
        <MessageCircle size={24} className="animate-pulse" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs group-hover:ml-2 transition-all duration-300 ease-out font-semibold text-xs whitespace-nowrap">
          Soporte 24/7
        </span>
      </a>

      {/* 7. FOOTER BAR */}
      <footer className="bg-slate-900 text-slate-400 py-8 border-t border-slate-800 text-xs mt-auto font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <p className="font-bold text-slate-300">🌸 Los Detallitos de Lupe • Desayunos, Detalles y Floristería S.A.S</p>
          <p className="max-w-lg mx-auto leading-relaxed text-slate-500 text-[11px]">
            Pedidos con 3 días de anticipación para entregas sin contratiempos en {SOACHA_HABILITADA ? 'las comunas de Soacha y ' : ''}las localidades de Bogotá D.C., Colombia.
          </p>
          <p className="text-[10px] text-slate-600">&copy; {new Date().getFullYear()} Los Detallitos de Lupe. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
