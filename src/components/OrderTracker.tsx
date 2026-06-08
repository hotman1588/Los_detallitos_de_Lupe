import React, { useState } from 'react';
import { Order, OrderStatus } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, ClipboardList, CheckCircle2, Truck, ClipboardCheck, 
  Calendar, Clock, User, AlertCircle, FileText, Camera, 
  MapPin, Sparkles, Heart, Check, ChevronRight, PackageCheck, Send 
} from 'lucide-react';

interface OrderTrackerProps {
  orders: Order[];
}

export default function OrderTracker({ orders }: OrderTrackerProps) {
  const [orderId, setOrderId] = useState('LDL-');
  const [cedula, setCedula] = useState('');
  const [searched, setSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [foundOrder, setFoundOrder] = useState<Order | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'status' | 'logistics'>('status');

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setErrorMsg('');

    // Simulate search duration for immersive full-stack feel
    setTimeout(() => {
      setSearched(true);
      setIsSearching(false);
      setFoundOrder(null);

      const trimmedId = orderId.trim().toUpperCase();
      const trimmedCedula = cedula.trim();

      if (!trimmedId || !trimmedCedula) {
        setErrorMsg('Por favor ingresa tanto el Número de Orden como tu Número de Cédula.');
        return;
      }

      const match = orders.find(o => 
        o.id.toUpperCase() === trimmedId && 
        o.shipping.buyerCedula?.trim() === trimmedCedula
      );

      if (match) {
        setFoundOrder(match);
      } else {
        setErrorMsg('⚠️ No se encontró ningún pedido que coincida con el número de orden y la cédula suministrados. Por favor, verifica la ortografía e intenta nuevamente.');
      }
    }, 900);
  };

  // Status mapping to stages
  const getStatusStep = (status: OrderStatus): number => {
    switch (status) {
      case 'En Validación': return 1;
      case 'En Preparación': return 2;
      case 'En Reparto': return 3;
      case 'Entregado': return 4;
      case 'Rechazado': return -1;
      default: return 1;
    }
  };

  const statusStep = foundOrder ? getStatusStep(foundOrder.status) : 0;

  // Generate dynamic tracking milestones/logs based on registered order dates
  const getStatusLogs = (order: Order) => {
    const creationDate = new Date(order.createdAt);
    const formatDate = (date: Date) => date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    
    const formatTime = (date: Date, hoursOffset: number, minutesVal: number) => {
      const d = new Date(date.getTime() + hoursOffset * 60 * 60 * 1000);
      d.setMinutes(minutesVal);
      return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const logs = [];

    // Log 1: Verification
    logs.push({
      time: formatTime(creationDate, 0, 15),
      date: formatDate(creationDate),
      title: 'Pedido Recibido',
      desc: 'Comprobante ingresado al sistema. En validación de transacciones.',
      done: statusStep >= 1,
      current: statusStep === 1
    });

    if (statusStep >= 2) {
      logs.push({
        time: formatTime(creationDate, 1, 45),
        date: formatDate(creationDate),
        title: 'Verificación Exitosa y En Preparación',
        desc: 'Pago aprobado. El equipo técnico artesanal ha iniciado el ensamble del regalo.',
        done: true,
        current: statusStep === 2
      });
    }

    if (statusStep >= 3) {
      logs.push({
        time: formatTime(creationDate, 3, 10),
        date: formatDate(creationDate),
        title: 'Despachado con Repartidor',
        desc: 'El obsequio ha sido cargado en la ruta de reparto. Domiciliario asignado.',
        done: true,
        current: statusStep === 3
      });
    }

    if (statusStep >= 4) {
      logs.push({
        time: order.shipping.horaEntrega || formatTime(creationDate, 4, 30),
        date: order.shipping.fechaEntrega || formatDate(creationDate),
        title: '¡Entregado con Éxito!',
        desc: 'El regalo sorpresa fue entregado en perfectas condiciones al destinatario final.',
        done: true,
        current: statusStep === 4
      });
    }

    return logs.reverse(); // Newest first
  };

  return (
    <div id="order-tracker-container" className="max-w-4xl mx-auto my-8 p-1 sm:p-2 font-sans select-none">
      
      {/* Title & Header Section */}
      <div className="text-center max-w-xl mx-auto space-y-3 mb-10 px-4">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="w-16 h-16 bg-peach-light text-terracotta rounded-full flex items-center justify-center mx-auto shadow-md"
        >
          <PackageCheck size={32} className="animate-pulse text-terracotta" />
        </motion.div>
        
        <h2 className="text-3xl font-serif font-black text-slate-800 tracking-tight">
          Portal de Rastreo Satelital
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed font-sans max-w-md mx-auto">
          Gestiona y consulta en tiempo real cada hito de tu sorpresa con el portal interactivo de <strong className="text-terracotta">Los Detallitos de Lupe</strong>.
        </p>
      </div>

      {/* Advanced Interactive Lookup Box */}
      <motion.div 
        layout
        className="bg-white p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-100 mb-8"
      >
        <form onSubmit={handleTrackSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <span>Ref. del Pedido / Orden</span>
                <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <ClipboardCheck size={18} />
                </span>
                <input
                  type="text"
                  required
                  value={orderId}
                  onChange={(e) => {
                    let val = e.target.value.toUpperCase();
                    if (!val.startsWith('LDL-')) {
                      if ('LDL-'.startsWith(val)) {
                        val = 'LDL-';
                      } else {
                        val = 'LDL-' + val.replace(/^LDL-?/i, '');
                      }
                    }
                    setOrderId(val);
                  }}
                  placeholder="Ej: LDL-38491"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 hover:bg-slate-50/50 focus:bg-white border border-slate-200 focus:border-sage-primary rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-sage-primary/10 transition-all font-mono font-black text-slate-800 uppercase tracking-widest placeholder:lowercase"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                <span>Cédula de Ciudadanía del Comprador</span>
                <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                  <User size={18} />
                </span>
                <input
                  type="text"
                  required
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  placeholder="Digita tu Cédula registrada"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 hover:bg-slate-50/50 focus:bg-white border border-slate-200 focus:border-sage-primary rounded-2xl text-sm focus:outline-none focus:ring-4 focus:ring-sage-primary/10 transition-all font-sans font-semibold text-slate-800 placeholder:text-slate-400"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSearching}
              className="w-full sm:w-auto min-w-[180px] bg-gradient-to-r from-sage-primary to-olive-dark hover:from-olive-dark hover:to-sage-primary active:scale-[0.98] disabled:opacity-75 text-white font-bold text-xs uppercase tracking-wider py-3.5 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-md shadow-sage-primary/10 transition duration-300 cursor-pointer"
            >
              {isSearching ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Buscando Historial...</span>
                </>
              ) : (
                <>
                  <Search size={15} />
                  <span>Consultar Dirección</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>

      {/* Main Container Response Space */}
      <AnimatePresence mode="wait">
        
        {/* Loading Spinner */}
        {isSearching && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-md flex flex-col items-center justify-center space-y-4"
          >
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-sage-primary/10 border-t-sage-primary animate-spin"></div>
              <Sparkles size={20} className="text-terracotta animate-pulse absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-slate-700">Validando en Servidor Central</h4>
              <p className="text-xs text-slate-400">Filtrando guías logísticas del portal...</p>
            </div>
          </motion.div>
        )}

        {/* Error Notification */}
        {searched && !isSearching && errorMsg && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="bg-red-50/70 backdrop-blur-xs border border-red-100 p-6 rounded-3xl flex items-start gap-4 text-red-900 shadow-xs"
          >
            <div className="p-3 bg-red-100 text-red-600 rounded-2xl shrink-0">
              <AlertCircle size={24} />
            </div>
            <div className="text-xs sm:text-sm font-sans space-y-1.5 pt-1">
              <h5 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">Error de Conciliación</h5>
              <p className="text-red-750 leading-relaxed font-medium">{errorMsg}</p>
            </div>
          </motion.div>
        )}

        {/* Success Found Order View */}
        {searched && !isSearching && foundOrder && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Header Metadata Ribbon */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
              <div className="space-y-2 pointer-events-auto">
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-black px-3 py-1 rounded-full uppercase tracking-wider border border-emerald-500/30">
                  Transmisión en Vivo
                </span>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                  <h3 className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white">
                    Ref: {foundOrder.id}
                  </h3>
                  <span className="hidden sm:inline text-slate-500">|</span>
                  <span className="text-xs text-slate-300 font-semibold bg-white/10 px-2.5 py-0.5 rounded-lg">
                    Los Detallitos de Lupe
                  </span>
                </div>
              </div>
              
              <div className="flex flex-col sm:items-end text-xs text-slate-300 space-y-1">
                <p>Fecha Compra: <strong className="text-white font-bold">{new Date(foundOrder.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</strong></p>
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <p className="text-[11px] text-slate-400 uppercase tracking-widest font-black">Servidor Activo</p>
                </div>
              </div>
            </div>

            {/* HIGH-TICKET CHRONOLOGY (DOUBLED UP STEPPER SCROLLER) */}
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-lg space-y-8 relative">
              <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest">
                    Movimiento de Domicilio
                  </h4>
                  <p className="text-xl font-serif font-black text-slate-800">Ubicación del Regalo</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 uppercase tracking-wider">
                    {foundOrder.status}
                  </span>
                </div>
              </div>

              {statusStep === -1 ? (
                <div className="bg-red-50 p-6 rounded-2xl text-center border border-red-150 space-y-2">
                  <p className="text-red-850 font-black text-sm uppercase tracking-wider">🛑 Orden Cancelada o Retenida</p>
                  <p className="text-red-700 text-xs max-w-sm mx-auto">Esta orden figura con estado de inactividad o rechazo. Contacta inmediatamente a nuestra línea de WhatsApp.</p>
                </div>
              ) : (
                <div className="relative pt-8 pb-4 px-2">
                  {/* Fluid Progress Line Base */}
                  <div className="absolute top-12 left-8 right-8 h-2 bg-slate-100 -z-10 rounded-full">
                    {/* Active growing line */}
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(0, (statusStep - 1) / 3 * 100)}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full relative"
                    >
                      {/* Animated sliding delivery icon along the line */}
                      <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.5 }}
                        className="absolute right-0 -top-4 bg-teal-500 text-white p-1 rounded-full shadow-lg shadow-teal-500/30 ring-4 ring-white shrink-0 z-40"
                      >
                        <Truck size={14} className="animate-bounce" />
                      </motion.div>
                    </motion.div>
                  </div>

                  {/* Nodes Grid */}
                  <div className="grid grid-cols-4 gap-2">
                    
                    {/* Stage 1: En Validación */}
                    <div className="flex flex-col items-center">
                      <motion.div 
                        whileHover={{ scale: 1.1 }}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                          statusStep >= 1 ? 'bg-gradient-to-br from-emerald-400 to-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {statusStep > 1 ? <Check size={16} strokeWidth={3} /> : '1'}
                      </motion.div>
                      <span className={`text-[11px] sm:text-xs font-black mt-3 text-center ${statusStep >= 1 ? 'text-emerald-700' : 'text-slate-400'}`}>
                        Validando
                      </span>
                      <span className="text-[9px] text-slate-400 hidden sm:block mt-1 font-medium">Pago Soportado</span>
                    </div>

                    {/* Stage 2: En Preparación */}
                    <div className="flex flex-col items-center">
                      <motion.div 
                        whileHover={{ scale: 1.1 }}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                          statusStep >= 2 ? 'bg-gradient-to-br from-emerald-400 to-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {statusStep > 2 ? <Check size={16} strokeWidth={3} /> : '2'}
                      </motion.div>
                      <span className={`text-[11px] sm:text-xs font-black mt-3 text-center ${statusStep >= 2 ? 'text-emerald-700' : 'text-slate-400'}`}>
                        Preparación
                      </span>
                      <span className="text-[9px] text-slate-400 hidden sm:block mt-1 font-medium">Armando obsequio</span>
                    </div>

                    {/* Stage 3: En Reparto */}
                    <div className="flex flex-col items-center">
                      <motion.div 
                        whileHover={{ scale: 1.1 }}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                          statusStep >= 3 ? 'bg-gradient-to-br from-emerald-400 to-emerald-500 text-white shadow-lg shadow-emerald-200' : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {statusStep > 3 ? <Check size={16} strokeWidth={3} /> : '3'}
                      </motion.div>
                      <span className={`text-[11px] sm:text-xs font-black mt-3 text-center ${statusStep >= 3 ? 'text-emerald-700' : 'text-slate-400'}`}>
                        En Reparto
                      </span>
                      <span className="text-[9px] text-slate-400 hidden sm:block mt-1 font-medium">Ruta del repartidor</span>
                    </div>

                    {/* Stage 4: Entregado */}
                    <div className="flex flex-col items-center">
                      <motion.div 
                        whileHover={{ scale: 1.1 }}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                          statusStep >= 4 ? 'bg-gradient-to-br from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-200' : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        {statusStep >= 4 ? <Check size={16} strokeWidth={3} /> : '4'}
                      </motion.div>
                      <span className={`text-[11px] sm:text-xs font-black mt-3 text-center ${statusStep >= 4 ? 'text-teal-700' : 'text-slate-400'}`}>
                        Entregado
                      </span>
                      <span className="text-[9px] text-slate-400 hidden sm:block mt-1 font-medium">Felicidad total</span>
                    </div>

                  </div>
                </div>
              )}
            </div>

            {/* If delivered and contains deliveryPhotoUrl, show the support photo */}
            {foundOrder.status === 'Entregado' && foundOrder.deliveryPhotoUrl && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-6 sm:p-8 rounded-3xl border border-emerald-100 shadow-md space-y-4 animate-scaleUp"
              >
                <div className="flex items-center gap-2 border-b border-slate-50 pb-3">
                  <span className="text-xl">📸</span>
                  <div>
                    <h5 className="font-extrabold text-slate-800 text-sm sm:text-base uppercase tracking-wider">Soporte Fotográfico de Entrega</h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">La prueba fotográfica fue registrada por el domiciliario al momento de completar la entrega en el punto.</p>
                  </div>
                </div>
                
                <div className="flex flex-col md:flex-row gap-6 items-center flex-wrap md:flex-nowrap">
                  <div className="w-full md:w-1/2 aspect-video md:aspect-square bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center">
                    <img 
                      src={foundOrder.deliveryPhotoUrl} 
                      alt="Soporte de entrega" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="w-full md:w-1/2 space-y-3 font-sans text-xs">
                    <div className="bg-emerald-50/50 p-4 border border-emerald-100 rounded-2xl space-y-2">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest block">Verificación de Recepción</span>
                      <p className="text-slate-700 leading-relaxed font-medium">El pedido fue entregado en perfectas condiciones de presentación y frescura. Cada arreglo pasa por una rigurosa validación de entrega para asegurar tu tranquilidad.</p>
                    </div>
                    {foundOrder.deliveredAt && (
                      <p className="text-slate-500 font-semibold text-xs">
                        🗓️ <strong>Fecha de Registro:</strong> {new Date(foundOrder.deliveredAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })} a las {new Date(foundOrder.deliveredAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </p>
                    )}
                    <p className="text-slate-400 text-[10px] leading-relaxed">Las imágenes se capturan localmente con la firma digital y validación del domiciliario autónomo asignado al momento de reportar la novedad.</p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* CORE TRACKING LOGISTICS IN FULL WIDTH CARD */}
            <div className="w-full">
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-md space-y-6"
              >
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <Clock size={18} className="text-terracotta" />
                  <h5 className="font-extrabold text-slate-700 text-sm sm:text-base uppercase tracking-wider">Línea de Vida Logística</h5>
                </div>

                <div className="space-y-6 pl-2 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                  {getStatusLogs(foundOrder).map((log, index) => (
                    <div key={index} className="flex gap-4 relative">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 transition-colors ${
                        log.done 
                          ? log.current 
                            ? 'bg-emerald-500 text-white ring-4 ring-emerald-100 animate-pulse' 
                            : 'bg-emerald-100 text-emerald-600'
                          : 'bg-slate-50 text-slate-350'
                      }`}>
                        {log.done ? <Check size={12} strokeWidth={3} /> : <div className="w-2 h-2 rounded-full bg-slate-300" />}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h6 className={`text-xs sm:text-sm font-extrabold ${log.done ? 'text-slate-800' : 'text-slate-400'}`}>
                            {log.title}
                          </h6>
                          <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md font-mono shrink-0">
                            {log.time}
                          </span>
                        </div>
                        <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed font-sans">{log.desc}</p>
                        <span className="block text-[9px] text-slate-400 font-medium">{log.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* Informative Footer Badge */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-[10px] text-slate-400 text-center uppercase tracking-widest leading-relaxed">
              🛡️ Protección de Datos: Para salvaguardar tu seguridad, este portal omite información sensible sobre costos monetarios, métodos de pago o datos bancarios.
            </div>

          </motion.div>
        )}

        {/* Empty State Banner (Prior to Search Submission) */}
        {!searched && !isSearching && (
          <motion.div 
            key="empty-state"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-xl max-w-lg mx-auto space-y-4"
          >
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-350">
              <ClipboardList size={32} />
            </div>
            <div className="space-y-1.5 max-w-sm mx-auto px-4">
              <h4 className="font-bold text-slate-700 text-sm">¿Deseas verificar el estado de tu orden?</h4>
              <p className="text-slate-400 text-xs leading-relaxed font-medium">Ingresa el id de la orden asignada en el checkout junto al número de cédula del remitente comprador para iniciar el rastreo.</p>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}
