import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { PeopleStackParamList, Debt } from '../../types';
import { dashboardService } from '../../services/dashboardService';
import { debtsService } from '../../services/debtsService';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/theme';
import { formatCurrency, debtStatusLabel, debtStatusColor, scoreClassificationColor } from '../../utils/format';

type Props = {
  navigation: NativeStackNavigationProp<PeopleStackParamList, 'PersonDetail'>;
  route: RouteProp<PeopleStackParamList, 'PersonDetail'>;
};

export default function PersonDetailScreen({ navigation, route }: Props) {
  const { personId } = route.params;

  const { data: dashboard, isLoading: dashLoading, refetch: refetchDash } = useQuery({
    queryKey: ['personDashboard', personId],
    queryFn: () => dashboardService.getPerson(personId),
  });

  const { data: debts, isLoading: debtsLoading, refetch: refetchDebts } = useQuery({
    queryKey: ['personDebts', personId],
    queryFn: () => debtsService.getByPerson(personId),
  });

  const { data: score, isLoading: scoreLoading, refetch: refetchScore } = useQuery({
    queryKey: ['personScore', personId],
    queryFn: () => dashboardService.getPersonScore(personId),
  });

  const isLoading = dashLoading || debtsLoading || scoreLoading;
  const refetch = () => { refetchDash(); refetchDebts(); refetchScore(); };

  const renderDebtItem = (debt: Debt) => {
    const statusColor = debtStatusColor(debt.status);
    return (
      <TouchableOpacity
        key={debt._id}
        style={styles.debtCard}
        onPress={() => navigation.getParent()?.navigate('Debts', { screen: 'DebtDetail', params: { debtId: debt._id } })}
        activeOpacity={0.7}
      >
        <View style={styles.debtHeader}>
          <Text style={styles.debtDescription} numberOfLines={1}>{debt.description}</Text>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{debtStatusLabel(debt.status)}</Text>
          </View>
        </View>
        <View style={styles.debtRow}>
          <Text style={styles.debtMeta}>{debt.installmentsCount}x de {formatCurrency(debt.installmentAmount)}</Text>
          <Text style={styles.debtTotal}>{formatCurrency(debt.totalWithInterest)}</Text>
        </View>
        <Text style={styles.debtDate}>Início: {dayjs(debt.startDate).format('DD/MM/YYYY')}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} colors={[colors.secondary]} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Score interno de pagamento */}
      {score && (
        <View style={styles.section}>
          <View style={styles.scoreCard}>
            <View style={styles.scoreHeader}>
              <View style={styles.scoreHeaderLeft}>
                <Ionicons name="speedometer-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.scoreTitle}>Score de pagamento</Text>
              </View>
              {score.recurrence.isRecurring && (
                <View style={styles.recurringBadge}>
                  <Ionicons name="repeat-outline" size={12} color={colors.info} />
                  <Text style={styles.recurringBadgeText}>Recorrente</Text>
                </View>
              )}
            </View>

            <View style={styles.scoreBody}>
              <Text style={[styles.scoreValue, { color: scoreClassificationColor(score.classification) }]}>
                {score.score}
                <Text style={styles.scoreMax}> /1000</Text>
              </Text>
              <View
                style={[
                  styles.classificationBadge,
                  { backgroundColor: `${scoreClassificationColor(score.classification)}20` },
                ]}
              >
                <Text style={[styles.classificationText, { color: scoreClassificationColor(score.classification) }]}>
                  {score.classification}
                </Text>
              </View>
            </View>

            <Text style={styles.scoreBehavior}>{score.paymentBehavior.label}</Text>

            {score.paymentBehavior.totalPaidInstallments > 0 && (
              <Text style={styles.scoreDetail}>
                {score.paymentBehavior.onTimeCount} em dia · {score.paymentBehavior.lateCount} em atraso
                {score.paymentBehavior.averageLateDays > 0
                  ? ` (média de ${score.paymentBehavior.averageLateDays} dias)`
                  : ''}
              </Text>
            )}

            {score.paymentBehavior.overdueNowCount > 0 && (
              <Text style={[styles.scoreDetail, { color: colors.danger }]}>
                {score.paymentBehavior.overdueNowCount} parcela(s) vencida(s) sem pagamento no momento
              </Text>
            )}

            <Text style={styles.scoreDetail}>{score.recurrence.label}</Text>
          </View>
        </View>
      )}

      {/* Dashboard cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderTopColor: colors.secondary }]}>
          <Ionicons name="checkmark-circle-outline" size={22} color={colors.secondary} />
          <Text style={styles.statValue}>{formatCurrency(dashboard?.totalPaid || 0)}</Text>
          <Text style={styles.statLabel}>Total pago</Text>
        </View>
        <View style={[styles.statCard, { borderTopColor: colors.warning }]}>
          <Ionicons name="time-outline" size={22} color={colors.warning} />
          <Text style={styles.statValue}>{formatCurrency(dashboard?.totalPending || 0)}</Text>
          <Text style={styles.statLabel}>Em aberto</Text>
        </View>
        <View style={[styles.statCard, { borderTopColor: colors.info }]}>
          <Ionicons name="document-text-outline" size={22} color={colors.info} />
          <Text style={styles.statValue}>{dashboard?.totalDebts || 0}</Text>
          <Text style={styles.statLabel}>Dívidas</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderTopColor: colors.secondary }]}>
          <Ionicons name="trending-up-outline" size={22} color={colors.secondary} />
          <Text style={styles.statValue}>{formatCurrency(dashboard?.totalInterestPaid || 0)}</Text>
          <Text style={styles.statLabel}>Juros pago</Text>
        </View>
        <View style={[styles.statCard, { borderTopColor: colors.danger }]}>
          <Ionicons name="trending-up-outline" size={22} color={colors.danger} />
          <Text style={styles.statValue}>{formatCurrency(dashboard?.totalInterestPending || 0)}</Text>
          <Text style={styles.statLabel}>Juros restante</Text>
        </View>
      </View>

      {/* Próximos vencimentos */}
      {dashboard?.nextInstallments && dashboard.nextInstallments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Próximas parcelas</Text>
          <View style={styles.installmentList}>
            {dashboard.nextInstallments.map((inst) => {
              const overdue = dayjs(inst.dueDate).isBefore(dayjs(), 'day');
              return (
                <View key={inst._id} style={styles.installmentItem}>
                  <Text style={styles.installmentNum}>Parcela {inst.number}</Text>
                  <Text style={[styles.installmentDate, overdue && { color: colors.danger }]}>
                    {dayjs(inst.dueDate).format('DD/MM/YYYY')}
                  </Text>
                  <Text style={styles.installmentAmount}>{formatCurrency(inst.amount)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Debts list */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Dívidas</Text>
          <TouchableOpacity
            onPress={() =>
              navigation.getParent()?.navigate('Debts', {
                screen: 'AddDebt',
                params: { personId, personName: route.params.personName },
              })
            }
          >
            <Text style={styles.addText}>+ Nova dívida</Text>
          </TouchableOpacity>
        </View>

        {!debtsLoading && (!debts || debts.length === 0) ? (
          <View style={styles.emptyDebts}>
            <Text style={styles.emptyText}>Nenhuma dívida cadastrada</Text>
          </View>
        ) : (
          debts?.map(renderDebtItem)
        )}
      </View>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderTopWidth: 3,
    ...shadows.sm,
  },
  statValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  statLabel: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
  section: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  scoreCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  scoreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  scoreHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  scoreTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: colors.textPrimary },
  recurringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.info}20`,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  recurringBadgeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold, color: colors.info },
  scoreBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  scoreValue: { fontSize: typography.sizes.xxxl, fontWeight: typography.weights.extrabold },
  scoreMax: { fontSize: typography.sizes.sm, fontWeight: typography.weights.regular, color: colors.textMuted },
  classificationBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  classificationText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  scoreBehavior: { fontSize: typography.sizes.sm, color: colors.textPrimary, fontWeight: typography.weights.medium, marginBottom: 2 },
  scoreDetail: { fontSize: typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  addText: { fontSize: typography.sizes.sm, color: colors.secondary, fontWeight: typography.weights.semibold },
  installmentList: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  installmentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  installmentNum: { fontSize: typography.sizes.sm, color: colors.textSecondary, width: 80 },
  installmentDate: { fontSize: typography.sizes.sm, color: colors.textSecondary, flex: 1, textAlign: 'center' },
  installmentAmount: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.textPrimary },
  debtCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  debtHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  debtDescription: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.full },
  statusText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  debtRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  debtMeta: { fontSize: typography.sizes.sm, color: colors.textSecondary },
  debtTotal: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textPrimary },
  debtDate: { fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 2 },
  emptyDebts: { paddingVertical: spacing.lg, alignItems: 'center' },
  emptyText: { color: colors.textSecondary },
});
