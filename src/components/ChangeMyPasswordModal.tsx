import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, X } from 'lucide-react';
import { changeOwnPassword } from '../lib/supabaseClient';

interface ChangeMyPasswordModalProps {
  userName: string;
  onClose: () => void;
}

// Permite a cualquier colaborador cambiar su propia contraseña.
// Se acepta cualquier combinación: números, letras y símbolos, sin longitud mínima.
export default function ChangeMyPasswordModal({ userName, onClose }: ChangeMyPasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!newPassword) {
      setError('Escribe la nueva contraseña.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    setIsSaving(true);
    const saveError = await changeOwnPassword(currentPassword, newPassword);
    setIsSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    alert('✅ Tu contraseña se actualizó. Úsala la próxima vez que ingreses.');
    onClose();
  };

  const inputType = showPasswords ? 'text' : 'password';
  const inputClass = 'w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sage-primary';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-fadeIn">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-100 font-sans"
      >
        <div className="bg-gradient-to-r from-earth-brown to-sage-primary text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-terracotta" />
            <div>
              <h3 className="text-sm font-bold">Cambiar mi contraseña</h3>
              <p className="text-[11px] text-white/80">{userName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white cursor-pointer" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Contraseña actual</label>
            <input
              type={inputType}
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Nueva contraseña</label>
            <input
              type={inputType}
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Números, letras y/o símbolos"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1">Confirmar nueva contraseña</label>
            <input
              type={inputType}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowPasswords(v => !v)}
            className="flex items-center gap-1.5 text-slate-500 hover:text-sage-primary font-semibold cursor-pointer"
          >
            {showPasswords ? <EyeOff size={13} /> : <Eye size={13} />}
            {showPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
          </button>

          {error && <p className="text-red-600 font-semibold">{error}</p>}
        </div>

        <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="bg-sage-primary hover:bg-earth-brown disabled:opacity-60 disabled:cursor-wait text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
          >
            {isSaving ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </div>
      </form>
    </div>
  );
}
