/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  category: 'desayunos' | 'flores' | 'detalles';
  image: string;
  featured?: boolean;
  discountPercentage?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  customShipping?: {
    recipientName: string;
    recipientPhone: string;
    municipio: string;
    localidad: string;
    barrio: string;
    direccionDetallada: string;
    indicacionesAdicionales?: string;
    mensajeTarjeta: string;
    horaEntrega: string;
    includeShipping: boolean;
    locationLatLng?: { lat: number; lng: number };
    locationName?: string;
  };
}

export interface ShippingDetails {
  buyerName: string;
  buyerPhone: string;
  buyerCedula: string; // Cédula/Identificación
  recipientName: string;
  recipientPhone: string;
  municipio: string;
  localidad: string;
  barrio: string;
  direccionDetallada: string;
  indicacionesAdicionales?: string;
  fechaEntrega: string; // YYYY-MM-DD
  horaEntrega: string; // Rango de hora elegido
  mensajeTarjeta: string;
  cardPhotoUrl?: string; // Optional custom photo for personalized card
  cardPhotoName?: string;
  cardPhotos?: { url: string; name: string }[]; // Support multiple photos up to 5
  locationLatLng?: { lat: number; lng: number };
  locationName?: string;
}

export type OrderStatus = 'En Validación' | 'En Preparación' | 'En Reparto' | 'Entregado' | 'Rechazado';

export interface Order {
  id: string; // e.g., DA-10025
  shipping: ShippingDetails;
  items: CartItem[];
  total: number;
  subtotal?: number; // Optional subtotal of products
  shippingFee?: number; // Optional shipping fee amount
  paymentReceiptUrl: string; // Base64 string of uploaded receipt
  status: OrderStatus;
  createdAt: string; // ISO string 
  deliveryPhotoUrl?: string; // Proof of delivery image Base64
  deliveredAt?: string; // Timestamp of delivery completion
  paymentMethod?: string; // Optional payment method description
  assignedDomiUsername?: string; // Delivery driver username assigned to this order
}

export interface SystemUser {
  id: string; // Cédula/Identificación
  username: string; // Nombre de usuario (puede ser la misma cédula)
  password: string; // Clave
  name: string; // Nombre completo
  phone: string; // Número de contacto
  email: string; // Correo electrónico
  role: 'admin' | 'domiciliario'; // Rol asignado
}

export interface AdminUser {
  loggedIn: boolean;
  username: string;
}
