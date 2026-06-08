/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export default function PromoBanner() {
  return (
    <div id="promo-banner" className="bg-gradient-to-r from-earth-brown via-sage-primary to-olive-dark text-white text-xs sm:text-sm py-2 px-4 shadow-sm relative overflow-hidden transition-all duration-300">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent)] animate-pulse pointer-events-none"></div>
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-center gap-2 relative z-10 font-sans tracking-wide">
        <div className="flex items-center gap-2">
          <span className="bg-white/20 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full backdrop-blur-xs">
            Aviso Importante
          </span>
          <span className="font-medium">
            Pedidos para Bogotá y Soacha con un mínimo de <strong>3 días de anticipación</strong>.
          </span>
        </div>
        <div className="hidden md:flex items-center gap-4 text-xs">
          <span>🌸 Detalles hechos con amor</span>
          <span className="w-1.5 h-1.5 rounded-full bg-white/60"></span>
          <span>🚚 Envíos de Lunes a Domingo de 6:00 AM a 1:00 PM</span>
        </div>
      </div>
    </div>
  );
}
