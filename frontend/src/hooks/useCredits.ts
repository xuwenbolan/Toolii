import { useQuery } from '@tanstack/react-query'

import { fetchCreditsBalance, fetchCreditTransactions } from '@/services/creditsApi'
import { useAuthStore } from '@/stores/authStore'

type Options = {
  enabled?: boolean
  includeTransactions?: boolean
  transactionsLimit?: number
}

export function useCredits(options?: Options) {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const enabled = Boolean(options?.enabled ?? true) && Boolean(user && accessToken)
  const includeTransactions = Boolean(options?.includeTransactions ?? false)
  const transactionsLimit = options?.transactionsLimit ?? 5

  const balanceQuery = useQuery({
    queryKey: ['credits', 'balance'],
    queryFn: fetchCreditsBalance,
    enabled,
    staleTime: 15_000,
  })

  const transactionsQuery = useQuery({
    queryKey: ['credits', 'transactions', transactionsLimit],
    queryFn: () => fetchCreditTransactions({ limit: transactionsLimit, offset: 0 }),
    enabled: enabled && includeTransactions,
    staleTime: 10_000,
  })

  return {
    balance: balanceQuery.data?.balance ?? null,
    transactions: transactionsQuery.data?.items ?? [],
    transactionsTotal: transactionsQuery.data?.total ?? 0,
    balancePending: balanceQuery.isLoading || balanceQuery.isFetching,
    transactionsPending: transactionsQuery.isLoading || transactionsQuery.isFetching,
    balanceError: balanceQuery.error instanceof Error ? balanceQuery.error.message : null,
    transactionsError: transactionsQuery.error instanceof Error ? transactionsQuery.error.message : null,
    refreshBalance: balanceQuery.refetch,
    refreshTransactions: transactionsQuery.refetch,
    refreshAll: async () => {
      await balanceQuery.refetch()
      if (enabled && includeTransactions) {
        await transactionsQuery.refetch()
      }
    },
  }
}
