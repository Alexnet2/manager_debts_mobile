import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RouteProp } from '@react-navigation/native';
import dayjs from 'dayjs';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { DebtsStackParamList, Installment } from '../../types';
import { debtsService } from '../../services/debtsService';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/theme';
import { formatCurrency, debtStatusLabel, debtStatusColor } from '../../utils/format';
import AppInput from '../../components/common/AppInput';

type Props = {
  route: RouteProp<DebtsStackParamList, 'DebtDetail'>;
};

export default function DebtDetailScreen({ route }: Props) {
  const { debtId } = route.params;
  const queryClient = useQueryClient();
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [payModalVisible, setPayModalVisible] = useState(false);

  const [editingInstallment, setEditingInstallment] = useState<Installment | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editInterestAmount, setEditInterestAmount] = useState('');
  const [editInterestMode, setEditInterestMode] = useState<'currency' | 'percent'>('currency');
  const [editDueDate, setEditDueDate] = useState<Date>(new Date());
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [tempEditDate, setTempEditDate] = useState<Date>(new Date());

  const { data: debt, isLoading: debtLoading, refetch: refetchDebt } = useQuery({
    queryKey: ['debt', debtId],
    queryFn: () => debtsService.getById(debtId),
  });

  const { data: installments, isLoading: instLoading, refetch: refetchInst } = useQuery({
    queryKey: ['installments', debtId],
    queryFn: () => debtsService.getInstallments(debtId),
  });

  const payMutation = useMutation({
    mutationFn: (id: string) => debtsService.payInstallment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments', debtId] });
      queryClient.invalidateQueries({ queryKey: ['debt', debtId] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setPayModalVisible(false);
      setSelectedInstallment(null);
    },
    onError: (err: any) => {
      Alert.alert('Erro', err?.response?.data?.message || 'Erro ao quitar parcela.');
      setPayModalVisible(false);
    },
  });

  const openPayModal = (inst: Installment) => {
    setSelectedInstallment(inst);
    setPayModalVisible(true);
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { amount?: number; dueDate?: string; interestAmount?: number } }) =>
      debtsService.updateInstallment(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installments', debtId] });
      queryClient.invalidateQueries({ queryKey: ['debt', debtId] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setEditModalVisible(false);
      setEditingInstallment(null);
    },
    onError: (err: any) => {
      Alert.alert('Erro', err?.response?.data?.message || 'Erro ao editar parcela.');
    },
  });

  const openEditModal = (inst: Installment) => {
    setEditingInstallment(inst);
    setEditAmount(String(inst.amount).replace('.', ','));
    setEditInterestAmount(String(inst.interestAmount ?? 0).replace('.', ','));
    setEditInterestMode('currency');
    setEditDueDate(new Date(inst.dueDate));
    setEditModalVisible(true);
  };

  // Alterna a unidade do campo de juros (R$ ou % do principal), convertendo o valor já digitado
  const handleToggleInterestMode = (mode: 'currency' | 'percent') => {
    if (!editingInstallment || mode === editInterestMode) return;
    const principal = editingInstallment.principal ?? 0;
    const currentValue = parseFloat(editInterestAmount.replace(',', '.')) || 0;
    const converted =
      mode === 'percent'
        ? (principal > 0 ? (currentValue / principal) * 100 : 0)
        : (principal * currentValue) / 100;
    setEditInterestAmount(converted.toFixed(2).replace('.', ','));
    setEditInterestMode(mode);
  };

  const openEditDatePicker = () => {
    setTempEditDate(editDueDate);
    setShowEditDatePicker(true);
  };

  const confirmEditDate = (date: Date) => {
    setEditDueDate(date);
    setShowEditDatePicker(false);
  };

  const onEditDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (selected) setTempEditDate(selected);
    if (Platform.OS === 'android') confirmEditDate(selected ?? tempEditDate);
  };

  const handleEditSubmit = () => {
    if (!editingInstallment) return;
    const amount = parseFloat(editAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Erro', 'Valor inválido.');
      return;
    }
    const rawInterest = parseFloat(editInterestAmount.replace(',', '.'));
    if (isNaN(rawInterest) || rawInterest < 0) {
      Alert.alert('Erro', 'Juros inválido.');
      return;
    }
    const principal = editingInstallment.principal ?? 0;
    const interestAmount =
      editInterestMode === 'percent'
        ? parseFloat(((principal * rawInterest) / 100).toFixed(2))
        : rawInterest;
    updateMutation.mutate({
      id: editingInstallment._id,
      data: { amount, dueDate: editDueDate.toISOString(), interestAmount },
    });
  };

  const isLoading = debtLoading || instLoading;
  const refetch = () => { refetchDebt(); refetchInst(); };
  const person = debt?.personId as any;
  const statusColor = debt ? debtStatusColor(debt.status) : colors.textSecondary;
  const paidCount = installments?.filter((i) => i.status === 'paid').length || 0;
  const anyInstallmentPaid = (installments?.some((i) => i.status === 'paid')) ?? false;
  const totalAccrued = installments?.reduce((sum, i) => sum + (i.currentLateFees ?? 0), 0) || 0;

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} colors={[colors.secondary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Debt info */}
        {debt && (
          <View style={styles.debtCard}>
            <View style={styles.debtHeader}>
              <Text style={styles.debtDescription}>{debt.description}</Text>
              <View style={[styles.badge, { backgroundColor: `${statusColor}20` }]}>
                <Text style={[styles.badgeText, { color: statusColor }]}>{debtStatusLabel(debt.status)}</Text>
              </View>
            </View>

            {person?.name && (
              <View style={styles.personRow}>
                <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.personName}>{person.name}</Text>
              </View>
            )}

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Valor original</Text>
                <Text style={styles.statValue}>{formatCurrency(debt.totalAmount)}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Total com juros</Text>
                <Text style={[styles.statValue, { color: colors.warning }]}>
                  {formatCurrency(debt.totalWithInterest)}
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Taxa mensal</Text>
                <Text style={styles.statValue}>{debt.interestRate}%</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Juros diários (atraso)</Text>
                <Text style={styles.statValue}>{debt.dailyInterestRate ?? 0}%/dia</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Início</Text>
                <Text style={styles.statValue}>{dayjs(debt.startDate).format('DD/MM/YYYY')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Previsão de encerramento</Text>
                <Text style={styles.statValue}>
                  {debt.endDate ? dayjs(debt.endDate).format('DD/MM/YYYY') : '—'}
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Parcelas</Text>
                <Text style={styles.statValue}>{paidCount}/{debt.installmentsCount} pagas</Text>
              </View>
            </View>

            {/* Progress */}
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${debt.installmentsCount > 0 ? (paidCount / debt.installmentsCount) * 100 : 0}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>
                {formatCurrency((installments?.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0)) || 0)} recebido
              </Text>
            </View>

            {/* Juros acumulados em aberto */}
            {totalAccrued > 0 && (
              <View style={styles.accruedRow}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.accruedText}>
                  Juros acumulados em aberto: {formatCurrency(totalAccrued)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Installments */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parcelas</Text>
          <View style={styles.installmentList}>
            {installments?.map((inst) => {
              const isOverdue = inst.status === 'pending' && dayjs(inst.dueDate).isBefore(dayjs(), 'day');
              const color = inst.status === 'paid' ? colors.secondary : isOverdue ? colors.danger : colors.warning;
              const hasLateFees = (inst.currentLateFees ?? 0) > 0;
              return (
                <View key={inst._id} style={styles.installmentItem}>
                  <View style={[styles.instIcon, { backgroundColor: `${color}15` }]}>
                    <Ionicons
                      name={inst.status === 'paid' ? 'checkmark-circle' : isOverdue ? 'alert-circle' : 'time-outline'}
                      size={20}
                      color={color}
                    />
                  </View>
                  <View style={styles.instInfo}>
                    <Text style={styles.instNumber}>Parcela {inst.number}</Text>
                    <Text style={[styles.instDate, isOverdue && { color: colors.danger }]}>
                      {inst.status === 'paid'
                        ? `Pago em ${dayjs(inst.paidAt).format('DD/MM/YYYY')}${inst.lateFees && inst.lateFees > 0 ? ` · Juros: ${formatCurrency(inst.lateFees)}` : ''}`
                        : dayjs(inst.dueDate).format('DD/MM/YYYY')}
                    </Text>
                    {hasLateFees && (
                      <Text style={styles.lateFeeText}>
                        +{formatCurrency(inst.currentLateFees!)} juros ({inst.currentLateDays} dias)
                      </Text>
                    )}
                    {!!inst.interestAmount && (
                      <Text style={styles.breakdownText}>
                        Principal: {formatCurrency(inst.principal ?? 0)} · Juros: {formatCurrency(inst.interestAmount)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.instAmountCol}>
                    <Text style={[styles.instAmount, { color }]}>{formatCurrency(inst.amount)}</Text>
                    {hasLateFees && (
                      <Text style={styles.instAmountUpdated}>
                        {formatCurrency(inst.amount + (inst.currentLateFees ?? 0))}
                      </Text>
                    )}
                  </View>
                  {inst.status === 'pending' && (
                    <View style={styles.instActions}>
                      {!anyInstallmentPaid && (
                        <TouchableOpacity
                          style={styles.editBtn}
                          onPress={() => openEditModal(inst)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="pencil-outline" size={14} color={colors.textSecondary} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.payBtn}
                        onPress={() => openPayModal(inst)}
                      >
                        <Text style={styles.payBtnText}>Pagar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Pay Modal */}
      <Modal
        visible={payModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPayModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Confirmar pagamento</Text>

            {selectedInstallment && (
              <>
                <View style={styles.modalInfo}>
                  <Text style={styles.modalLabel}>Parcela</Text>
                  <Text style={styles.modalValue}>{selectedInstallment.number}</Text>
                </View>
                <View style={styles.modalInfo}>
                  <Text style={styles.modalLabel}>Vencimento</Text>
                  <Text style={styles.modalValue}>
                    {dayjs(selectedInstallment.dueDate).format('DD/MM/YYYY')}
                  </Text>
                </View>
                <View style={styles.modalInfo}>
                  <Text style={styles.modalLabel}>Valor</Text>
                  <Text style={[styles.modalValue, styles.modalAmount]}>
                    {formatCurrency(selectedInstallment.amount)}
                  </Text>
                </View>

                {(selectedInstallment.currentLateFees ?? 0) > 0 && (
                  <>
                    <View style={styles.modalInfo}>
                      <Text style={styles.modalLabel}>Juros de atraso ({selectedInstallment.currentLateDays} dias)</Text>
                      <Text style={[styles.modalValue, { color: colors.danger }]}>
                        +{formatCurrency(selectedInstallment.currentLateFees!)}
                      </Text>
                    </View>
                    <View style={styles.modalInfo}>
                      <Text style={[styles.modalLabel, { fontWeight: typography.weights.bold }]}>Total a receber</Text>
                      <Text style={[styles.modalValue, styles.modalAmount]}>
                        {formatCurrency(selectedInstallment.amount + (selectedInstallment.currentLateFees ?? 0))}
                      </Text>
                    </View>
                  </>
                )}

                <Text style={styles.modalNote}>Confirmar o recebimento desta parcela?</Text>

                <TouchableOpacity
                  style={styles.confirmBtn}
                  onPress={() => payMutation.mutate(selectedInstallment._id)}
                  disabled={payMutation.isPending}
                >
                  <Text style={styles.confirmBtnText}>
                    {payMutation.isPending ? 'Processando...' : 'Confirmar pagamento'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setPayModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Editar parcela</Text>

            {editingInstallment && (
              <>
                <Text style={styles.editSubtitle}>Parcela {editingInstallment.number}</Text>

                <AppInput
                  label="Valor (R$)"
                  placeholder="0,00"
                  value={editAmount}
                  onChangeText={setEditAmount}
                  keyboardType="decimal-pad"
                  leftIcon="cash-outline"
                />

                <View style={styles.interestModeRow}>
                  <Text style={styles.label}>Juros</Text>
                  <View style={styles.modeToggle}>
                    <TouchableOpacity
                      style={[styles.modeButton, editInterestMode === 'currency' && styles.modeButtonActive]}
                      onPress={() => handleToggleInterestMode('currency')}
                    >
                      <Text style={[styles.modeButtonText, editInterestMode === 'currency' && styles.modeButtonTextActive]}>
                        R$
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modeButton, editInterestMode === 'percent' && styles.modeButtonActive]}
                      onPress={() => handleToggleInterestMode('percent')}
                    >
                      <Text style={[styles.modeButtonText, editInterestMode === 'percent' && styles.modeButtonTextActive]}>
                        %
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <AppInput
                  placeholder="0,00"
                  value={editInterestAmount}
                  onChangeText={setEditInterestAmount}
                  keyboardType="decimal-pad"
                  leftIcon="trending-up-outline"
                />

                <Text style={styles.label}>Vencimento</Text>
                <TouchableOpacity style={styles.dateButton} onPress={openEditDatePicker} activeOpacity={0.7}>
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                  <Text style={styles.dateButtonValue}>{dayjs(editDueDate).format('DD/MM/YYYY')}</Text>
                </TouchableOpacity>

                {showEditDatePicker && Platform.OS === 'android' && (
                  <DateTimePicker value={tempEditDate} mode="date" display="default" onChange={onEditDateChange} />
                )}

                {showEditDatePicker && Platform.OS === 'ios' && (
                  <Modal transparent animationType="fade" visible>
                    <View style={styles.pickerModalOverlay}>
                      <View style={styles.pickerModalContent}>
                        <View style={styles.pickerModalHandle} />
                        <Text style={styles.pickerModalTitle}>Vencimento</Text>
                        <DateTimePicker
                          value={tempEditDate}
                          mode="date"
                          display="spinner"
                          onChange={onEditDateChange}
                          locale="pt-BR"
                          style={{ width: '100%' }}
                        />
                        <View style={styles.pickerModalActions}>
                          <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setShowEditDatePicker(false)}>
                            <Text style={styles.pickerCancelText}>Cancelar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.pickerConfirmBtn} onPress={() => confirmEditDate(tempEditDate)}>
                            <Text style={styles.pickerConfirmText}>Confirmar</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </Modal>
                )}

                <TouchableOpacity
                  style={[styles.confirmBtn, { marginTop: spacing.md }]}
                  onPress={handleEditSubmit}
                  disabled={updateMutation.isPending}
                >
                  <Text style={styles.confirmBtnText}>
                    {updateMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  debtCard: {
    backgroundColor: colors.primary,
    padding: spacing.lg,
    margin: spacing.lg,
    borderRadius: borderRadius.lg,
    ...shadows.lg,
  },
  debtHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  debtDescription: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textLight,
    flex: 1,
    marginRight: spacing.sm,
  },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  badgeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  personName: { fontSize: typography.sizes.md, color: 'rgba(255,255,255,0.8)' },
  statsRow: { flexDirection: 'row', marginBottom: spacing.sm },
  statItem: { flex: 1 },
  statLabel: { fontSize: typography.sizes.xs, color: 'rgba(255,255,255,0.6)', marginBottom: 2 },
  statValue: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textLight },
  progressContainer: { marginTop: spacing.md },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressFill: { height: '100%', backgroundColor: colors.secondary, borderRadius: 4 },
  progressLabel: { fontSize: typography.sizes.xs, color: 'rgba(255,255,255,0.7)' },
  section: { paddingHorizontal: spacing.lg },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  installmentList: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  installmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: spacing.sm,
  },
  instIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  instInfo: { flex: 1 },
  instNumber: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.textPrimary },
  instDate: { fontSize: typography.sizes.xs, color: colors.textSecondary },
  lateFeeText: { fontSize: typography.sizes.xs, color: colors.danger, marginTop: 2 },
  breakdownText: { fontSize: typography.sizes.xs, color: colors.textMuted, marginTop: 2 },
  instAmountCol: { alignItems: 'flex-end' },
  instAmount: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  instAmountUpdated: { fontSize: typography.sizes.xs, color: colors.danger, marginTop: 2 },
  instActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  editBtn: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accruedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    backgroundColor: `${colors.danger}15`,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
  },
  accruedText: { fontSize: typography.sizes.sm, color: colors.danger, fontWeight: typography.weights.semibold },
  payBtn: {
    backgroundColor: colors.secondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  payBtnText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, color: colors.textLight },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  modalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  modalInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalLabel: { fontSize: typography.sizes.md, color: colors.textSecondary },
  modalValue: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.textPrimary },
  modalAmount: { fontSize: typography.sizes.lg, color: colors.secondary },
  modalNote: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginVertical: spacing.md,
    textAlign: 'center',
  },
  confirmBtn: {
    backgroundColor: colors.secondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  confirmBtnText: { color: colors.textLight, fontWeight: typography.weights.bold, fontSize: typography.sizes.md },
  cancelBtn: { padding: spacing.md, alignItems: 'center' },
  cancelBtnText: { color: colors.textSecondary, fontSize: typography.sizes.md },
  editSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  interestModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  modeToggle: {
    flexDirection: 'row',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  modeButton: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.card,
  },
  modeButtonActive: { backgroundColor: colors.primary },
  modeButtonText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: colors.textSecondary,
  },
  modeButtonTextActive: { color: colors.textLight },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dateButtonValue: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  pickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerModalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: 40,
    alignItems: 'center',
  },
  pickerModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginBottom: spacing.md,
  },
  pickerModalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  pickerModalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    width: '100%',
  },
  pickerCancelBtn: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerCancelText: { color: colors.textSecondary, fontWeight: typography.weights.semibold },
  pickerConfirmBtn: {
    flex: 1,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  pickerConfirmText: { color: colors.textLight, fontWeight: typography.weights.bold },
});
