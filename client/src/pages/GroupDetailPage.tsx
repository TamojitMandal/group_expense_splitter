import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { Navbar } from '../components/Navbar';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AddExpenseModal, ExpenseToEdit } from '../components/AddExpenseModal';
import { AddMemberModal } from '../components/AddMemberModal';
import { RecordPaymentModal } from '../components/RecordPaymentModal';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatINR } from '../lib/money';
import {
  ArrowLeft,
  UserPlus,
  Receipt,
  PlusCircle,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Calendar,
  History,
  Activity as ActivityIcon,
  DollarSign,
  Scale,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

export const GroupDetailPage: React.FC = () => {
  const { id: groupId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'expenses' | 'balances' | 'settle' | 'activity'>('expenses');

  // Modals state
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<ExpenseToEdit | null>(null);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentPreset, setPaymentPreset] = useState<{ fromUserId: string; toUserId: string; amountPaise: number } | null>(null);

  // Delete expense confirmation state
  const [expenseToDelete, setExpenseToDelete] = useState<{ id: string; description: string } | null>(null);

  // 1. Fetch Group Details & Members
  const { data: groupData, isLoading: isGroupLoading } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => apiRequest(`/groups/${groupId}`),
    enabled: !!groupId,
  });

  // 2. Fetch Expenses
  const { data: expensesData, isLoading: isExpensesLoading } = useQuery({
    queryKey: ['expenses', groupId],
    queryFn: () => apiRequest(`/groups/${groupId}/expenses`),
    enabled: !!groupId,
  });

  // 3. Fetch Balances
  const { data: balancesData, isLoading: isBalancesLoading } = useQuery({
    queryKey: ['balances', groupId],
    queryFn: () => apiRequest(`/groups/${groupId}/balances`),
    enabled: !!groupId,
  });

  // 4. Fetch Settlements Plan
  const { data: settlementsData, isLoading: isSettlementsLoading } = useQuery({
    queryKey: ['settlements', groupId],
    queryFn: () => apiRequest(`/groups/${groupId}/settlements`),
    enabled: !!groupId,
  });

  // 5. Fetch Payments History
  const { data: paymentsData, isLoading: isPaymentsLoading } = useQuery({
    queryKey: ['payments', groupId],
    queryFn: () => apiRequest(`/groups/${groupId}/payments`),
    enabled: !!groupId,
  });

  // 6. Fetch Activity Feed
  const { data: activityData, isLoading: isActivityLoading } = useQuery({
    queryKey: ['activity', groupId],
    queryFn: () => apiRequest(`/groups/${groupId}/activity?limit=50`),
    enabled: !!groupId,
  });

  // --- Mutations ---
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['group', groupId] });
    queryClient.invalidateQueries({ queryKey: ['expenses', groupId] });
    queryClient.invalidateQueries({ queryKey: ['balances', groupId] });
    queryClient.invalidateQueries({ queryKey: ['settlements', groupId] });
    queryClient.invalidateQueries({ queryKey: ['payments', groupId] });
    queryClient.invalidateQueries({ queryKey: ['activity', groupId] });
    queryClient.invalidateQueries({ queryKey: ['groups'] });
  };

  const createExpenseMutation = useMutation({
    mutationFn: (newExp: any) =>
      apiRequest(`/groups/${groupId}/expenses`, {
        method: 'POST',
        body: JSON.stringify(newExp),
      }),
    onSuccess: invalidateAll,
  });

  const updateExpenseMutation = useMutation({
    mutationFn: ({ expenseId, data }: { expenseId: string; data: any }) =>
      apiRequest(`/groups/${groupId}/expenses/${expenseId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: invalidateAll,
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (expenseId: string) =>
      apiRequest(`/groups/${groupId}/expenses/${expenseId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      invalidateAll();
      setExpenseToDelete(null);
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: (email: string) =>
      apiRequest(`/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    onSuccess: invalidateAll,
  });

  const recordPaymentMutation = useMutation({
    mutationFn: (paymentData: any) =>
      apiRequest(`/groups/${groupId}/payments`, {
        method: 'POST',
        body: JSON.stringify(paymentData),
      }),
    onSuccess: invalidateAll,
  });

  const group = groupData?.group;
  const members = group?.members || [];
  const expenses = expensesData?.expenses || [];
  const balances = balancesData?.balances || [];
  const settlements = settlementsData?.settlements || [];
  const payments = paymentsData?.payments || [];
  const activities = activityData?.activities || [];

  const isOwner = group?.myRole === 'OWNER';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 sm:py-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to all groups</span>
          </Link>
        </div>

        {/* Group Header Card */}
        <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {group?.name || 'Loading group...'}
              </h1>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 uppercase tracking-wider">
                {group?.currency || 'INR'}
              </span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-700">
                {group?.myRole}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {members.length} {members.length === 1 ? 'member' : 'members'}:{' '}
              {members.map((m: any) => m.name).join(', ')}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setIsAddMemberOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors touch-target"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Member</span>
            </button>

            <button
              onClick={() => {
                setExpenseToEdit(null);
                setIsAddExpenseOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md shadow-brand-500/20 transition-all touch-target"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Expense</span>
            </button>
          </div>
        </div>

        {/* Tabs Segmented Control */}
        <div className="grid grid-cols-4 p-1.5 bg-slate-200/70 rounded-2xl mb-6">
          {[
            { id: 'expenses', label: 'Expenses', icon: Receipt, count: expenses.length },
            { id: 'balances', label: 'Balances', icon: Scale },
            { id: 'settle', label: 'Settle Up', icon: DollarSign, badge: settlements.length },
            { id: 'activity', label: 'Activity', icon: ActivityIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-2.5 px-2 flex items-center justify-center gap-2 rounded-xl text-xs sm:text-sm font-bold transition-all touch-target ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="hidden md:inline text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {tab.count}
                  </span>
                )}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="w-2 h-2 rounded-full bg-brand-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* ================= TAB 1: EXPENSES ================= */}
        {activeTab === 'expenses' && (
          <div className="space-y-4">
            {isExpensesLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-white rounded-2xl border border-slate-200 animate-pulse" />
                ))}
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-16 px-4 bg-white rounded-3xl border border-dashed border-slate-300">
                <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-900">No expenses recorded yet</h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  Click "Add Expense" above to add the first bill or group payment.
                </p>
                <button
                  onClick={() => setIsAddExpenseOpen(true)}
                  className="mt-4 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl shadow-sm touch-target"
                >
                  Add First Expense
                </button>
              </div>
            ) : (
              expenses.map((expense: any) => {
                const isCreator = expense.createdById === user?.id;
                const canModify = isCreator || isOwner;

                // Find my split share if involved
                const mySplit = expense.splits?.find((s: any) => s.userId === user?.id);

                return (
                  <div
                    key={expense.id}
                    className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-900">
                          {expense.description}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>
                            Paid by <strong className="text-slate-700 font-semibold">{expense.paidBy.name}</strong>
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {format(new Date(expense.date), 'MMM d, yyyy')}
                          </span>
                          <span>•</span>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                            {expense.splitType}
                          </span>
                        </p>

                        {/* Foreign currency notice if multi-currency */}
                        {expense.originalAmountPaise && expense.exchangeRate && (
                          <p className="text-[11px] text-brand-600 font-medium mt-1">
                            Converted from {formatINR(expense.originalAmountPaise).replace('₹', expense.currency + ' ')} @ rate {expense.exchangeRate}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-5 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="text-left sm:text-right">
                        <span className="text-base font-extrabold text-slate-900 block">
                          {formatINR(expense.amountPaise)}
                        </span>
                        <span className="text-[11px] font-medium text-slate-500">
                          {mySplit
                            ? `Your share: ${formatINR(mySplit.owedPaise)}`
                            : 'You are not involved'}
                        </span>
                      </div>

                      {canModify && (
                        <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                          <button
                            onClick={() => {
                              setExpenseToEdit(expense);
                              setIsAddExpenseOpen(true);
                            }}
                            title="Edit Expense"
                            className="p-2 text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition-colors touch-target"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setExpenseToDelete({ id: expense.id, description: expense.description })}
                            title="Delete Expense"
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors touch-target"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ================= TAB 2: BALANCES ================= */}
        {activeTab === 'balances' && (
          <div className="space-y-4">
            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Member Net Balances</h3>
                <p className="text-xs text-slate-500">
                  Derived dynamically from all non-deleted expenses and recorded payments. Sum equals exactly 0.
                </p>
              </div>
              <Scale className="w-6 h-6 text-slate-400" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {balances.map((b: any) => {
                const isPositive = b.netPaise > 0;
                const isNegative = b.netPaise < 0;

                return (
                  <div
                    key={b.userId}
                    className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-sm">
                        {b.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          {b.name} {b.userId === user?.id ? '(You)' : ''}
                        </h4>
                        <p className="text-xs text-slate-400 truncate max-w-[150px]">{b.email}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`text-sm font-bold block ${
                          isPositive
                            ? 'text-emerald-600'
                            : isNegative
                            ? 'text-rose-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {formatINR(b.netPaise)}
                      </span>
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${
                          isPositive
                            ? 'bg-emerald-50 text-emerald-700'
                            : isNegative
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isPositive ? 'gets back' : isNegative ? 'owes' : 'settled'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 3: SETTLE UP ================= */}
        {activeTab === 'settle' && (
          <div className="space-y-6">
            {/* Suggested Minimal Payments Plan */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Optimal Debt Settlement Plan</h3>
                  <p className="text-xs text-slate-500">
                    Calculated via Bitmask Dynamic Programming to minimize the total number of transactions.
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                  {settlements.length} {settlements.length === 1 ? 'Payment' : 'Payments'}
                </span>
              </div>

              {settlements.length === 0 ? (
                <div className="text-center py-10 px-4 bg-emerald-50/50 rounded-2xl border border-emerald-200">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-emerald-900">All Settled Up!</h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    No debts exist among members in this group. Everyone is even!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {settlements.map((tx: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-700">
                          {tx.fromUser.name.charAt(0)}
                        </div>
                        <div className="text-xs">
                          <p className="text-slate-800 font-semibold">
                            <strong className="text-slate-900 font-bold">{tx.fromUser.name}</strong> pays{' '}
                            <strong className="text-slate-900 font-bold">{tx.toUser.name}</strong>
                          </p>
                          <p className="text-slate-400">{formatINR(tx.amountPaise)}</p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setPaymentPreset({
                            fromUserId: tx.fromUser.id,
                            toUserId: tx.toUser.id,
                            amountPaise: tx.amountPaise,
                          });
                          setIsPaymentModalOpen(true);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-sm transition-colors touch-target"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Record Payment</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment History Log */}
            <div className="pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-500" />
                  Payment History ({payments.length})
                </h3>
                <button
                  onClick={() => {
                    setPaymentPreset(null);
                    setIsPaymentModalOpen(true);
                  }}
                  className="text-xs font-bold text-brand-600 hover:text-brand-700"
                >
                  + Record Custom Payment
                </button>
              </div>

              {payments.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
                  No settlement payments recorded yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {payments.map((p: any) => (
                    <div
                      key={p.id}
                      className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">
                          {p.fromUser.name} paid {p.toUser.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}
                          {p.note && ` • "${p.note}"`}
                        </p>
                      </div>
                      <span className="font-bold text-emerald-600 text-sm">
                        {formatINR(p.amountPaise)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 4: ACTIVITY ================= */}
        {activeTab === 'activity' && (
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <ActivityIcon className="w-4 h-4 text-brand-600" />
              Chronological Audit Log
            </h3>

            {isActivityLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-slate-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : activities.length === 0 ? (
              <p className="text-center text-xs text-slate-400 py-8">No activity recorded yet.</p>
            ) : (
              <div className="space-y-4">
                {activities.map((act: any) => (
                  <div key={act.id} className="flex items-start gap-3 text-xs">
                    <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-[10px] flex-shrink-0 mt-0.5">
                      {act.actor?.name?.charAt(0) || 'A'}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-slate-800 leading-snug">{act.message}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add / Edit Expense Modal */}
      <AddExpenseModal
        isOpen={isAddExpenseOpen}
        onClose={() => setIsAddExpenseOpen(false)}
        onSubmit={async (data) => {
          if (expenseToEdit) {
            await updateExpenseMutation.mutateAsync({ expenseId: expenseToEdit.id, data });
          } else {
            await createExpenseMutation.mutateAsync(data);
          }
        }}
        members={members}
        currentUserId={user?.id || ''}
        groupCurrency={group?.currency || 'INR'}
        expenseToEdit={expenseToEdit}
        isLoading={createExpenseMutation.isPending || updateExpenseMutation.isPending}
      />

      {/* Add Member Modal */}
      <AddMemberModal
        isOpen={isAddMemberOpen}
        onClose={() => setIsAddMemberOpen(false)}
        onAddMember={async (email) => {
          await addMemberMutation.mutateAsync(email);
        }}
        isLoading={addMemberMutation.isPending}
      />

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        onSubmit={async (data) => {
          const res = await recordPaymentMutation.mutateAsync(data);
          return res;
        }}
        members={members}
        initialFromUserId={paymentPreset?.fromUserId}
        initialToUserId={paymentPreset?.toUserId}
        initialAmountPaise={paymentPreset?.amountPaise}
        isLoading={recordPaymentMutation.isPending}
      />

      {/* Delete Expense Confirm Dialog */}
      <ConfirmDialog
        isOpen={!!expenseToDelete}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={() => {
          if (expenseToDelete) deleteExpenseMutation.mutate(expenseToDelete.id);
        }}
        title="Delete Expense"
        message={`Are you sure you want to delete "${expenseToDelete?.description}"? This will soft-delete the expense and restore all member balances.`}
        confirmLabel="Delete"
        isDangerous={true}
        isLoading={deleteExpenseMutation.isPending}
      />
    </div>
  );
};
