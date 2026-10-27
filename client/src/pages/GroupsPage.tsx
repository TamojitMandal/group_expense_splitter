import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { Modal } from '../components/Modal';
import { apiRequest, ApiError } from '../api/client';
import { formatINR } from '../lib/money';
import {
  Users,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface GroupSummary {
  id: string;
  name: string;
  currency: string;
  createdAt: string;
  role: string;
  memberCount: number;
  myNetPaise: number;
}

export const GroupsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [createError, setCreateError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ groups: GroupSummary[] }>({
    queryKey: ['groups'],
    queryFn: () => apiRequest('/groups'),
  });

  const createGroupMutation = useMutation({
    mutationFn: (newGroup: { name: string; currency: string }) =>
      apiRequest('/groups', {
        method: 'POST',
        body: JSON.stringify(newGroup),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      setIsCreateModalOpen(false);
      setGroupName('');
      setCreateError(null);
    },
    onError: (err: any) => {
      if (err instanceof ApiError) {
        setCreateError(err.message);
      } else {
        setCreateError('Failed to create group. Please try again.');
      }
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    createGroupMutation.mutate({ name: groupName.trim(), currency });
  };

  const groups = data?.groups || [];

  // Calculate overall net balance across all groups
  const totalNetPaise = groups.reduce((acc, g) => acc + g.myNetPaise, 0);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar onCreateGroup={() => setIsCreateModalOpen(true)} />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        {/* Overall Balance Summary Card */}
        <div className="mb-8 p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-xl shadow-slate-900/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <p className="text-slate-400 text-xs font-semibold tracking-wider uppercase flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brand-400" />
                Overall Balance Summary
              </p>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight">
                {formatINR(totalNetPaise)}
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                {totalNetPaise > 0 ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 inline" /> You are owed overall
                  </span>
                ) : totalNetPaise < 0 ? (
                  <span className="text-rose-400 font-medium flex items-center gap-1">
                    <TrendingDown className="w-4 h-4 inline" /> You owe overall
                  </span>
                ) : (
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 inline" /> You are all settled up overall
                  </span>
                )}
              </p>
            </div>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-slate-950 font-bold text-sm shadow-lg shadow-brand-500/20 transition-all hover:scale-105 touch-target"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Create New Group</span>
            </button>
          </div>
        </div>

        {/* Groups Section Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Your Expense Groups</h1>
            <p className="text-xs text-slate-500 mt-0.5">Manage splits, payments, and member debts</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-200 text-slate-700">
            {groups.length} {groups.length === 1 ? 'Group' : 'Groups'}
          </span>
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 mb-6">
            Failed to load groups. Please refresh or check your connection.
          </div>
        )}

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-32 rounded-2xl bg-white border border-slate-200 p-5 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && groups.length === 0 && (
          <div className="text-center py-16 px-4 bg-white rounded-3xl border border-dashed border-slate-300">
            <div className="w-16 h-16 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-900">No expense groups yet</h3>
            <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
              Create your first group for roommates, trips, or outings to start tracking shared expenses.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm shadow-sm transition-colors touch-target"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create a Group</span>
            </button>
          </div>
        )}

        {/* Group Cards Grid */}
        {!isLoading && groups.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((group) => {
              const isPositive = group.myNetPaise > 0;
              const isNegative = group.myNetPaise < 0;

              return (
                <Link
                  key={group.id}
                  to={`/groups/${group.id}`}
                  className="group relative p-5 bg-white rounded-2xl border border-slate-200 hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-500/5 transition-all duration-200 flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-lg group-hover:bg-brand-50 group-hover:text-brand-600 group-hover:border-brand-200 transition-colors">
                        {group.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h2 className="font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                          {group.name}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {group.memberCount} members
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                            {group.role === 'OWNER' && (
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                            )}
                            {group.role}
                          </span>
                        </div>
                      </div>
                    </div>

                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
                  </div>

                  {/* Net Balance Status */}
                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">Your Balance</span>
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
                        {formatINR(group.myNetPaise)}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">
                        {isPositive ? 'you get back' : isNegative ? 'you owe' : 'settled up'}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Group Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Expense Group"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
              {createError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700">Group Name</label>
            <input
              type="text"
              required
              maxLength={80}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g., Goa Trip 2026, Flat 402"
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-brand-500 focus:border-brand-500 outline-none touch-target"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-brand-500 focus:border-brand-500 outline-none touch-target"
            >
              <option value="INR">INR (₹ - Indian Rupee)</option>
              <option value="USD">USD ($ - US Dollar)</option>
              <option value="EUR">EUR (€ - Euro)</option>
              <option value="GBP">GBP (£ - British Pound)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors touch-target"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createGroupMutation.isPending || !groupName.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 rounded-lg shadow-sm transition-colors touch-target"
            >
              {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
