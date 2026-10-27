import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { parseRupeesToPaise, formatINR, paiseToRupees } from '../lib/money';
import { ApiError } from '../api/client';
import { CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface Member {
  userId: string;
  name: string;
  email: string;
}

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (paymentData: { fromUserId: string; toUserId: string; amountPaise: number; note?: string }) => Promise<{ warning?: string }>;
  members: Member[];
  initialFromUserId?: string;
  initialToUserId?: string;
  initialAmountPaise?: number;
  isLoading?: boolean;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  members,
  initialFromUserId,
  initialToUserId,
  initialAmountPaise,
  isLoading = false,
}) => {
  const [fromUserId, setFromUserId] = useState(initialFromUserId || members[0]?.userId || '');
  const [toUserId, setToUserId] = useState(initialToUserId || members[1]?.userId || '');
  const [rupeesInput, setRupeesInput] = useState(
    initialAmountPaise ? paiseToRupees(initialAmountPaise) : ''
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialFromUserId) setFromUserId(initialFromUserId);
      if (initialToUserId) setToUserId(initialToUserId);
      if (initialAmountPaise) setRupeesInput(paiseToRupees(initialAmountPaise));
      setNote('');
      setError(null);
      setWarning(null);
    }
  }, [isOpen, initialFromUserId, initialToUserId, initialAmountPaise]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setWarning(null);

    let amountPaise: number;
    try {
      amountPaise = parseRupeesToPaise(rupeesInput);
      if (amountPaise <= 0) {
        setError('Payment amount must be greater than ₹0.00');
        return;
      }
    } catch (err: any) {
      setError(err.message || 'Invalid amount');
      return;
    }

    if (fromUserId === toUserId) {
      setError('Payer and payee cannot be the same user');
      return;
    }

    try {
      const result = await onSubmit({
        fromUserId,
        toUserId,
        amountPaise,
        note: note.trim() || undefined,
      });

      if (result?.warning) {
        setWarning(result.warning);
      }
      onClose();
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to record payment. Please try again.');
      }
    }
  };

  const senderName = members.find((m) => m.userId === fromUserId)?.name || 'Payer';
  const receiverName = members.find((m) => m.userId === toUserId)?.name || 'Payee';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Settlement Payment">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200">
            {error}
          </div>
        )}

        {warning && (
          <div className="p-3.5 rounded-xl bg-amber-50 text-amber-700 text-xs border border-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{warning}</span>
          </div>
        )}

        {/* Sender & Receiver Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Who Paid? (Payer)
            </label>
            <select
              value={fromUserId}
              onChange={(e) => setFromUserId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white touch-target"
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Who Received? (Payee)
            </label>
            <select
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white touch-target"
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Summary preview */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 flex items-center justify-center gap-2">
          <span>{senderName}</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span>pays</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span>{receiverName}</span>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Amount (₹)
          </label>
          <div className="relative rounded-xl shadow-sm">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-sm">
              ₹
            </span>
            <input
              type="text"
              required
              placeholder="0.00"
              value={rupeesInput}
              onChange={(e) => setRupeesInput(e.target.value)}
              className="w-full pl-8 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-500 touch-target"
            />
          </div>
        </div>

        {/* Optional Note */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Note (Optional)
          </label>
          <input
            type="text"
            maxLength={200}
            placeholder="e.g. Paid via UPI / GPay"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-500 touch-target"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors touch-target"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || !rupeesInput.trim() || fromUserId === toUserId}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 rounded-xl shadow-sm transition-colors touch-target"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isLoading ? 'Recording...' : 'Record Payment'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
