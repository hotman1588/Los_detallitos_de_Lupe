import React, { useState } from 'react';
import { ShoppingCart, ChevronRight, X, Trash2 } from 'lucide-react';
import { CartItem } from '../types';
import { getProductEffectivePrice } from '../lib/promoUtils';

interface CartSideTabProps {
  cart: CartItem[];
  categoryDiscounts: Record<string, number>;
  highlight: boolean; // resalta la pestaña justo después de agregar un producto
  onCheckout: () => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
}

// Pestaña fija en el borde derecho: muestra la bandeja de pedido y se
// despliega solo cuando el cliente la toca, sin tapar la pantalla.
export default function CartSideTab({ cart, categoryDiscounts, highlight, onCheckout, onRemoveItem, onClearCart }: CartSideTabProps) {
  const [isOpen, setIsOpen] = useState(false);

  const count = cart.reduce((acc, item) => acc + item.quantity, 0);
  if (count === 0) return null;

  const subtotal = cart.reduce(
    (acc, item) => acc + getProductEffectivePrice(item.product, categoryDiscounts) * item.quantity,
    0
  );

  return (
    <>
      {!isOpen && (
        // El contenedor centra la pestaña; la animación va en el botón para no perder el centrado.
        <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label={`Abrir mi bandeja de pedido (${count} productos)`}
            className={`bg-gradient-to-b from-sage-primary to-earth-brown text-white rounded-l-2xl shadow-xl pl-2.5 pr-2 py-3 flex flex-col items-center gap-1.5 cursor-pointer ring-1 ring-terracotta/40 transition-transform hover:-translate-x-1 ${
              highlight ? 'animate-bounce' : ''
            }`}
          >
            <ShoppingCart size={18} />
            <span className="bg-terracotta text-earth-brown text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
              {count}
            </span>
            <span className="text-[10px] font-bold tracking-widest uppercase [writing-mode:vertical-rl] rotate-180">
              Mi bandeja
            </span>
          </button>
        </div>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setIsOpen(false)} />
          <aside className="fixed right-0 top-1/2 -translate-y-1/2 z-50 w-72 max-w-[85vw] max-h-[75vh] bg-white rounded-l-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-fadeIn font-sans">
            <div className="bg-gradient-to-r from-earth-brown to-sage-primary text-white px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold flex items-center gap-2">
                <ShoppingCart size={16} className="text-terracotta" />
                Mi bandeja ({count})
              </span>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Cerrar bandeja" className="text-white/80 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
              {cart.map(item => (
                <li key={item.product.id} className="flex items-center gap-3 px-4 py-2.5">
                  <img
                    src={item.product.image}
                    alt={item.product.name}
                    className="w-11 h-11 object-cover rounded-lg border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{item.product.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.quantity} × ${getProductEffectivePrice(item.product, categoryDiscounts).toLocaleString('es-CO')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.product.id)}
                    aria-label={`Eliminar ${item.product.name} de la bandeja`}
                    title="Eliminar de la bandeja"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>

            <div className="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-semibold">Subtotal</span>
                <span className="font-bold text-slate-800">${subtotal.toLocaleString('es-CO')} COP</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onCheckout();
                }}
                className="w-full bg-[#E07A5F] hover:bg-[#D66B4E] text-white font-extrabold text-xs py-2.5 rounded-full flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
              >
                💳 Ir a Pagar
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm('¿Estás seguro de que deseas vaciar tu bandeja de pedido?')) {
                    onClearCart();
                    setIsOpen(false);
                  }
                }}
                className="w-full text-slate-500 hover:text-rose-600 hover:bg-rose-50 font-bold text-[11px] py-2 rounded-full flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 size={13} />
                Vaciar bandeja
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
