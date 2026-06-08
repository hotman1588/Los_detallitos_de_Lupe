/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product } from './types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: "prod-1",
    name: "Desayuno Especial Lupe",
    price: 135000,
    description: "La sorpresa perfecta para iniciar el día. Incluye waffles o pancakes esponjosos de arándanos, yogur griego con granola, ensalada de frutas frescas en frasco de vidrio, jugo natural de naranja embotellado, croissant recién horneado, café de especialidad y globo de helio metalizado personalizable. Todo presentado en una vajilla artesanal y guacal de madera decorado.",
    category: "desayunos",
    image: "https://images.unsplash.com/photo-1513456852971-30c0b8199d4d?w=600&auto=format&fit=crop&q=80",
    featured: true
  },
  {
    id: "prod-2",
    name: "Caja Desayuno Salado & Gourmet",
    price: 145000,
    description: "Una experiencia culinaria matutina de lujo. Contiene sándwich artesanal en pan focaccia con jamón serrano y queso brie, wrap de pavo y aguacate, parfait de fresa y chía, capuchino en taza térmica de acero, jugo verde refrescante y torta personal de chocolate belga para endulzar el día. Viene en una hermosa caja negra texturizada con lazo de satín.",
    category: "desayunos",
    image: "https://images.unsplash.com/photo-1496042300028-ac74a1257395?w=600&auto=format&fit=crop&q=80",
    featured: false
  },
  {
    id: "prod-3",
    name: "Caja de Rosas de Terciopelo Premium",
    price: 160000,
    description: "Un arreglo de flores espectacular para expresar admiración o amor profundo. Consta de 24 rosas rojas de exportación seleccionadas con esmero, decoradas en una sofisticada caja redonda rígida (estilo sombrerera) color negro mate, follaje premium de eucalipto baby blue, y una tarjeta de dedicatoria personalizada.",
    category: "flores",
    image: "https://images.unsplash.com/photo-1582794543139-8ac9cb0f7b11?w=600&auto=format&fit=crop&q=80",
    featured: true
  },
  {
    id: "prod-4",
    name: "Arreglo Radiante de Girasoles Sol-Naciente",
    price: 95000,
    description: "Llena de luz y alegría el espacio de esa persona amada. Incluye 5 hermosos girasoles gigantes importados de la Sabana de Bogotá, acompañados de astromelias blancas y eucalipto silvestre, dispuestos en un florero cilíndrico de vidrio premium de diseño contemporáneo, atado con cordón rústico de yute.",
    category: "flores",
    image: "https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=600&auto=format&fit=crop&q=80",
    featured: false
  },
  {
    id: "prod-5",
    name: "Caja de Detalles Dulce Amor y Oso",
    price: 110000,
    description: "El regalo perfecto para aniversarios o cumpleaños especiales. Incluye una elegante caja de regalo ilustrada, un tierno oso de peluche hipoalergénico de 25 cm de alto, una caja de chocolates Ferrero Rocher x8, frasco de gomitas artesanales con mensaje dulce, y una taza de cerámica personalizada.",
    category: "detalles",
    image: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&auto=format&fit=crop&q=80",
    featured: true
  },
  {
    id: "prod-6",
    name: "Kit Brindis y Celebración Premium",
    price: 185000,
    description: "Una combinación sofisticada de sabores para celebrar logros o fechas inolvidables. Incluye media botella de vino tinto Cabernet Sauvignon de reserva, copa de cristal grabada, tabla de quesos gourmet seleccionados (queso holandés, brie, salami y jamón serrano), uvas frescas, galletas crackers de finas hierbas, y caja de bombones de chocolate negro.",
    category: "detalles",
    image: "https://images.unsplash.com/photo-1549007994-cb92caeb54bd?w=600&auto=format&fit=crop&q=80",
    featured: false
  }
];
