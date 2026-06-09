/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Product } from '../types';
import { ChevronLeft, ChevronRight, ShoppingBag, Eye } from 'lucide-react';
import { getProductDiscount, getProductEffectivePrice } from '../lib/promoUtils';

interface ProductCarouselProps {
  products: Product[];
  categoryDiscounts?: Record<string, number>;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

export default function ProductCarousel({ 
  products, 
  categoryDiscounts = { desayunos: 0, flores: 0, detalles: 0 }, 
  onSelectProduct, 
  onAddToCart 
}: ProductCarouselProps) {
  const featuredProducts = products.filter(p => p.featured).slice(0, 4);
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    if (featuredProducts.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIdx(prev => (prev + 1) % featuredProducts.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [featuredProducts.length]);

  if (featuredProducts.length === 0) return null;

  const handlePrev = () => {
    setCurrentIdx(prev => (prev - 1 + featuredProducts.length) % featuredProducts.length);
  };

  const handleNext = () => {
    setCurrentIdx(prev => (prev + 1) % featuredProducts.length);
  };

  const activeProduct = featuredProducts[currentIdx];

  return (
    <div id="featured-carousel" className="relative w-full bg-peach-light/30 border-b border-sage-light/20 overflow-hidden py-10 px-4 md:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl sm:text-3xl font-serif font-bold text-slate-800 tracking-tight">
              Arreglos y Sorpresas del Mes ⭐
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Las creaciones favoritas de nuestra comunidad listas para despertar sonrisas.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrev}
              className="p-2 rounded-full border border-sage-light/30 bg-white shadow-xs hover:bg-peach-light text-sage-primary transition"
              aria-label="Anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={handleNext}
              className="p-2 rounded-full border border-sage-light/30 bg-white shadow-xs hover:bg-peach-light text-sage-primary transition"
              aria-label="Siguiente"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Slides container */}
        <div className="relative min-h-[460px] md:h-[450px] lg:h-[400px] bg-white rounded-3xl shadow-xl overflow-hidden border border-[#F0F0F0]">
          <div className="grid grid-cols-1 md:grid-cols-12 md:h-full">
            {/* Image section */}
            <div className="md:col-span-5 h-[200px] sm:h-[240px] md:h-full relative overflow-hidden group">
              <motion.img
                key={activeProduct.id}
                src={activeProduct.image}
                alt={activeProduct.name}
                className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 will-change-transform"
                referrerPolicy="no-referrer"
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-white/10 pointer-events-none"></div>
              <span className="absolute top-4 left-4 bg-terracotta text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md z-15 uppercase tracking-wider">
                Destacado Especial
              </span>
            </div>

            {/* Product description / CTAs */}
            <motion.div
              key={`info-${activeProduct.id}`}
              className="md:col-span-7 p-6 sm:p-10 flex flex-col justify-between bg-white relative z-10"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
            >
              <div>
                <span className="text-[11px] uppercase font-bold tracking-widest text-earth-brown bg-peach-light px-2.5 py-1 rounded-md self-start inline-block mb-3">
                  {activeProduct.category}
                </span>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-serif font-extrabold text-slate-800 leading-tight">
                  {activeProduct.name}
                </h3>
                {getProductDiscount(activeProduct, categoryDiscounts) > 0 ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                    <span className="text-xs sm:text-sm line-through text-slate-400 font-extrabold">
                      ${activeProduct.price.toLocaleString('es-CO')} COP
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg sm:text-2xl font-black text-rose-600 animate-pulse tracking-tight">
                        ${getProductEffectivePrice(activeProduct, categoryDiscounts).toLocaleString('es-CO')} COP
                      </span>
                      <span className="bg-rose-50 text-rose-700 font-extrabold text-[10px] px-2.5 py-0.5 rounded-full border border-rose-100 uppercase tracking-wider flex items-center gap-1 shadow-3xs">
                        🔥 {getProductDiscount(activeProduct, categoryDiscounts)}% OFF
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-lg sm:text-xl font-bold font-sans text-sage-primary mt-2">
                    ${activeProduct.price.toLocaleString('es-CO')} COP
                  </p>
                )}
                <p className="text-sm text-slate-600 mt-4 leading-relaxed font-sans line-clamp-3">
                  {activeProduct.description}
                </p>
              </div>

              <div className="mt-8 flex flex-wrap gap-3 items-center">
                <button
                  id={`carousel-add-${activeProduct.id}`}
                  onClick={() => onAddToCart(activeProduct)}
                  className="bg-sage-primary hover:bg-earth-brown text-white font-semibold text-sm px-6 py-3 rounded-full flex items-center gap-2 transform active:scale-95 transition-all duration-300 shadow-sm"
                >
                  <ShoppingBag size={18} />
                  Añadir al Pedido
                </button>
                <button
                  id={`carousel-view-${activeProduct.id}`}
                  onClick={() => onSelectProduct(activeProduct)}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-sm px-5 py-3 rounded-full flex items-center gap-2 transition duration-300 border border-slate-200/50"
                >
                  <Eye size={18} />
                  Ver Detalles
                </button>
              </div>
            </motion.div>
          </div>

          {/* Dots navigation indicator */}
          <div className="absolute bottom-4 left-4 md:left-auto md:right-8 flex gap-1.5 z-20">
            {featuredProducts.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIdx(idx)}
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  currentIdx === idx ? 'w-8 bg-terracotta' : 'w-2.5 bg-slate-300 hover:bg-slate-400'
                }`}
                aria-label={`Ir al slider ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
