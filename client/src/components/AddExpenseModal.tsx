import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { parseRupeesToPaise, formatINR, paiseToRupees } from '../lib/money';
import { ApiError } from '../api/client';
import { Calculator, AlertCircle, CheckCircle, Globe } from 'lucide-react';

interface Member {
  userId: string;
  name: string;
  email: string;
}

export interface ExpenseToEdit {
  id: string;
  description: string;
  amountPaise: number;
  paidById: string;
  splitType: 'EQUAL' | 'EXACT' | 'PERCENT';
  date: string;
  currency?: string;
  originalAmountPaise?: number | null;
  exchangeRate?: string | null;
  splits: Array<{
    userId: string;
    owedPaise: number;
    basisPoints?: number | null;
  }>;
}

interface AddExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (expenseData: any) => Promise<void>;
  members: Member[];
  currentUserId: string;
  groupCurrency: string;
  expenseToEdit?: ExpenseToEdit | null;
  isLoading?: boolean;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  members,
  currentUserId,
  groupCurrency,
  expenseToEdit,
  isLoading = false,
}) => {
  const [description, setDescription] = useState('');
  const [rupeesInput, setRupeesInput] = useState('');
  const [paidById, setPaidById] = useState(currentUserId);
  const [splitType, setSplitType] = useState<'EQUAL' | 'EXACT' | 'PERCENT'>('EQUAL');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Multi-currency stretch fields
  const [isMultiCurrency, setIsMultiCurrency] = useState(false);
  const [foreignCurrency, setForeignCurrency] = useState('USD');
  const [foreignRupeesInput, setForeignRupeesInput] = useState('');
  const [exchangeRateInput, setExchangeRateInput] = useState('83.25');

  // Split allocations state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set(members.map((m) => m.userId))
  );
  // Custom exact amounts (in rupee string format per user)
  const [exactShares, setExactShares] = useState<Record<string, string>>({});
  // Custom percent amounts (in percent string format per user)
  const [percentShares, setPercentShares] = useState<Record<string, string>>({});

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Initialize or reset form state
  useEffect(() => {
    if (expenseToEdit) {
      setDescription(expenseToEdit.description);
      setPaidById(expenseToEdit.paidById);
      setSplitType(expenseToEdit.splitType);
      setDate(new Date(expenseToEdit.date).toISOString().split('T')[0]);

      if (expenseToEdit.currency && expenseToEdit.currency !== groupCurrency) {
        setIsMultiCurrency(true);
        setForeignCurrency(expenseToEdit.currency);
        setForeignRupeesInput(paiseToRupees(expenseToEdit.originalAmountPaise || 0));
        setExchangeRateInput(expenseToEdit.exchangeRate || '83.25');
        setRupeesInput(paiseToRupees(expenseToEdit.amountPaise));
      } else {
        setIsMultiCurrency(false);
        setRupeesInput(paiseToRupees(expenseToEdit.amountPaise));
      }

      const activeIds = new Set(expenseToEdit.splits.map((s) => s.userId));
      setSelectedUserIds(activeIds);

      if (expenseToEdit.splitType === 'EXACT') {
        const exactMap: Record<string, string> = {};
        for (const s of expenseToEdit.splits) {
          exactMap[s.userId] = paiseToRupees(s.owedPaise);
        }
        setExactShares(exactMap);
      } else if (expenseToEdit.splitType === 'PERCENT') {
        const percentMap: Record<string, string> = {};
        for (const s of expenseToEdit.splits) {
          percentMap[s.userId] = ((s.basisPoints || 0) / 100).toFixed(2);
        }
        setPercentShares(percentMap);
      }
    } else {
      setDescription('');
      setRupeesInput('');
      setPaidById(currentUserId || members[0]?.userId || '');
      setSplitType('EQUAL');
      setDate(new Date().toISOString().split('T')[0]);
      setIsMultiCurrency(false);
      setForeignCurrency('USD');
      setForeignRupeesInput('');
      setExchangeRateInput('83.25');
      setSelectedUserIds(new Set(members.map((m) => m.userId)));
      setExactShares({});
      setPercentShares({});
    }
    setFieldErrors({});
    setGeneralError(null);
  }, [expenseToEdit, isOpen, members, currentUserId, groupCurrency]);

  // Recalculate converted rupee amount when multi-currency inputs change
  useEffect(() => {
    if (isMultiCurrency && foreignRupeesInput && exchangeRateInput) {
      try {
        const foreignPaise = parseRupeesToPaise(foreignRupeesInput);
        const rate = parseFloat(exchangeRateInput);
        if (!isNaN(rate) && rate > 0) {
          const convertedPaise = Math.round(foreignPaise * rate);
          setRupeesInput(paiseToRupees(convertedPaise));
        }
      } catch {
        // ignore incomplete inputs
      }
    }
  }, [isMultiCurrency, foreignRupeesInput, exchangeRateInput]);

  // Compute total parsed paise
  let totalPaise = 0;
  try {
    totalPaise = rupeesInput ? parseRupeesToPaise(rupeesInput) : 0;
  } catch {
    totalPaise = 0;
  }

  // Active participants list
  const activeMembers = members.filter((m) => selectedUserIds.has(m.userId));

  // --- Dynamic Live Allocation Calculations ---
  // 1. Equal Split Preview
  const equalBaseShare = activeMembers.length > 0 ? Math.floor(totalPaise / activeMembers.length) : 0;
  const equalRemainder = activeMembers.length > 0 ? totalPaise % activeMembers.length : 0;

  // 2. Exact Split Remaining Balance
  let exactSumPaise = 0;
  for (const m of activeMembers) {
    const val = exactShares[m.userId] || '0';
    try {
      exactSumPaise += parseRupeesToPaise(val);
    } catch {
      // ignore invalid partial input
    }
  }
  const exactRemainingPaise = totalPaise - exactSumPaise;

  // 3. Percent Split Remaining Balance
  let percentSum = 0;
  for (const m of activeMembers) {
    const val = parseFloat(percentShares[m.userId] || '0');
    if (!isNaN(val)) percentSum += val;
  }
  const percentRemaining = Number((100 - percentSum).toFixed(2));

  // Toggle member participation
  const toggleMember = (userId: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) {
      if (next.size <= 1) return; // Prevent 0 participants
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setSelectedUserIds(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError(null);

    let parsedTotalPaise: number;
    try {
      parsedTotalPaise = parseRupeesToPaise(rupeesInput);
      if (parsedTotalPaise <= 0) {
        setFieldErrors({ amountPaise: 'Amount must be greater than ₹0.00' });
        return;
      }
    } catch (err: any) {
      setFieldErrors({ amountPaise: err.message || 'Invalid amount format' });
      return;
    }

    if (activeMembers.length === 0) {
      setGeneralError('Please select at least one participant');
      return;
    }

    // Build payload
    const payload: any = {
      description: description.trim(),
      amountPaise: parsedTotalPaise,
      paidById,
      splitType,
      date: new Date(date).toISOString(),
    };

    if (isMultiCurrency) {
      try {
        payload.currency = foreignCurrency;
        payload.originalAmountPaise = parseRupeesToPaise(foreignRupeesInput);
        payload.exchangeRate = exchangeRateInput.trim();
      } catch (err: any) {
        setFieldErrors({ originalAmount: err.message });
        return;
      }
    }

    if (splitType === 'EQUAL') {
      payload.participantUserIds = Array.from(selectedUserIds);
    } else if (splitType === 'EXACT') {
      if (exactRemainingPaise !== 0) {
        setGeneralError(
          `Exact split mismatch: ${
            exactRemainingPaise > 0
              ? `₹${paiseToRupees(exactRemainingPaise)} remaining to allocate`
              : `Allocated amount exceeds total by ₹${paiseToRupees(-exactRemainingPaise)}`
          }`
        );
        return;
      }
      payload.splits = activeMembers.map((m) => ({
        userId: m.userId,
        amountPaise: exactShares[m.userId] ? parseRupeesToPaise(exactShares[m.userId]) : 0,
      }));
    } else if (splitType === 'PERCENT') {
      if (percentRemaining !== 0) {
        setGeneralError(
          `Percentages must sum to exactly 100%. Currently ${percentSum.toFixed(2)}% (${
            percentRemaining > 0 ? `${percentRemaining}% remaining` : `${-percentRemaining}% over`
          })`
        );
        return;
      }
      payload.splits = activeMembers.map((m) => ({
        userId: m.userId,
        percent: percentShares[m.userId] || '0',
      }));
    }

    try {
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      if (err instanceof ApiError) {
        setGeneralError(err.message);
        if (err.fields) setFieldErrors(err.fields);
      } else {
        setGeneralError('Failed to save expense. Please try again.');
      }
    }
  };

  const isSubmitDisabled =
    isLoading ||
    !description.trim() ||
    totalPaise <= 0 ||
    activeMembers.length === 0 ||
    (splitType === 'EXACT' && exactRemainingPaise !== 0) ||
    (splitType === 'PERCENT' && percentRemaining !== 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={expenseToEdit ? 'Edit Expense' : 'Add New Expense'}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {generalError && (
          <div className="p-3.5 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{generalError}</span>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Description
          </label>
          <input
            type="text"
            required
            maxLength={120}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Flight tickets, Groceries, Dinner"
            className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all touch-target ${
              fieldErrors.description
                ? 'border-red-300 focus:ring-2 focus:ring-red-400'
                : 'border-slate-300 focus:ring-2 focus:ring-brand-500'
            }`}
          />
          {fieldErrors.description && (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.description}</p>
          )}
        </div>

        {/* Multi-Currency Toggle */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-brand-600" />
              Multi-Currency Expense (Stretch Feature)
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isMultiCurrency}
                onChange={(e) => setIsMultiCurrency(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>

          {isMultiCurrency && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-200">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Currency</label>
                <select
                  value={foreignCurrency}
                  onChange={(e) => setForeignCurrency(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs outline-none bg-white touch-target"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="AED">AED (د.إ)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Foreign Amount</label>
                <input
                  type="text"
                  placeholder="50.00"
                  value={foreignRupeesInput}
                  onChange={(e) => setForeignRupeesInput(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs outline-none touch-target"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Exchange Rate (to {groupCurrency})</label>
                <input
                  type="text"
                  placeholder="83.25"
                  value={exchangeRateInput}
                  onChange={(e) => setExchangeRateInput(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs outline-none touch-target"
                />
              </div>
            </div>
          )}
        </div>

        {/* Amount & Date Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Amount ({groupCurrency} ₹)
            </label>
            <div className="relative rounded-xl shadow-sm">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-bold text-sm">
                ₹
              </span>
              <input
                type="text"
                required
                disabled={isMultiCurrency}
                value={rupeesInput}
                onChange={(e) => setRupeesInput(e.target.value)}
                placeholder="0.00"
                className={`w-full pl-8 pr-3.5 py-2.5 rounded-xl border text-sm font-semibold outline-none transition-all touch-target ${
                  isMultiCurrency ? 'bg-slate-100 text-slate-500' : 'bg-white'
                } ${
                  fieldErrors.amountPaise
                    ? 'border-red-300 focus:ring-2 focus:ring-red-400'
                    : 'border-slate-300 focus:ring-2 focus:ring-brand-500'
                }`}
              />
            </div>
            {fieldErrors.amountPaise && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.amountPaise}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Date
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-brand-500 touch-target"
            />
          </div>
        </div>

        {/* Paid By */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Paid By
          </label>
          <select
            value={paidById}
            onChange={(e) => setPaidById(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white touch-target"
          >
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name} {m.userId === currentUserId ? '(You)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Split Type Segmented Control */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Split Method
          </label>
          <div className="grid grid-cols-3 p-1 bg-slate-100 rounded-xl border border-slate-200">
            {(['EQUAL', 'EXACT', 'PERCENT'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSplitType(type)}
                className={`py-2 text-xs font-bold rounded-lg transition-all touch-target ${
                  splitType === type
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {type === 'EQUAL' ? 'Split Equally' : type === 'EXACT' ? 'Exact Amounts' : 'By Percentage'}
              </button>
            ))}
          </div>
        </div>

        {/* Live Allocation Validation Bar */}
        {splitType === 'EXACT' && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
              exactRemainingPaise === 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {exactRemainingPaise === 0 ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {exactRemainingPaise === 0
                ? 'Exact match! All paise allocated.'
                : exactRemainingPaise > 0
                ? `Remaining to allocate: ₹${paiseToRupees(exactRemainingPaise)}`
                : `Over-allocated by: ₹${paiseToRupees(-exactRemainingPaise)}`}
            </span>
            <span>Total: {formatINR(totalPaise)}</span>
          </div>
        )}

        {splitType === 'PERCENT' && (
          <div
            className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
              percentRemaining === 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {percentRemaining === 0 ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {percentRemaining === 0
                ? '100% fully allocated!'
                : percentRemaining > 0
                ? `Remaining: ${percentRemaining.toFixed(2)}%`
                : `Over 100% by: ${(-percentRemaining).toFixed(2)}%`}
            </span>
            <span>Allocated: {percentSum.toFixed(2)}%</span>
          </div>
        )}

        {/* Participants Breakdown List */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Participants & Individual Shares
          </label>
          <div className="space-y-2 border border-slate-200 rounded-xl p-3 bg-white max-h-56 overflow-y-auto">
            {members.map((m) => {
              const isSelected = selectedUserIds.has(m.userId);

              return (
                <div
                  key={m.userId}
                  className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
                    isSelected ? 'bg-slate-50' : 'opacity-50'
                  }`}
                >
                  <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleMember(m.userId)}
                      className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 touch-target"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800">
                        {m.name} {m.userId === currentUserId ? '(You)' : ''}
                      </p>
                      <p className="text-[11px] text-slate-400">{m.email}</p>
                    </div>
                  </label>

                  {/* Share Preview / Input */}
                  {isSelected && (
                    <div className="flex items-center gap-2">
                      {splitType === 'EQUAL' && (
                        <span className="text-xs font-bold text-slate-700 px-2 py-1 rounded-md bg-slate-200/70">
                          {formatINR(equalBaseShare + (equalRemainder > 0 ? 1 : 0))}
                        </span>
                      )}

                      {splitType === 'EXACT' && (
                        <div className="relative w-28">
                          <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-xs font-bold text-slate-400 pointer-events-none">
                            ₹
                          </span>
                          <input
                            type="text"
                            placeholder="0.00"
                            value={exactShares[m.userId] || ''}
                            onChange={(e) =>
                              setExactShares({ ...exactShares, [m.userId]: e.target.value })
                            }
                            className="w-full pl-6 pr-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold outline-none focus:border-brand-500 text-right touch-target"
                          />
                        </div>
                      )}

                      {splitType === 'PERCENT' && (
                        <div className="flex items-center gap-1.5">
                          <div className="relative w-20">
                            <input
                              type="text"
                              placeholder="0"
                              value={percentShares[m.userId] || ''}
                              onChange={(e) =>
                                setPercentShares({ ...percentShares, [m.userId]: e.target.value })
                              }
                              className="w-full pr-5 pl-2 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold outline-none focus:border-brand-500 text-right touch-target"
                            />
                            <span className="absolute inset-y-0 right-0 pr-2 flex items-center text-xs font-bold text-slate-400 pointer-events-none">
                              %
                            </span>
                          </div>
                          {totalPaise > 0 && percentShares[m.userId] && (
                            <span className="text-[11px] font-medium text-slate-500 w-16 text-right">
                              ≈ {formatINR(Math.round((totalPaise * parseFloat(percentShares[m.userId] || '0')) / 100))}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors touch-target"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="px-5 py-2.5 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl shadow-md shadow-brand-500/20 transition-all touch-target"
          >
            {isLoading ? 'Saving...' : expenseToEdit ? 'Save Changes' : 'Create Expense'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
