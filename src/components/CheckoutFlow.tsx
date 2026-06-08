/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CartItem, ShippingDetails, Order } from '../types';
import { DIVIPOLA_DATA } from '../divipola';
import { Calendar, MapPin, Gift, CreditCard, ChevronRight, CheckCircle, ArrowLeft, Upload, Trash2 } from 'lucide-react';
import MapPicker from './MapPicker';
import { getProductDiscount, getProductEffectivePrice, compressImageBase64 } from '../lib/promoUtils';
import { isSupabaseConfigured, getConfig, incrementIdCounter } from '../lib/supabaseClient';

interface CheckoutFlowProps {
  cartItems: CartItem[];
  categoryDiscounts?: Record<string, number>;
  onUpdateQty: (productId: string, qty: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onSubmitOrder: (order: Order) => void;
  onClose: () => void;
}

export default function CheckoutFlow({
  cartItems,
  categoryDiscounts = { desayunos: 0, flores: 0, detalles: 0 },
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onSubmitOrder,
  onClose
}: CheckoutFlowProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1); // 1: Cart, 2: Shipping/Logistics, 3: Transfer & Receipt Upload, 4: Success Screen
  const [createdOrderID, setCreatedOrderID] = useState<string>('');
  const [showErrors, setShowErrors] = useState(false);

  // Delivery & Payment selection option states
  const [includeShipping, setIncludeShipping] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'pse'>('transfer');
  const [pseBank, setPseBank] = useState('');
  const [pseUserType, setPseUserType] = useState('natural');
  const [pseEmail, setPseEmail] = useState('');
  const [pseCompleted, setPseCompleted] = useState(false);
  const [pseTransReference, setPseTransReference] = useState('');

  // Form Fields
  const [buyerName, setBuyerName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerCedula, setBuyerCedula] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [barrio, setBarrio] = useState('');
  const [direccionDetallada, setDireccionDetallada] = useState('');
  const [indicacionesAdicionales, setIndicacionesAdicionales] = useState('');
  const [locationLatLng, setLocationLatLng] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [locationName, setLocationName] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [mensajeTarjeta, setMensajeTarjeta] = useState('');
  const [horaEntrega, setHoraEntrega] = useState('09:00 AM - 11:00 AM');

  // Multi-address support states for more than 2 products
  const [multiAddress, setMultiAddress] = useState(false);
  const [unitForms, setUnitForms] = useState<Record<string, {
    recipientName: string;
    recipientPhone: string;
    municipio: string;
    localidad: string;
    barrio: string;
    direccionDetallada: string;
    indicacionesAdicionales: string;
    mensajeTarjeta: string;
    horaEntrega: string;
    includeShipping: boolean;
    locationLatLng?: { lat: number; lng: number };
    locationName?: string;
  }>>({});

  // Expand cart into units for separate shippings
  const individualUnits = React.useMemo(() => {
    return cartItems.flatMap((item, itemIdx) => {
      const units = [];
      for (let q = 0; q < item.quantity; q++) {
        units.push({
          itemIndex: itemIdx,
          product: item.product,
          unitId: `${item.product.id}-unit-${q}-${itemIdx}`,
          displayName: `${item.product.name} (Unidad ${q + 1})`
        });
      }
      return units;
    });
  }, [cartItems]);

  const updateUnitField = (unitId: string, field: string, value: any) => {
    setUnitForms(prev => {
      const existing = prev[unitId] || {
        recipientName: '',
        recipientPhone: '',
        municipio: '',
        localidad: '',
        barrio: '',
        direccionDetallada: '',
        indicacionesAdicionales: '',
        mensajeTarjeta: mensajeTarjeta || '',
        horaEntrega: '09:00 AM - 11:00 AM',
        includeShipping: true,
        locationLatLng: undefined,
        locationName: ''
      };
      return {
        ...prev,
        [unitId]: {
          ...existing,
          [field]: value
        }
      };
    });
  };

  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const hasMoreThanTwoProducts = totalQuantity >= 2;

  // Card customization photo state (supports multiple, limit of 5)
  const [cardPhotos, setCardPhotos] = useState<{ url: string; name: string }[]>([]);
  const [cardPhotoError, setCardPhotoError] = useState<string>('');

  // Payment State
  const [receiptBase64, setReceiptBase64] = useState<string>('');
  const [receiptFileName, setReceiptFileName] = useState<string>('');
  const [receiptError, setReceiptError] = useState<string>('');

  // Handle Card Custom Photo Attachment logic with limit of 5
  const handleCardPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardPhotoError('');
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 5 - cardPhotos.length;
    if (remainingSlots <= 0) {
      setCardPhotoError('Límite alcanzado: Ya has seleccionado 5 fotos para tu tarjeta.');
      return;
    }

    const filesArray = Array.from(files) as File[];
    const validFiles: File[] = [];
    let rejectedType = false;

    for (const file of filesArray) {
      if (!file.type.match('image.*')) {
        rejectedType = true;
      } else {
        validFiles.push(file);
      }
    }

    if (rejectedType) {
      setCardPhotoError('Solo se permiten imágenes (PNG, JPG, JPEG).');
    }

    if (validFiles.length > remainingSlots) {
      setCardPhotoError(`Solo se pueden agregar hasta 5 fotos en total. Se omitieron las imágenes excedentes.`);
    }

    const filesToProcess = validFiles.slice(0, remainingSlots);
    if (filesToProcess.length === 0) return;

    let processedCount = 0;
    const loadedPhotos: { url: string; name: string }[] = [];

    filesToProcess.forEach((file) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target && event.target.result) {
          try {
            const compressed = await compressImageBase64(event.target.result as string, 800, 800, 0.4);
            loadedPhotos.push({
              url: compressed,
              name: file.name
            });
          } catch (err) {
            loadedPhotos.push({
              url: event.target.result as string,
              name: file.name
            });
          }
        }
        processedCount++;
        if (processedCount === filesToProcess.length) {
          setCardPhotos(prev => [...prev, ...loadedPhotos]);
        }
      };
      reader.onerror = () => {
        setCardPhotoError('Error cargando algunas imágenes. Por favor reintenta.');
      };
      reader.readAsDataURL(file);
    });
  };

  const removeCardPhoto = (idx: number) => {
    setCardPhotos(prev => prev.filter((_, i) => i !== idx));
    setCardPhotoError('');
  };

  // Options states depending on DIVIPOLA DANE structure
  const [localidadesList, setLocalidadesList] = useState<string[]>([]);
  const [barriosList, setBarriosList] = useState<string[]>([]);

  // Update lists when inter-dependent dropdowns change
  useEffect(() => {
    if (municipio && DIVIPOLA_DATA[municipio]) {
      setLocalidadesList(Object.keys(DIVIPOLA_DATA[municipio]));
      setLocalidad('');
      setBarriosList([]);
      setBarrio('');
    } else {
      setLocalidadesList([]);
      setLocalidad('');
      setBarriosList([]);
      setBarrio('');
    }
  }, [municipio]);

  useEffect(() => {
    if (municipio && localidad && DIVIPOLA_DATA[municipio][localidad]) {
      setBarriosList(DIVIPOLA_DATA[municipio][localidad]);
      setBarrio('');
    } else {
      setBarriosList([]);
      setBarrio('');
    }
  }, [municipio, localidad]);

  // Minimum Delivery Date Calculation (Requires minimum 3 days in advance)
  const getMinDeliveryDate = () => {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 3);
    const yyyy = minDate.getFullYear();
    const mm = String(minDate.getMonth() + 1).padStart(2, '0');
    const dd = String(minDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const minDateLimit = getMinDeliveryDate();

  // Price calculations
  const subtotal = cartItems.reduce((acc, curr) => acc + (getProductEffectivePrice(curr.product, categoryDiscounts) * curr.quantity), 0);
  const numShippings = multiAddress
    ? individualUnits.filter(u => {
        const form = unitForms[u.unitId];
        return form ? form.includeShipping : true;
      }).length
    : (includeShipping ? 1 : 0);
  const valorEnvio = numShippings * 12000;
  const total = subtotal + valorEnvio;

  const handleNextStep = () => {
    if (step === 1) {
      if (cartItems.length === 0) return;
      setStep(2);
    } else if (step === 2) {
      // Validate step 2 fields
      if (!buyerName.trim() || !buyerPhone.trim() || !buyerCedula.trim() || !fechaEntrega) {
        setShowErrors(true);
        alert("⚠️ Es obligatorio llenar todos los campos del comprador (Nombre, Cédula, Teléfono) y seleccionar una fecha de entrega.");
        return;
      }

      if (multiAddress) {
        let hasErrors = false;
        for (const unit of individualUnits) {
          const uForm = unitForms[unit.unitId] || {
            recipientName: '',
            recipientPhone: '',
            municipio: '',
            localidad: '',
            barrio: '',
            direccionDetallada: '',
            indicacionesAdicionales: '',
            mensajeTarjeta: '',
            horaEntrega: '09:00 AM - 11:00 AM',
            includeShipping: true
          };

          const isAddrValid = uForm.municipio && uForm.localidad && uForm.barrio && uForm.direccionDetallada.trim();

          if (!uForm.recipientName.trim() || !uForm.recipientPhone.trim() || !isAddrValid || !uForm.mensajeTarjeta.trim()) {
            hasErrors = true;
            break;
          }
        }

        if (hasErrors) {
          setShowErrors(true);
          alert("⚠️ Envíos Separados Activado: Es obligatorio llenar todos los campos de destinatario, dirección completa de despacho (Municipio, Localidad, Barrio, Dirección) y dedicatoria para CADA uno de los productos en tu pedido.");
          return;
        }
      } else {
        const isAddressValid = municipio && localidad && barrio && direccionDetallada.trim();

        if (!recipientName.trim() || !recipientPhone.trim() || !isAddressValid || !mensajeTarjeta.trim() || !horaEntrega) {
          setShowErrors(true);
          alert("⚠️ Es obligatorio llenar todos los campos: Nombre y Celular del Destinatario, Dirección Completa de Despacho (Municipio, Localidad, Barrio y Dirección Detallada), Hora de Entrega y la Dedicatoria de la Tarjeta.");
          return;
        }
      }

      setShowErrors(false);
      setStep(3);
    }
  };

  const handlePrevStep = () => {
    if (step === 2) setStep(1);
    if (step === 3) setStep(2);
  };

  // Handle Receipt Upload Integration
  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReceiptError('');
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.match('image.*')) {
      setReceiptError('Solo se permiten imágenes (PNG, JPG, JPEG).');
      return;
    }

    setReceiptFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target && event.target.result) {
        try {
          const compressed = await compressImageBase64(event.target.result as string, 800, 800, 0.4);
          setReceiptBase64(compressed);
        } catch (err) {
          setReceiptBase64(event.target.result as string);
        }
      }
    };
    reader.onerror = () => {
      setReceiptError('Error leyendo el archivo. Por favor reintenta.');
    };
    reader.readAsDataURL(file);
  };

  const handleCheckoutComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptBase64) {
      setReceiptError('La subida de la captura del comprobante es obligatoria para verificar tu pedido.');
      return;
    }

    // Generate Custom Order ID based on Admin choices
    let idPrefix = 'LDL-';
    let idCounter = 1;
    if (isSupabaseConfigured) {
      const dbPrefix = await getConfig('id_prefix', 'LDL-');
      idPrefix = dbPrefix;
      idCounter = await incrementIdCounter();
    } else {
      idPrefix = localStorage.getItem('dulce_amanecer_id_prefix') || 'LDL-';
      const idCounterStr = localStorage.getItem('dulce_amanecer_id_counter') || '1';
      idCounter = parseInt(idCounterStr, 10) || 1;
      localStorage.setItem('dulce_amanecer_id_counter', String(idCounter + 1));
    }
    const formattedCounter = String(idCounter).padStart(5, '0');
    const orderID = `${idPrefix}${formattedCounter}`;
    setCreatedOrderID(orderID);

    const shipping: ShippingDetails = {
      buyerName,
      buyerPhone,
      buyerCedula,
      recipientName: multiAddress ? 'Múltiples Destinatarios' : recipientName,
      recipientPhone: multiAddress ? 'Múltiples Celulares' : recipientPhone,
      municipio: multiAddress ? 'Múltiples Municipios' : municipio,
      localidad: multiAddress ? 'Múltiples Localidades' : localidad,
      barrio: multiAddress ? 'Múltiples Barrios' : barrio,
      direccionDetallada: multiAddress ? 'Ver detalle de cada artículo abajo' : direccionDetallada,
      indicacionesAdicionales: multiAddress ? '' : indicacionesAdicionales,
      fechaEntrega,
      horaEntrega: multiAddress ? 'Múltiples Horarios' : horaEntrega,
      mensajeTarjeta: multiAddress ? 'Dedicatoria de cada artículo asignado individualmente' : mensajeTarjeta,
      cardPhotoUrl: cardPhotos[0]?.url || undefined,
      cardPhotoName: cardPhotos[0]?.name || undefined,
      cardPhotos: cardPhotos.length > 0 ? cardPhotos : undefined,
      locationLatLng: multiAddress ? undefined : locationLatLng,
      locationName: multiAddress ? undefined : locationName
    };

    const finalItems: CartItem[] = [];
    if (multiAddress) {
      individualUnits.forEach(unit => {
        const form = unitForms[unit.unitId] || {
          recipientName: recipientName || '',
          recipientPhone: recipientPhone || '',
          municipio: municipio || '',
          localidad: localidad || '',
          barrio: barrio || '',
          direccionDetallada: direccionDetallada || '',
          indicacionesAdicionales: indicacionesAdicionales || '',
          mensajeTarjeta: mensajeTarjeta || '',
          horaEntrega: horaEntrega || '09:00 AM - 11:00 AM',
          includeShipping: true,
          locationLatLng: undefined,
          locationName: ''
        };
        finalItems.push({
          product: unit.product,
          quantity: 1,
          customShipping: {
            recipientName: form.recipientName || recipientName || 'Destinatario',
            recipientPhone: form.recipientPhone || recipientPhone || 'No registra',
            municipio: form.municipio || municipio || 'BOGOTÁ',
            localidad: form.localidad || localidad || '',
            barrio: form.barrio || barrio || '',
            direccionDetallada: form.direccionDetallada || direccionDetallada || '',
            indicacionesAdicionales: form.indicacionesAdicionales || indicacionesAdicionales || '',
            mensajeTarjeta: form.mensajeTarjeta || mensajeTarjeta || 'Sorpresa',
            horaEntrega: form.horaEntrega || horaEntrega || '09:00 AM - 11:00 AM',
            includeShipping: form.includeShipping !== false,
            locationLatLng: form.locationLatLng,
            locationName: form.locationName
          }
        });
      });
    } else {
      finalItems.push(...cartItems);
    }

    const newOrder: Order = {
      id: orderID,
      shipping,
      items: finalItems,
      total,
      subtotal,
      shippingFee: valorEnvio,
      paymentReceiptUrl: receiptBase64,
      status: 'En Validación',
      createdAt: new Date().toISOString()
    };

    onSubmitOrder(newOrder);
    setStep(4);
  };

  // WhatsApp helper
  const getWhatsAppLink = () => {
    const loginLink = window.location.origin;
    const text = encodeURIComponent(
      `🔔 *NUEVA ORDEN DE PEDIDO GENERADA* 🔔\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📌 *ID del Pedido:* ${createdOrderID}\n` +
      `👤 *Comprador:* ${buyerName}\n` +
      `📞 *Teléfono Comprador:* ${buyerPhone}\n\n` +
      `🎁 *INFORMACIÓN DE ENTREGA:*\n` +
      `• *Para:* ${recipientName}\n` +
      `• *Teléfono Destinatario:* ${recipientPhone}\n` +
      `• *Fecha de Entrega:* ${fechaEntrega}\n` +
      `• *Hora de Entrega:* ${horaEntrega}\n` +
      `• *Municipio:* ${municipio}\n` +
      `• *Localidad:* ${localidad}\n` +
      `• *Barrio:* ${barrio}\n` +
      `• *Dirección Detallada:* ${direccionDetallada}\n` +
      (indicacionesAdicionales ? `• *Indicaciones:* ${indicacionesAdicionales}\n` : '') +
      (locationLatLng ? `• *Ubicación GPS Pin:* https://www.google.com/maps/search/?api=1&query=${locationLatLng.lat},${locationLatLng.lng}\n` : '') +
      `\n💰 *VALOR TOTAL Y DETALLES:*\n` +
      `• *Total Orden:* $${total.toLocaleString('es-CO')} COP\n` +
      `• *Servicio de Envío:* ${includeShipping ? '✓ Reparto Estándar ($12.000 COP fijos)' : '⏰ Pendiente coordinar cobertura y tarifa'}\n` +
      `• *Medio de Pago:* ${paymentMethod === 'pse' ? `PSE / Nequi / Daviplata (${pseBank})` : 'Transferencia Bancaria Directa'}\n` +
      (cardPhotos.length > 0 ? `• *Fotos Tarjeta:* ¹ ${cardPhotos.length} imagen(es) adjuntada(s)\n` : '') +
      `• *Dedicatoria:* _"${mensajeTarjeta}"_\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ *El comprobante de pago ya fue cargado exitosamente en la plataforma digital para su validación administrativa.*\n\n` +
      `🔗 *Acceso Directo al Panel para Despacho:*\n` +
      `${loginLink}\n` +
      `(_Ingresa con tu usuario y contraseña asignada_)`
    );
    return `https://wa.me/573138005702?text=${text}`;
  };

  return (
    <div id="checkout-container" className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 max-w-4xl mx-auto my-6">
      {/* Steps indicator */}
      <div id="checkout-steps" className="bg-slate-50 border-b border-sage-light/20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-sans font-bold text-slate-800">Proceso de Pedido</span>
        </div>
        <div className="flex gap-1.5 items-center">
          <span className={`w-3 h-3 rounded-full ${step >= 1 ? 'bg-sage-primary' : 'bg-slate-200'}`}></span>
          <span className="w-4 h-0.5 bg-slate-200"></span>
          <span className={`w-3 h-3 rounded-full ${step >= 2 ? 'bg-sage-primary' : 'bg-slate-200'}`}></span>
          <span className="w-4 h-0.5 bg-slate-200"></span>
          <span className={`w-3 h-3 rounded-full ${step >= 3 ? 'bg-sage-primary' : 'bg-slate-200'}`}></span>
          <span className="w-4 h-0.5 bg-slate-200"></span>
          <span className={`w-3 h-3 rounded-full ${step >= 4 ? 'bg-green-500' : 'bg-slate-200'}`}></span>
        </div>
      </div>

      <div className="p-6 md:p-10 font-sans">
        {/* Step 1: Shopping Cart Review */}
        {step === 1 && (
          <div id="checkout-step-1" className="space-y-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-sage-light/20 pb-3">
              <span>🛒</span> Revisar tu carrito de compras
            </h3>
            {cartItems.length === 0 ? (
              <div className="text-center py-10 space-y-4">
                <p className="text-slate-500">Aún no has agregado productos al carrito.</p>
                <button
                  onClick={onClose}
                  className="bg-sage-primary hover:bg-earth-brown text-white text-sm px-6 py-2.5 rounded-full transition cursor-pointer"
                >
                  Explorar Catálogo
                </button>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto pr-2">
                  {cartItems.map((item) => (
                    <div key={item.product.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-50 last:border-0 pb-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={item.product.image}
                          alt={item.product.name}
                          className="w-14 h-14 object-cover rounded-xl border border-slate-100 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <h4 className="font-semibold text-slate-800 text-sm sm:text-base leading-tight">{item.product.name}</h4>
                          {getProductDiscount(item.product, categoryDiscounts) > 0 ? (
                            <div className="flex flex-col">
                              <span className="text-[10px] line-through text-slate-400 font-bold">
                                ${item.product.price.toLocaleString('es-CO')} COP
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5 animate-pulse">
                                <span className="text-xs sm:text-sm text-rose-600 font-black">
                                  ${getProductEffectivePrice(item.product, categoryDiscounts).toLocaleString('es-CO')} COP
                                </span>
                                <span className="bg-rose-50 text-rose-700 font-black text-[8px] px-1.5 py-0.5 rounded-full border border-rose-100">
                                  -{getProductDiscount(item.product, categoryDiscounts)}% OFF
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs sm:text-sm text-sage-primary font-medium mt-0.5">${item.product.price.toLocaleString('es-CO')} COP</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t border-dashed border-slate-100 sm:border-t-0">
                        <div className="flex items-center border border-slate-200 rounded-full py-1 px-3 bg-slate-50">
                          <button
                            id={`qty-dec-${item.product.id}`}
                            onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                            className="text-slate-500 px-1 hover:text-sage-primary font-bold transition cursor-pointer text-xs"
                          >
                            -
                          </button>
                          <span className="px-3 text-slate-800 font-medium text-xs sm:text-sm">{item.quantity}</span>
                          <button
                            id={`qty-inc-${item.product.id}`}
                            onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}
                            className="text-slate-500 px-1 hover:text-sage-primary font-bold transition cursor-pointer text-xs"
                          >
                            +
                          </button>
                        </div>
                        <button
                          id={`qty-remove-${item.product.id}`}
                          onClick={() => onRemoveItem(item.product.id)}
                          className="text-slate-400 hover:text-red-500 transition p-1.5 rounded-full hover:bg-slate-50"
                          title="Eliminar de mi orden"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Subtotals info */}
                <div className="bg-peach-light/20 p-4 rounded-2xl border border-sage-light/20 space-y-2">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Subtotal de productos:</span>
                    <span className="font-semibold text-slate-800">${subtotal.toLocaleString('es-CO')} COP</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between text-sm text-slate-600 border-t border-sage-light/10 pt-2 mt-1">
                    <span>Costo del envío (Bogotá/Soacha):</span>
                    <span className="font-semibold text-slate-800 text-right">Entre $10.000 y $15.000 COP *</span>
                  </div>
                  <p className="text-[11px] text-slate-500 italic mt-1 leading-relaxed">
                    * El valor definitivo del domicilio depende de la dirección exacta de entrega y será coordinado de mutuo acuerdo con nosotros vía WhatsApp al finalizar la orden.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 border-t border-slate-50">
                  <button
                    onClick={onClose}
                    type="button"
                    className="text-slate-500 hover:text-slate-700 font-semibold text-xs sm:text-sm py-2 sm:py-0 transition cursor-pointer text-center"
                  >
                    Seguir Comprando
                  </button>
                  <button
                    onClick={handleNextStep}
                    type="button"
                    className="bg-sage-primary hover:bg-earth-brown text-white font-semibold text-xs sm:text-sm px-5 sm:px-6 py-2.5 sm:py-3 rounded-full flex items-center justify-center gap-2 transform active:scale-95 transition cursor-pointer"
                  >
                    Ingresar Información de Envío
                    <ChevronRight size={14} className="sm:size-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2: Shipping, Logistics & Card Message */}
        {step === 2 && (
          <div id="checkout-step-2" className="space-y-6">
            <div className="flex items-center justify-between border-b border-sage-light/20 pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <MapPin size={20} className="text-sage-primary" />
                <span>Datos de Envío y Fecha Logística</span>
              </h3>
              <span className="bg-peach-light text-earth-brown text-xs font-semibold py-1 px-2.5 rounded-full border border-sage-light/10">
                Mínimo 3 días de anticipación
              </span>
            </div>

            {showErrors && (
              <div id="missing-fields-alert" className="bg-red-50 border border-red-200 p-4 rounded-2xl text-red-800 text-xs flex items-start gap-2.5 animate-fadeIn shadow-2xs font-sans">
                <span className="text-base select-none">⚠️</span>
                <div>
                  <p className="font-bold text-sm">Faltan llenar algunos espacios obligatorios</p>
                  <p className="mt-1 leading-relaxed text-slate-705">
                    Es necesario rellenar todos los espacios y campos marcados con un asterisco (<strong>*</strong>) antes de poder proceder al pago. Hemos resaltado en rojo los campos que hacen falta.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Buyer section */}
              <div className="space-y-4 bg-slate-50/60 p-5 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider mb-2">Comprador (Quien paga)</h4>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nombre Completo * {showErrors && !buyerName.trim() && <span className="text-red-650 font-bold">(Requerido)</span>}
                  </label>
                  <input
                    type="text"
                    required
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className={`w-full bg-white border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                      showErrors && !buyerName.trim()
                        ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                        : 'border-slate-200 focus:ring-sage-primary'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Cédula / Identificación * {showErrors && !buyerCedula.trim() && <span className="text-red-650 font-bold">(Requerido)</span>}
                  </label>
                  <input
                    type="text"
                    required
                    value={buyerCedula}
                    onChange={(e) => setBuyerCedula(e.target.value)}
                    placeholder="Ej. 1016016370"
                    className={`w-full bg-white border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                      showErrors && !buyerCedula.trim()
                        ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                        : 'border-slate-200 focus:ring-sage-primary'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Teléfono o Celular * {showErrors && !buyerPhone.trim() && <span className="text-red-650 font-bold">(Requerido)</span>}
                  </label>
                  <input
                    type="tel"
                    required
                    value={buyerPhone}
                    onChange={(e) => setBuyerPhone(e.target.value)}
                    placeholder="Ej. 3123456789"
                    className={`w-full bg-white border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                      showErrors && !buyerPhone.trim()
                        ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                        : 'border-slate-200 focus:ring-sage-primary'
                    }`}
                  />
                </div>
              </div>

              {/* ANTICIPATION TIME RESTRICTION */}
              <div className="bg-[#F5EBE0]/30 p-5 rounded-2xl border border-sage-light/20 space-y-3">
                <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Calendar size={18} className="text-earth-brown" />
                  <span>Programación de Entrega *</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Debido a la preparación artesanal de los alimentos de sorpresa, y frescura de las rosas, los pedidos requieren <strong>mínimo 3 días de anticipación</strong>. El calendario bloquea hoy y los 2 días contiguos.
                </p>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Seleccionar Fecha de Entrega * {showErrors && !fechaEntrega && <span className="text-red-650 font-bold">(Requerido)</span>}
                  </label>
                  <input
                    type="date"
                    id="input-fecha-entrega"
                    required
                    min={minDateLimit}
                    value={fechaEntrega}
                    onChange={(e) => setFechaEntrega(e.target.value)}
                    className={`w-full bg-white border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                      showErrors && !fechaEntrega
                        ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                        : 'border-slate-200 focus:ring-sage-primary'
                    }`}
                  />
                  {fechaEntrega && (
                    <p className="text-xs text-green-600 font-semibold mt-1">
                      ✓ Fecha asignada con debida antelación logística de preparación.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* MULTI-ADDRESS TOGGLE IF MORE THAN 2 PRODUCTS */}
            {hasMoreThanTwoProducts && (
              <div className="bg-peach-light/20 p-5 rounded-2xl border border-sage-light/25 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5 text-sage-primary">
                      <span>📦📦</span> ¿Diferentes direcciones para tus productos?
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Tu carrito contiene <strong>{totalQuantity}</strong> productos. Puedes enviarlos todos a la misma dirección, o capturar direcciones y dedicatorias de tarjeta diferentes para cada uno de forma individual.
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setMultiAddress(false)}
                    className={`p-3 text-center text-xs sm:text-sm font-bold rounded-xl border transition cursor-pointer flex items-center justify-center gap-2 ${
                      !multiAddress
                        ? 'bg-sage-primary text-white border-sage-primary shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    🏠 Todo a la misma dirección
                  </button>
                  <button
                    type="button"
                    onClick={() => setMultiAddress(true)}
                    className={`p-3 text-center text-xs sm:text-sm font-bold rounded-xl border transition cursor-pointer flex items-center justify-center gap-2 ${
                      multiAddress
                        ? 'bg-sage-primary text-white border-sage-primary shadow-xs'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    🚚 Enviar a direcciones / destinatarios separados
                  </button>
                </div>
              </div>
            )}

            {/* CONDITIONAL RENDER: SPLIT SHIPPING DETAILS VS SINGLE SHIPPING DETAIL */}
            {multiAddress ? (
              <div className="space-y-6">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider border-b border-dashed border-slate-200 pb-2">
                  Configuración de Envíos Separados ({individualUnits.length} Productos)
                </h3>
                {individualUnits.map((unit) => {
                  const uForm = unitForms[unit.unitId] || {
                    recipientName: '',
                    recipientPhone: '',
                    municipio: '',
                    localidad: '',
                    barrio: '',
                    direccionDetallada: '',
                    indicacionesAdicionales: '',
                    mensajeTarjeta: '',
                    horaEntrega: '09:00 AM - 11:00 AM',
                    includeShipping: true
                  };

                  const uLocalidadesList = uForm.municipio 
                    ? Object.keys(DIVIPOLA_DATA[uForm.municipio as keyof typeof DIVIPOLA_DATA] || {}) 
                    : [];
                  const uBarriosList = (uForm.municipio && uForm.localidad) 
                    ? (DIVIPOLA_DATA[uForm.municipio as keyof typeof DIVIPOLA_DATA]?.[uForm.localidad] || []) 
                    : [];

                  return (
                    <div key={unit.unitId} className="bg-white border-2 border-sage-primary/15 rounded-3xl p-5 space-y-4 shadow-sm relative">
                      <div className="flex items-center gap-2 bg-sage-primary/5 -mx-5 -mt-5 p-4 rounded-t-3xl border-b border-sage-primary/15 text-sage-primary font-bold text-sm">
                        <span>🎁</span>
                        <span>{unit.displayName}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Nombre del destinatario * {showErrors && !uForm.recipientName.trim() && <span className="text-red-650 font-bold">(Requerido)</span>}
                          </label>
                          <input
                            type="text"
                            value={uForm.recipientName}
                            onChange={(e) => updateUnitField(unit.unitId, 'recipientName', e.target.value)}
                            placeholder="Nombre de quien recibe"
                            className={`w-full bg-white border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                              showErrors && !uForm.recipientName.trim()
                                ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                                : 'border-slate-200 focus:ring-sage-primary'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Celular del destinatario * {showErrors && !uForm.recipientPhone.trim() && <span className="text-red-650 font-bold">(Requerido)</span>}
                          </label>
                          <input
                            type="tel"
                            value={uForm.recipientPhone}
                            onChange={(e) => updateUnitField(unit.unitId, 'recipientPhone', e.target.value)}
                            placeholder="Celular para coordinar"
                            className={`w-full bg-white border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                              showErrors && !uForm.recipientPhone.trim()
                                ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                                : 'border-slate-200 focus:ring-sage-primary'
                            }`}
                          />
                        </div>
                      </div>

                      <label className="flex items-center gap-3 p-3 bg-slate-50/80 rounded-xl cursor-pointer select-none transition border border-dashed border-slate-200">
                        <input
                          type="checkbox"
                          checked={uForm.includeShipping !== false}
                          onChange={(e) => updateUnitField(unit.unitId, 'includeShipping', e.target.checked)}
                          className="w-4 h-4 text-sage-primary focus:ring-sage-primary border-slate-300 rounded cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-bold text-slate-805 block">
                            Incluir servicio de domicilio (+ $12.000 COP fijos) para este artículo
                          </span>
                        </div>
                      </label>

                      {uForm.includeShipping !== false ? (
                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Municipio * {showErrors && !uForm.municipio && <span className="text-red-650 font-bold">(Requerido)</span>}
                              </label>
                              <select
                                value={uForm.municipio}
                                onChange={(e) => {
                                  updateUnitField(unit.unitId, 'municipio', e.target.value);
                                  updateUnitField(unit.unitId, 'localidad', '');
                                  updateUnitField(unit.unitId, 'barrio', '');
                                }}
                                className={`w-full bg-white border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 transition ${
                                  showErrors && !uForm.municipio
                                    ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                                    : 'border-slate-200 focus:ring-sage-primary'
                                }`}
                              >
                                <option value="">-- Seleccionar --</option>
                                {Object.keys(DIVIPOLA_DATA).map((mun) => (
                                  <option key={mun} value={mun}>{mun}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Localidad * {showErrors && !uForm.localidad && <span className="text-red-650 font-bold">(Requerido)</span>}
                              </label>
                              <select
                                disabled={!uForm.municipio}
                                value={uForm.localidad}
                                onChange={(e) => {
                                  updateUnitField(unit.unitId, 'localidad', e.target.value);
                                  updateUnitField(unit.unitId, 'barrio', '');
                                }}
                                className={`w-full bg-white border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 transition disabled:bg-slate-100 disabled:text-slate-400 ${
                                  showErrors && !uForm.localidad
                                    ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                                    : 'border-slate-200 focus:ring-sage-primary'
                                }`}
                              >
                                <option value="">-- Seleccionar --</option>
                                {uLocalidadesList.map((loc) => (
                                  <option key={loc} value={loc}>{loc}</option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Barrio * {showErrors && !uForm.barrio && <span className="text-red-650 font-bold">(Requerido)</span>}
                              </label>
                              <select
                                disabled={!uForm.localidad}
                                value={uForm.barrio}
                                onChange={(e) => updateUnitField(unit.unitId, 'barrio', e.target.value)}
                                className={`w-full bg-white border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 transition disabled:bg-slate-100 disabled:text-slate-400 ${
                                  showErrors && !uForm.barrio
                                    ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                                    : 'border-slate-200 focus:ring-sage-primary'
                                }`}
                              >
                                <option value="">-- Seleccionar --</option>
                                {uBarriosList.map((bar) => (
                                  <option key={bar} value={bar}>{bar}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-semibold text-slate-600 mb-1">
                                Dirección Detallada * {showErrors && !uForm.direccionDetallada.trim() && <span className="text-red-650 font-bold">(Requerido)</span>}
                              </label>
                              <input
                                type="text"
                                value={uForm.direccionDetallada}
                                onChange={(e) => updateUnitField(unit.unitId, 'direccionDetallada', e.target.value)}
                                placeholder="Ej. Calle 140 # 12 - 45"
                                className={`w-full bg-white border rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 transition ${
                                  showErrors && !uForm.direccionDetallada.trim()
                                    ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                                    : 'border-slate-200 focus:ring-sage-primary'
                                }`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1">Indicaciones</label>
                              <input
                                type="text"
                                value={uForm.indicacionesAdicionales}
                                onChange={(e) => updateUnitField(unit.unitId, 'indicacionesAdicionales', e.target.value)}
                                placeholder="Ej. Apto 402, vigilante"
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sage-primary transition"
                              />
                            </div>
                          </div>

                          {/* Mappicker for individual gift shipment */}
                          <div className="pt-2 border-t border-slate-100 mt-2">
                            <MapPicker
                              municipio={uForm.municipio || ''}
                              localidad={uForm.localidad || ''}
                              barrio={uForm.barrio || ''}
                              direccionDetallada={uForm.direccionDetallada || ''}
                              value={uForm.locationLatLng}
                              onChange={(latlng, desc) => {
                                updateUnitField(unit.unitId, 'locationLatLng', latlng);
                                updateUnitField(unit.unitId, 'locationName', desc);
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100 text-[11px] text-amber-900">
                          🚚 <strong>Envío a coordinar con el vendedor</strong>. La entrega de este artículo será coordinada directamente para validar cobertura y costo estimado del reparto.
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Mensaje de Dedicatoria Personalizada * {showErrors && !uForm.mensajeTarjeta.trim() && <span className="text-red-650 font-bold">(Requerido)</span>}
                          </label>
                          <textarea
                            value={uForm.mensajeTarjeta}
                            onChange={(e) => updateUnitField(unit.unitId, 'mensajeTarjeta', e.target.value)}
                            placeholder="Ej. '¡Feliz día hermosa! Te amo...'"
                            rows={2}
                            className={`w-full bg-white border rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 transition ${
                              showErrors && !uForm.mensajeTarjeta.trim()
                                ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                                : 'border-slate-200 focus:ring-sage-primary'
                            }`}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                            Rango de Hora de Entrega Solicitado *
                          </label>
                          <select
                            value={uForm.horaEntrega}
                            onChange={(e) => updateUnitField(unit.unitId, 'horaEntrega', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sage-primary transition"
                          >
                            <option value="07:00 AM - 09:00 AM">07:00 AM - 09:00 AM (Desayuno Temprano)</option>
                            <option value="09:00 AM - 11:00 AM">09:00 AM - 11:00 AM (Mañana Media)</option>
                            <option value="11:00 AM - 01:00 PM">11:00 AM - 01:00 PM (Almuerzo)</option>
                            <option value="01:00 PM - 03:00 PM">01:00 PM - 03:00 PM (Tarde Temprana)</option>
                            <option value="03:00 PM - 05:00 PM">03:00 PM - 05:00 PM (Tarde)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Recipient section */}
                  <div className="space-y-4 bg-peach-light/10 p-5 rounded-2xl border border-sage-light/10">
                    <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider mb-2">Destinatario (Quien recibe)</h4>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Nombre de quien Recibe * {showErrors && !recipientName.trim() && <span className="text-red-600 font-bold">(Requerido)</span>}
                      </label>
                      <input
                        type="text"
                        required={!multiAddress}
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="Ej. María Gómez"
                        className={`w-full bg-white border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                          showErrors && !recipientName.trim()
                            ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                            : 'border-slate-200 focus:ring-sage-primary'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Teléfono Móvil Destinatario * {showErrors && !recipientPhone.trim() && <span className="text-red-600 font-bold">(Requerido)</span>}
                      </label>
                      <input
                        type="tel"
                        required={!multiAddress}
                        value={recipientPhone}
                        onChange={(e) => setRecipientPhone(e.target.value)}
                        placeholder="Ej. 3159876543 (Importante para coordinar entrega)"
                        className={`w-full bg-white border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                          showErrors && !recipientPhone.trim()
                            ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                            : 'border-slate-200 focus:ring-sage-primary'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Single Delivery Hour slot */}
                  <div className="space-y-4 bg-slate-50/60 p-5 rounded-2xl border border-slate-100">
                    <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider mb-2">Hora de Entrega Deseada</h4>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Rango de Hora de Entrega *
                      </label>
                      <select
                        id="select-single-hora-entrega"
                        required={!multiAddress}
                        value={horaEntrega}
                        onChange={(e) => setHoraEntrega(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-primary transition"
                      >
                        <option value="07:00 AM - 09:00 AM">07:00 AM - 09:00 AM (Desayuno Temprano)</option>
                        <option value="09:00 AM - 11:00 AM">09:00 AM - 11:00 AM (Mañana Media)</option>
                        <option value="11:00 AM - 01:00 PM">11:00 AM - 01:00 PM (Almuerzo)</option>
                        <option value="01:00 PM - 03:00 PM">01:00 PM - 03:00 PM (Tarde Temprana)</option>
                        <option value="03:00 PM - 05:00 PM">03:00 PM - 05:00 PM (Tarde)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* OPCIÓN COURIER / DOMICILIO */}
                <div className="bg-sage-primary/5 p-5 rounded-2xl border border-sage-primary/20 space-y-3">
                  <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider flex items-center gap-2">
                    <span>🚚</span> Servicio de Reparto y Domicilio Adicional
                  </h4>
                  <p className="text-xs text-slate-500">
                    Selecciona si deseas incluir el despacho especializado directamente a la puerta del destinatario.
                  </p>
                  <label id="shipping-toggle-label" className="flex items-center gap-3 p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer select-none transition shadow-2xs">
                    <input
                      type="checkbox"
                      id="checkbox-include-shipping"
                      checked={includeShipping}
                      onChange={(e) => setIncludeShipping(e.target.checked)}
                      className="w-4 h-4 text-sage-primary focus:ring-sage-primary border-slate-300 rounded cursor-pointer"
                    />
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-slate-850 block">
                        ¡Sí! Incluir servicio de domicilio por un valor fijo de $12.000 COP
                      </span>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        Se añade al total del pedido. Ofrecemos cobertura e ingeniosa entrega puerta a puerta en Bogotá y Soacha.
                      </span>
                    </div>
                  </label>
                </div>

                {/* DIVIPOLA INTER-DEPENDENT DROPDOWNS */}
                <div className="bg-slate-50/40 p-5 rounded-2xl border border-slate-100 space-y-4">
                  <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider flex items-center gap-2">
                    <span>📍</span> Dirección Obligatoria de Despacho (Bogotá y Soacha)
                  </h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Por favor, selecciona tu ubicación exacta. El diligenciamiento de Municipio, Localidad o Zona, Barrio y Dirección Detallada es **completamente obligatorio** para todos los pedidos para evitar errores de programación.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Municipio * {showErrors && !municipio && <span className="text-red-650 font-bold">(Requerido)</span>}
                      </label>
                      <select
                        id="select-municipio"
                        required
                        value={municipio}
                        onChange={(e) => setMunicipio(e.target.value)}
                        className={`w-full bg-white border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                          showErrors && !municipio
                            ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                            : 'border-slate-200 focus:ring-sage-primary'
                        }`}
                      >
                        <option value="">-- Seleccionar --</option>
                        {Object.keys(DIVIPOLA_DATA).map((mun) => (
                          <option key={mun} value={mun}>{mun}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Localidad o Zona * {showErrors && !localidad && <span className="text-red-650 font-bold">(Requerido)</span>}
                      </label>
                      <select
                        id="select-localidad"
                        required
                        disabled={!municipio}
                        value={localidad}
                        onChange={(e) => setLocalidad(e.target.value)}
                        className={`w-full bg-white border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 transition disabled:bg-slate-100 disabled:text-slate-400 ${
                          showErrors && !localidad
                            ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                            : 'border-slate-200 focus:ring-sage-primary'
                        }`}
                      >
                        <option value="">-- Seleccionar --</option>
                        {localidadesList.map((loc) => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Barrio * {showErrors && !barrio && <span className="text-red-650 font-bold">(Requerido)</span>}
                      </label>
                      <select
                        id="select-barrio"
                        required
                        disabled={!localidad}
                        value={barrio}
                        onChange={(e) => setBarrio(e.target.value)}
                        className={`w-full bg-white border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 transition disabled:bg-slate-100 disabled:text-slate-400 ${
                          showErrors && !barrio
                            ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                            : 'border-slate-200 focus:ring-sage-primary'
                        }`}
                      >
                        <option value="">-- Seleccionar --</option>
                        {barriosList.map((bar) => (
                          <option key={bar} value={bar}>{bar}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Dirección Detallada (Calle, Carrera, Conjunto, Apto) * {showErrors && !direccionDetallada.trim() && <span className="text-red-650 font-bold">(Requerido)</span>}
                      </label>
                      <input
                        type="text"
                        required
                        value={direccionDetallada}
                        onChange={(e) => setDireccionDetallada(e.target.value)}
                        placeholder="Ej. Calle 140 # 12 - 45 Torre 3 Apt 402"
                        className={`w-full bg-white border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                          showErrors && !direccionDetallada.trim()
                            ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                            : 'border-slate-200 focus:ring-sage-primary'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Indicaciones Adicionales</label>
                      <input
                        type="text"
                        value={indicacionesAdicionales}
                        onChange={(e) => setIndicacionesAdicionales(e.target.value)}
                        placeholder="Ej. Timbrar en portería"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sage-primary transition"
                      />
                    </div>
                  </div>

                  {/* MAP LOCATION PICKER INTEGRATION */}
                  <div className="pt-2 border-t border-slate-150">
                    <MapPicker
                      municipio={municipio}
                      localidad={localidad}
                      barrio={barrio}
                      direccionDetallada={direccionDetallada}
                      value={locationLatLng}
                      onChange={(latlng, desc) => {
                        setLocationLatLng(latlng);
                        setLocationName(desc);
                      }}
                    />
                  </div>
                </div>

                {!includeShipping && (
                  <div id="no-shipping-banner" className="bg-[#FFFDF4] border border-amber-250/60 p-5 rounded-2xl flex items-start gap-3 text-xs text-amber-900 leading-relaxed shadow-xs">
                    <span className="text-base select-none">🚚</span>
                    <div>
                      <h5 className="font-bold text-sm text-slate-800">Coordinación de Envío Particular</h5>
                      <p className="mt-1 text-slate-600">
                        Has elegido no seleccionar el servicio de reparto estándar coordinado por $12.000 COP fijos. Deberás coordinar el costo o recargo final de tu envío con el vendedor según cobertura. No obstante, **es obligatorio mantener la dirección de arriba diligenciada** para que el vendedor pueda cotizar correctamente la ruta de tu obsequio.
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-peach-light/20 p-5 rounded-2xl border border-sage-light/10 space-y-3">
                  <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider flex items-center gap-2">
                    <Gift size={18} className="text-terracotta" />
                    <span>Mensaje de la Tarjeta de Regalo *</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    Tu detalle incluye una tarjeta de felicitación premium personalizada con tu dedicatoria especial y las fotos físicas que adjuntes.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Contenido de la dedicatoria * {showErrors && !mensajeTarjeta.trim() && <span className="text-red-650 font-bold">(Requerido)</span>}
                    </label>
                    <textarea
                      required={!multiAddress}
                      value={mensajeTarjeta}
                      onChange={(e) => setMensajeTarjeta(e.target.value)}
                      placeholder="Ej: 'Feliz Cumpleaños Mamita hermosa, gracias por iluminar mi vida con tu sonrisa dulce. Te amo infinitamente, con amor, tu hijo.'"
                      rows={3}
                      className={`w-full bg-white border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 transition ${
                        showErrors && !mensajeTarjeta.trim()
                          ? 'border-red-500 ring-2 ring-red-100 bg-red-50/10'
                          : 'border-slate-200 focus:ring-sage-primary'
                      }`}
                    />
                  </div>

                  {/* Custom Card Photo Recommendation */}
                  <div className="pt-4 border-t border-slate-100 mt-4 space-y-3 font-sans">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>📸 ¿Deseas añadir fotos físicas a tu tarjeta? (Opcional)</span>
                        <span className="text-[10px] text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                          {cardPhotos.length} / 5 Imágenes
                        </span>
                      </label>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                        Puedes adjuntar **hasta 5 fotos** que imprimiremos en papel fotográfico de alta calidad para colocarlas de manera personalizada y decorativa dentro de tu tarjeta de regalo.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <label 
                          className={`cursor-pointer bg-white border font-bold text-[11px] px-4 py-2 rounded-xl transition inline-flex items-center gap-2 shadow-xs ${
                            cardPhotos.length >= 5
                              ? 'opacity-50 pointer-events-none text-slate-400 border-slate-200 bg-slate-50'
                              : 'text-sage-primary border-slate-250 hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          ➕ Agregar Fotos/Imágenes
                          <input
                            type="file"
                            id="card-photo-file-input"
                            accept="image/*"
                            multiple
                            disabled={cardPhotos.length >= 5}
                            onChange={handleCardPhotoChange}
                            className="hidden"
                          />
                        </label>
                        {cardPhotos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setCardPhotos([])}
                            className="text-xs font-bold text-red-650 hover:underline cursor-pointer"
                          >
                            Eliminar todas ({cardPhotos.length})
                          </button>
                        )}
                      </div>

                      {cardPhotoError && (
                        <p className="text-[11px] text-red-650 font-semibold bg-red-50 p-2.5 rounded-xl border border-red-100">{cardPhotoError}</p>
                      )}

                      {/* Photo Previews Grid */}
                      {cardPhotos.length > 0 && (
                        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-3 pt-1">
                          {cardPhotos.map((photo, i) => (
                            <div key={i} className="group border border-slate-200 rounded-2xl overflow-hidden relative shadow-xs bg-slate-50 aspect-square flex flex-col justify-between">
                              <img
                                src={photo.url}
                                alt={`Tarjeta Foto ${i + 1}`}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1 truncate text-center">
                                <span className="text-[8px] text-white/90 font-medium truncate block" title={photo.name}>
                                  {photo.name}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeCardPhoto(i)}
                                className="absolute top-1.5 right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-extrabold shadow-sm transition active:scale-90 cursor-pointer"
                                title="Eliminar imágen"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Total recap */}
            <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <button
                type="button"
                onClick={handlePrevStep}
                className="text-slate-500 hover:text-slate-700 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer py-2 sm:py-0"
              >
                <ArrowLeft size={14} className="sm:size-4" />
                Regresar al Carrito
              </button>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="text-center sm:text-right bg-slate-50 sm:bg-transparent p-2 md:p-0 rounded-xl border border-slate-100 sm:border-0">
                  <span className="text-[10px] sm:text-xs text-slate-400 block sm:inline mr-1 sm:mr-0">Total con Envío:</span>
                  <span className="text-sm sm:text-xl font-bold text-sage-primary font-sans">
                    ${total.toLocaleString('es-CO')} COP
                  </span>
                </div>
                <button
                  type="button"
                  id="btn-goto-payment"
                  onClick={handleNextStep}
                  className="bg-sage-primary hover:bg-earth-brown text-white font-semibold text-xs sm:text-sm px-5 sm:px-6 py-2.5 sm:py-3 rounded-full flex items-center justify-center gap-2 transform active:scale-95 transition cursor-pointer w-full sm:w-auto"
                >
                  Proceder al Pago
                  <ChevronRight size={14} className="sm:size-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Direct Transfer & Receipt Upload (MANDATORY) */}
        {step === 3 && (
          <form id="checkout-step-3" onSubmit={handleCheckoutComplete} className="space-y-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-sage-light/20 pb-3">
              <CreditCard size={20} className="text-sage-primary" />
              <span>Instrucciones de Pago y Confirmación</span>
            </h3>

            {/* MÉTODOS DE PAGO: SELECTOR */}
            <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100 rounded-2xl border border-slate-200/50">
              <button
                type="button"
                id="btn-pay-method-transfer"
                onClick={() => setPaymentMethod('transfer')}
                className={`py-3 px-4 text-center text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 ${
                  paymentMethod === 'transfer'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                }`}
              >
                🏦 Transferencia Directa
              </button>
              <button
                type="button"
                id="btn-pay-method-pse"
                onClick={() => setPaymentMethod('pse')}
                className={`py-3 px-4 text-center text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 ${
                  paymentMethod === 'pse'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
                }`}
              >
                <span className="bg-[#FF9900] text-slate-950 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-tighter">pse</span>
                Pago Seguro Electrónico
              </button>
            </div>

            {paymentMethod === 'transfer' ? (
              <>
                <p className="text-sm text-slate-600 leading-relaxed font-sans">
                  Para garantizar el despacho de tu pedido, realiza la transferencia del total exacto (<strong>${total.toLocaleString('es-CO')} COP</strong>) a cualquiera de nuestras cuentas autorizadas, y <strong>sube el soporte de pago de forma obligatoria</strong> mediante el formulario inferior.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border border-slate-100 bg-emerald-50/20 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase">Nequi</span>
                      <h4 className="font-bold text-xl text-slate-800 mt-2">315 778 9524</h4>
                      <p className="text-xs text-slate-500 mt-1">Celular de transferencia directa sin costo</p>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 mt-4">Titular: Los Detallitos de Lupe S.A.S</p>
                  </div>

                  <div className="border border-slate-100 bg-peach-light/25 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <span className="bg-peach-light text-earth-brown text-[10px] font-bold px-2 py-0.5 rounded-md uppercase border border-sage-light/10">DaviPlata</span>
                      <h4 className="font-bold text-xl text-slate-800 mt-2">315 778 9524</h4>
                      <p className="text-xs text-slate-500 mt-1">Monedero digital Davivienda</p>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 mt-4">Titular: Los Detallitos de Lupe S.A.S</p>
                  </div>

                  <div className="border border-slate-100 bg-sky-50/20 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <span className="bg-sky-100 text-sky-800 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase">Bancolombia</span>
                      <h4 className="font-bold text-base text-slate-800 mt-2">741-258-963-02</h4>
                      <p className="text-xs text-slate-500">Cuenta de Ahorros Recaudos</p>
                    </div>
                    <div className="mt-4 text-[10px] text-slate-500">
                      <p className="font-semibold text-slate-600">NIT: 901.345.678-9</p>
                      <p>Los Detallitos de Lupe S.A.S.</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4 bg-[#F2F8FF]/80 p-5 rounded-2xl border border-blue-200/50">
                <div className="flex items-center gap-3">
                  <span className="bg-[#002F6C] text-white font-black px-2.5 py-1 rounded-lg text-xs uppercase tracking-wider select-none">
                    ach pse
                  </span>
                  <div>
                    <h4 className="font-bold text-slate-850 text-sm">Pasarela de Pago Seguro PSE</h4>
                    <p className="text-xs text-slate-500">Autoriza transacciones inmediatas desde tu cuenta de ahorros, corriente o billetera.</p>
                  </div>
                </div>

                {!pseCompleted ? (
                  <div className="space-y-4 pt-4 border-t border-blue-205/30">
                    <p className="text-xs text-slate-600 leading-relaxed font-sans">
                      Ingresa tus datos registrados para simular la conexión oficial de la pasarela de pagos ACH PSE con el comercio <strong>Los Detallitos de Lupe</strong>. El total a debitar es de <strong>${total.toLocaleString('es-CO')} COP</strong> {includeShipping && <span className="font-bold text-sage-primary">(Incluye domicilio fijos de $12.000 COP)</span>}.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Entidad Financiera (Banco) *</label>
                        <select
                          required={paymentMethod === 'pse'}
                          value={pseBank}
                          onChange={(e) => setPseBank(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                        >
                          <option value="">-- Elige tu Banco --</option>
                          <option value="Nequi">Nequi</option>
                          <option value="DaviPlata">DaviPlata</option>
                          <option value="Bancolombia">Bancolombia (Ahorros o Corriente)</option>
                          <option value="Davivienda">Banco Davivienda</option>
                          <option value="Banco de Bogota">Banco de Bogotá</option>
                          <option value="BBVA Colombia">BBVA Colombia</option>
                          <option value="Lulo Bank">Lulo Bank</option>
                          <option value="RappiPay">RappiPay Davivienda</option>
                          <option value="Banco de Occidente">Banco de Occidente</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tipo de Persona *</label>
                        <select
                          value={pseUserType}
                          onChange={(e) => setPseUserType(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                        >
                          <option value="natural">Persona Natural</option>
                          <option value="juridica">Persona Jurídica</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Correo Electrónico Registrado en PSE *</label>
                      <input
                        type="email"
                        required={paymentMethod === 'pse'}
                        placeholder="ejemplo@correo.com"
                        value={pseEmail}
                        onChange={(e) => setPseEmail(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                      />
                    </div>

                    <button
                      type="button"
                      id="btn-simulate-pse"
                      onClick={() => {
                        if (!pseBank) {
                          alert("⚠️ Por favor selecciona una Entidad Financiera (Banco).");
                          return;
                        }
                        if (!pseEmail.trim() || !pseEmail.includes('@')) {
                          alert("⚠️ Por favor ingresa un dirección de correo registrada en el registro de PSE.");
                          return;
                        }
                        const reference = "PSE-" + Math.floor(100000 + Math.random() * 900000);
                        setPseTransReference(reference);
                        
                        // Let's formulate a nice simulated success receipt image over a hidden Canvas element
                        const canvas = document.createElement('canvas');
                        canvas.width = 400;
                        canvas.height = 300;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                          ctx.fillStyle = '#0F172A'; 
                          ctx.fillRect(0, 0, 400, 300);
                          
                          ctx.fillStyle = '#059669'; 
                          ctx.fillRect(0, 0, 400, 60);
                          
                          ctx.fillStyle = '#FFFFFF';
                          ctx.font = 'bold 16px sans-serif';
                          ctx.fillText('PAGO SEGURO PSE - APROBADO', 20, 36);
                          
                          ctx.fillStyle = '#94A3B8';
                          ctx.font = '12px sans-serif';
                          ctx.fillText('Transacción exitosa para: Los Detallitos de Lupe', 20, 90);
                          
                          ctx.fillStyle = '#FFFFFF';
                          ctx.font = '13px sans-serif';
                          ctx.fillText('Referencia: ' + reference, 20, 120);
                          ctx.fillText('Banco: ' + pseBank, 20, 150);
                          ctx.fillText('E-mail: ' + pseEmail, 20, 180);
                          ctx.fillText('Total Pago: $' + total.toLocaleString('es-CO') + ' COP', 20, 210);
                          
                          ctx.fillStyle = '#34D399';
                          ctx.font = 'bold 15px sans-serif';
                          ctx.fillText('✓ Transacción Autorizada por Red ACH', 20, 250);
                        }
                        const simulatedDataUrl = canvas.toDataURL('image/png');
                        setReceiptBase64(simulatedDataUrl);
                        setReceiptFileName(`COMPROBANTE_${reference}.png`);
                        setPseCompleted(true);
                      }}
                      className="w-full bg-[#002F6C] hover:bg-[#001D45] text-white font-bold text-xs py-3 px-4 rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      💳 Ir a mi Banco & Confirmar Transacción
                    </button>
                  </div>
                ) : (
                  <div className="bg-emerald-50/20 border border-emerald-200 p-5 rounded-2xl text-center space-y-3">
                    <span className="text-3xl select-none">🎉</span>
                    <h4 className="font-bold text-green-800 text-sm">¡Transacción por PSE Aprobada con Éxito!</h4>
                    <p className="text-xs text-slate-600">
                      Conexión culminada con la red ACH mediante <strong>{pseBank}</strong>. Tu pago del total exacto de <strong>${total.toLocaleString('es-CO')} COP</strong> se ha efectuado.
                    </p>
                    <div className="bg-white p-4 rounded-xl border border-dashed border-emerald-200 text-left text-xs max-w-sm mx-auto space-y-1 text-slate-700 font-mono">
                      <p>🏦 Banco Originador: {pseBank}</p>
                      <p>📧 Email PSE: {pseEmail}</p>
                      <p>🔢 Ref. Transacción: {pseTransReference}</p>
                      <p className="font-sans font-bold text-green-700 mt-2">✓ Soporte digital generado y anexado al pedido de forma automática.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPseCompleted(false);
                        setReceiptBase64('');
                        setReceiptFileName('');
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline cursor-pointer"
                    >
                      Volver a iniciar transacción o cambiar banco
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* MANDATORY RECEIPT UPLOADER */}
            <div className="bg-peach-light/10 border-2 border-dashed border-sage-light/30 p-6 rounded-2xl text-center space-y-3 relative">
              <Upload size={32} className="text-sage-primary mx-auto" />
              <div>
                <span className="text-sm font-bold text-slate-800 block">Subir captura de comprobante de pago *</span>
                <span className="text-xs text-slate-500">Es obligatorio subir el soporte de pago para procesar la orden. Formatos permitidos: JPG, JPEG, PNG.</span>
              </div>

              <div className="flex justify-center mt-2">
                <label className="cursor-pointer bg-sage-primary hover:bg-earth-brown text-white font-semibold text-xs px-4 py-2 rounded-full shadow-xs transition inline-block">
                  Seleccionar Imagen del Soporte
                  <input
                    type="file"
                    id="receipt-file-input"
                    accept="image/*"
                    required
                    onChange={handleReceiptChange}
                    className="hidden"
                  />
                </label>
              </div>

              {receiptFileName && (
                <p className="text-xs text-slate-700 mt-2 font-medium bg-white/70 py-1.5 px-3 rounded-full border border-sage-light/20 inline-block">
                  📎 {receiptFileName}
                </p>
              )}

              {receiptError && (
                <p className="text-xs text-red-600 font-semibold mt-1">{receiptError}</p>
              )}

              {receiptBase64 && (
                <div className="mt-4 max-w-[200px] mx-auto border border-slate-200 rounded-lg overflow-hidden shadow-xs relative group">
                  <p className="text-[10px] font-bold bg-green-500 text-white py-0.5 px-1 absolute top-1 left-1 rounded z-10">✓ Listo</p>
                  <img
                    src={receiptBase64}
                    alt="Vista previa del comprobante"
                    className="w-full h-32 object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </div>

            {/* Total Recap and buttons */}
            <div className="border-t border-slate-100 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <button
                type="button"
                onClick={handlePrevStep}
                className="text-slate-500 hover:text-slate-700 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition py-2 sm:py-0"
              >
                <ArrowLeft size={14} className="sm:size-4" />
                Regresar a Detalles de Envío
              </button>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="text-center sm:text-right bg-slate-50 sm:bg-transparent p-2 md:p-0 rounded-xl border border-slate-100 sm:border-0">
                  <span className="text-[10px] sm:text-xs text-slate-400 block sm:inline mr-1 sm:mr-0">Total a Transferir:</span>
                  <span className="text-sm sm:text-lg font-bold text-slate-800 font-sans">
                    ${total.toLocaleString('es-CO')} COP
                  </span>
                </div>
                <button
                  type="submit"
                  id="btn-confirm-checkout"
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold text-xs sm:text-sm px-5 sm:px-6 py-2.5 sm:py-3 rounded-full flex items-center justify-center gap-2 transform active:scale-95 transition w-full sm:w-auto"
                >
                  Concluir y Enviar Pedido
                  <CheckCircle size={14} className="sm:size-4" />
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Step 4: Checkout Success View */}
        {step === 4 && (
          <div id="checkout-step-4" className="text-center py-10 space-y-6">
            <CheckCircle size={64} className="text-green-500 mx-auto animate-bounce" />
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-slate-800 font-sans">¡Pedido Recibido con Éxito! 🎉</h3>
              <p className="text-slate-600 max-w-md mx-auto text-sm font-sans">
                Tu solicitud ha sido ingresada al sistema bajo el número de orden <strong className="text-terracotta">{createdOrderID}</strong> con estado <span className="bg-amber-100 text-amber-800 font-semibold text-xs px-2 py-0.5 rounded-full inline-block">En Validación</span>.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 inline-block text-left max-w-md w-full space-y-3 font-mono text-xs text-slate-700">
              <h4 className="font-sans font-bold text-slate-800 border-b border-dashed border-slate-200 pb-2 text-sm">🚚 Resumen de Entrega Logística</h4>
              
              {/* Product and Shipping details discrimination */}
              <div className="space-y-1.5 pb-2.5 border-b border-slate-200 border-dashed text-[11px]">
                <p className="flex justify-between font-sans">
                  <span className="text-slate-505 font-medium">Subtotal de Productos:</span>
                  <span className="font-bold text-slate-800">${subtotal.toLocaleString('es-CO')} COP</span>
                </p>
                <p className="flex justify-between font-sans">
                  <span className="text-slate-505 font-medium">Servicio de Domicilio:</span>
                  <span className="font-bold text-slate-800">
                    {valorEnvio > 0 ? `$${valorEnvio.toLocaleString('es-CO')} COP` : 'A coordinar con vendedor (Pendiente)'}
                  </span>
                </p>
              </div>

              {includeShipping ? (
                <>
                  <p>📍 Municipio de destino: {municipio}</p>
                  <p>🏢 Localidad / Barrio: {localidad} / {barrio}</p>
                  <p>🏠 Dirección completa: {direccionDetallada}</p>
                </>
              ) : (
                <p>📍 Método de Entrega: Coordinar envío y su cobertura estimada con el vendedor (Sin tarifa fija de reparto)</p>
              )}
              <p>📅 Fecha Programada: {fechaEntrega} (Mínimo de 3 días respetado)</p>
              <p>💝 Destinatario: {recipientName} ({recipientPhone})</p>
              <p className="border-t border-dashed border-slate-200 pt-2 font-sans font-bold text-slate-800 text-sm flex justify-between">
                <span>Valor Total de la Orden:</span>
                <span className="text-terracotta">${total.toLocaleString('es-CO')} COP</span>
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Para acelerar la confirmación y preparación por parte del personal, puedes notificar directamente con tu número de orden en nuestro canal oficial de atención.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <a
                  href={getWhatsAppLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-emerald-600 hover:bg-emerald-700 hover:shadow-lg text-white font-semibold text-sm px-6 py-3 rounded-full flex items-center justify-center gap-2 transition"
                >
                  💬 Reportar Comprobante por WhatsApp
                </a>
                <button
                  onClick={() => {
                    onClearCart();
                    onClose();
                  }}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm px-5 py-3 rounded-full transition"
                >
                  Regresar al Inicio
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
