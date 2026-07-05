import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  RefreshControl,
  Pressable,
  Platform,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BarChart, LineChart } from 'react-native-chart-kit';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import dayjs, { Dayjs } from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { dashboardService } from '../../services/dashboardService';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/theme';
import { formatCurrency } from '../../utils/format';
import { MonthlyDebt, MonthlyReceived, MonthlyInterest } from '../../types';

const screenWidth = Dimensions.get('window').width - spacing.lg * 2;
const MIN_PX_PER_MONTH = 50;

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type ChartType = 'lent' | 'received' | 'interest';
type RangePreset = 3 | 6 | 12 | 24 | 'custom';

const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: 3, label: '3M' },
  { key: 6, label: '6M' },
  { key: 12, label: '12M' },
  { key: 24, label: '24M' },
  { key: 'custom', label: 'Personalizado' },
];

const hexToRgba = (hex: string, opacity: number) => {
  const parsed = hex.replace('#', '');
  const r = parseInt(parsed.substring(0, 2), 16);
  const g = parseInt(parsed.substring(2, 4), 16);
  const b = parseInt(parsed.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const SERIES_META: { key: ChartType; label: string; color: string }[] = [
  { key: 'lent', label: 'Emprestado', color: colors.warning },
  { key: 'received', label: 'Recebido', color: colors.secondary },
  { key: 'interest', label: 'Juros', color: colors.info },
];

export default function ReportsScreen() {
  const [activeChart, setActiveChart] = useState<ChartType>('lent');
  const [visibleSeries, setVisibleSeries] = useState<Record<ChartType, boolean>>({
    lent: true,
    received: true,
    interest: true,
  });

  const [rangePreset, setRangePreset] = useState<RangePreset>(6);
  const [customStart, setCustomStart] = useState<Date>(dayjs().subtract(5, 'month').startOf('month').toDate());
  const [customEnd, setCustomEnd] = useState<Date>(dayjs().toDate());
  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());

  const toggleSeries = (key: ChartType) => {
    setVisibleSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const { rangeStart, rangeEnd }: { rangeStart: Dayjs; rangeEnd: Dayjs } = useMemo(() => {
    if (rangePreset === 'custom') {
      const start = dayjs(customStart).startOf('month');
      const end = dayjs(customEnd).startOf('month');
      return end.isBefore(start) ? { rangeStart: end, rangeEnd: start } : { rangeStart: start, rangeEnd: end };
    }
    const end = dayjs().startOf('month');
    return { rangeStart: end.subtract(rangePreset - 1, 'month'), rangeEnd: end };
  }, [rangePreset, customStart, customEnd]);

  const monthsInRange = useMemo(() => {
    const count = rangeEnd.diff(rangeStart, 'month') + 1;
    const showYear = count > 12;
    return Array.from({ length: count }, (_, i) => {
      const d = rangeStart.add(i, 'month');
      return {
        year: d.year(),
        month: d.month() + 1,
        label: showYear ? `${MONTH_NAMES[d.month()]}/${d.format('YY')}` : MONTH_NAMES[d.month()],
      };
    });
  }, [rangeStart, rangeEnd]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-reports', rangeStart.format('YYYY-MM'), rangeEnd.format('YYYY-MM')],
    queryFn: () =>
      dashboardService.getGlobal({
        startDate: rangeStart.toISOString(),
        endDate: rangeEnd.endOf('month').toISOString(),
      }),
  });

  const openPicker = (type: 'start' | 'end') => {
    setTempDate(type === 'start' ? customStart : customEnd);
    setActivePicker(type);
  };

  const onDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (selected) setTempDate(selected);
    if (Platform.OS === 'android') confirmDate(selected ?? tempDate);
  };

  const confirmDate = (date: Date) => {
    if (activePicker === 'start') setCustomStart(date);
    else if (activePicker === 'end') setCustomEnd(date);
    setActivePicker(null);
  };

  const rangeLabel =
    rangePreset === 'custom'
      ? `${rangeStart.format('MM/YYYY')} a ${rangeEnd.format('MM/YYYY')}`
      : `${rangePreset} meses`;

  // Monta os meses do período selecionado com dados
  const buildChartData = () => {
    const labels: string[] = [];
    const values: number[] = [];

    const monthlyDebts: MonthlyDebt[] = data?.monthlyData?.monthlyDebts || [];
    const monthlyReceived: MonthlyReceived[] = data?.monthlyData?.monthlyReceived || [];
    const monthlyInterest: MonthlyInterest[] = data?.monthlyData?.monthlyInterest || [];

    monthsInRange.forEach(({ year, month, label }) => {
      labels.push(label);

      if (activeChart === 'lent') {
        const found = monthlyDebts.find((m) => m._id.year === year && m._id.month === month);
        values.push(found?.totalLent || 0);
      } else if (activeChart === 'interest') {
        const found = monthlyInterest.find((m) => m._id.year === year && m._id.month === month);
        values.push(found?.totalInterest || 0);
      } else {
        const found = monthlyReceived.find((m) => m._id.year === year && m._id.month === month);
        values.push(found?.totalReceived || 0);
      }
    });

    return { labels, datasets: [{ data: values.length ? values : [0] }] };
  };

  // Monta o período selecionado com as três séries juntas (para o gráfico de linha)
  const buildCombinedMonthlyData = () => {
    const labels: string[] = [];
    const values: Record<ChartType, number[]> = { lent: [], received: [], interest: [] };

    const monthlyDebts: MonthlyDebt[] = data?.monthlyData?.monthlyDebts || [];
    const monthlyReceived: MonthlyReceived[] = data?.monthlyData?.monthlyReceived || [];
    const monthlyInterest: MonthlyInterest[] = data?.monthlyData?.monthlyInterest || [];

    monthsInRange.forEach(({ year, month, label }) => {
      labels.push(label);

      const foundDebt = monthlyDebts.find((m) => m._id.year === year && m._id.month === month);
      const foundReceived = monthlyReceived.find((m) => m._id.year === year && m._id.month === month);
      const foundInterest = monthlyInterest.find((m) => m._id.year === year && m._id.month === month);

      values.lent.push(foundDebt?.totalLent || 0);
      values.received.push(foundReceived?.totalReceived || 0);
      values.interest.push(foundInterest?.totalInterest || 0);
    });

    return { labels, values };
  };

  const chartConfig = {
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    color: () =>
      activeChart === 'lent' ? colors.warning : activeChart === 'interest' ? colors.info : colors.secondary,
    labelColor: () => colors.textSecondary,
    barPercentage: 0.65,
    decimalPlaces: 0,
    propsForBackgroundLines: { stroke: colors.divider },
  };

  const totals = data?.totals;
  const chartInnerWidth = Math.max(screenWidth - spacing.lg * 2, monthsInRange.length * MIN_PX_PER_MONTH);

  const combined = buildCombinedMonthlyData();
  const activeSeriesMeta = SERIES_META.filter((s) => visibleSeries[s.key]);
  const lineChartData = {
    labels: combined.labels,
    datasets: activeSeriesMeta.map((s) => ({
      data: combined.values[s.key],
      color: (opacity = 1) => hexToRgba(s.color, opacity),
      strokeWidth: 2,
    })),
  };
  const lineChartConfig = {
    backgroundGradientFrom: colors.card,
    backgroundGradientTo: colors.card,
    color: () => colors.textSecondary,
    labelColor: () => colors.textSecondary,
    decimalPlaces: 0,
    propsForBackgroundLines: { stroke: colors.divider },
    propsForDots: { r: '4' },
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} colors={[colors.secondary]} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Total cards */}
      <View style={styles.totalGrid}>
        <View style={[styles.totalCard, { borderTopColor: colors.warning }]}>
          <Text style={styles.totalCardLabel}>Total emprestado</Text>
          <Text style={[styles.totalCardValue, { color: colors.warning }]}>
            {formatCurrency(totals?.totalLent || 0)}
          </Text>
        </View>
        <View style={[styles.totalCard, { borderTopColor: colors.secondary }]}>
          <Text style={styles.totalCardLabel}>Total recebido</Text>
          <Text style={[styles.totalCardValue, { color: colors.secondary }]}>
            {formatCurrency(totals?.totalReceived || 0)}
          </Text>
        </View>
        <View style={[styles.totalCard, { borderTopColor: colors.info }]}>
          <Text style={styles.totalCardLabel}>Total de juros</Text>
          <Text style={[styles.totalCardValue, { color: colors.info }]}>
            {formatCurrency(totals?.totalInterest || 0)}
          </Text>
        </View>
        <View style={[styles.totalCard, { borderTopColor: colors.danger }]}>
          <Text style={styles.totalCardLabel}>A receber</Text>
          <Text style={[styles.totalCardValue, { color: colors.danger }]}>
            {formatCurrency(totals?.totalPending || 0)}
          </Text>
        </View>
      </View>

      {/* Period selector */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Período</Text>
        <View style={styles.periodRow}>
          {RANGE_PRESETS.map((preset) => (
            <Pressable
              key={preset.key}
              style={[styles.periodChip, rangePreset === preset.key && styles.periodChipActive]}
              onPress={() => setRangePreset(preset.key)}
            >
              <Text
                style={[styles.periodChipText, rangePreset === preset.key && styles.periodChipTextActive]}
              >
                {preset.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {rangePreset === 'custom' && (
          <View style={styles.customDateRow}>
            <TouchableOpacity style={styles.customDateButton} onPress={() => openPicker('start')} activeOpacity={0.7}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <View>
                <Text style={styles.customDateLabel}>De</Text>
                <Text style={styles.customDateValue}>{dayjs(customStart).format('MM/YYYY')}</Text>
              </View>
            </TouchableOpacity>

            <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />

            <TouchableOpacity style={styles.customDateButton} onPress={() => openPicker('end')} activeOpacity={0.7}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <View>
                <Text style={styles.customDateLabel}>Até</Text>
                <Text style={styles.customDateValue}>{dayjs(customEnd).format('MM/YYYY')}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {activePicker !== null && Platform.OS === 'android' && (
          <DateTimePicker value={tempDate} mode="date" display="default" onChange={onDateChange} />
        )}

        {activePicker !== null && Platform.OS === 'ios' && (
          <Modal transparent animationType="slide" visible>
            <View style={styles.pickerModalOverlay}>
              <View style={styles.pickerModalContent}>
                <View style={styles.pickerModalHandle} />
                <Text style={styles.pickerModalTitle}>
                  {activePicker === 'start' ? 'Data inicial' : 'Data final'}
                </Text>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="spinner"
                  onChange={onDateChange}
                  locale="pt-BR"
                  style={{ width: '100%' }}
                />
                <View style={styles.pickerModalActions}>
                  <TouchableOpacity style={styles.pickerCancelBtn} onPress={() => setActivePicker(null)}>
                    <Text style={styles.pickerCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.pickerConfirmBtn} onPress={() => confirmDate(tempDate)}>
                    <Text style={styles.pickerConfirmText}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>

      {/* Chart */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Evolução mensal ({rangeLabel})</Text>

        <View style={styles.chartTabs}>
          {(
            [
              ['lent', 'Emprestado'],
              ['received', 'Recebido'],
              ['interest', 'Juros'],
            ] as [ChartType, string][]
          ).map(
            ([type, label]) => (
              <View
                key={type}
                style={[styles.chartTab, activeChart === type && styles.chartTabActive]}
              >
                <Text
                  style={[styles.chartTabText, activeChart === type && styles.chartTabTextActive]}
                  onPress={() => setActiveChart(type)}
                >
                  {label}
                </Text>
              </View>
            )
          )}
        </View>

        {!isLoading && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <BarChart
              data={buildChartData()}
              width={chartInnerWidth}
              height={220}
              chartConfig={chartConfig}
              style={styles.chart}
              showValuesOnTopOfBars
              fromZero
              yAxisLabel="R$"
              yAxisSuffix=""
            />
          </ScrollView>
        )}
      </View>

      {/* Combined line chart */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Comparativo mensal</Text>

        <View style={styles.legendRow}>
          {SERIES_META.map((s) => {
            const active = visibleSeries[s.key];
            return (
              <Pressable
                key={s.key}
                style={[styles.legendChip, !active && styles.legendChipInactive]}
                onPress={() => toggleSeries(s.key)}
              >
                <View style={[styles.legendDot, { backgroundColor: active ? s.color : colors.divider }]} />
                <Text style={[styles.legendText, !active && styles.legendTextInactive]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {!isLoading && activeSeriesMeta.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <LineChart
              data={lineChartData}
              width={chartInnerWidth}
              height={220}
              chartConfig={lineChartConfig}
              style={styles.chart}
              bezier
              fromZero
              yAxisLabel="R$"
              yAxisSuffix=""
            />
          </ScrollView>
        )}

        {!isLoading && activeSeriesMeta.length === 0 && (
          <Text style={styles.emptyLegendText}>Selecione ao menos uma série para visualizar.</Text>
        )}
      </View>

      {/* Summary details */}
      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Resumo geral</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total de pessoas</Text>
          <Text style={styles.summaryValue}>{totals?.totalPeople || 0}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total de dívidas</Text>
          <Text style={styles.summaryValue}>{totals?.totalDebts || 0}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Dívidas ativas</Text>
          <Text style={[styles.summaryValue, { color: colors.warning }]}>
            {data?.debtsByStatus?.active || 0}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Dívidas vencidas</Text>
          <Text style={[styles.summaryValue, { color: colors.danger }]}>
            {data?.debtsByStatus?.overdue || 0}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Dívidas quitadas</Text>
          <Text style={[styles.summaryValue, { color: colors.secondary }]}>
            {data?.debtsByStatus?.paid || 0}
          </Text>
        </View>
      </View>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  totalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  totalCard: {
    width: '47%',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderTopWidth: 3,
    ...shadows.sm,
  },
  totalCardLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  totalCardValue: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
  },
  chartCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  chartTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  chartTabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  chartTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
  },
  chartTabActive: { backgroundColor: colors.primary },
  chartTabText: { fontSize: typography.sizes.sm, color: colors.textSecondary, fontWeight: typography.weights.medium },
  chartTabTextActive: { color: colors.textLight },
  chart: { borderRadius: borderRadius.sm, marginLeft: -spacing.md },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
  },
  legendChipInactive: { opacity: 0.5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: typography.sizes.sm, color: colors.textPrimary, fontWeight: typography.weights.medium },
  legendTextInactive: { color: colors.textSecondary },
  emptyLegendText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  periodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
  },
  periodChipActive: { backgroundColor: colors.primary },
  periodChipText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontWeight: typography.weights.medium,
  },
  periodChipTextActive: { color: colors.textLight },
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  customDateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  customDateLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
  },
  customDateValue: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
  // iOS date picker modal
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
  summaryCard: {
    backgroundColor: colors.card,
    margin: spacing.lg,
    marginTop: spacing.md,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  summaryLabel: { fontSize: typography.sizes.md, color: colors.textSecondary },
  summaryValue: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
  },
});
