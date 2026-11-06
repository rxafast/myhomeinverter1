export interface RawInverterTelemetry {
  deviceId: string;
  solarWatts: string;
  solarVoltage: string;
  solarAmpere: string;
  loadWatts: string;
  loadVa: string;
  loadVoltage: string;
  loadAmpere: string;
  loadPercentage: string;
  gridWatts: string;
  gridVoltage: string;
  gridAmpere: string;
  gridHz: string;
  batteryVoltage: string;
  chargingAmpere: string;
  dischargingAmpere: string;
  batteryPercentage: string;
  mode: string;
  chargingMode: string;
  fanSpeed: string;
  time: string;
  mpptTemperature: string;
}

export interface MpptStringReading {
  watts: number;
  volts: number;
  amps: number;
}

export interface MpptRealtimeSummary {
  pv1: MpptStringReading;
  pv2: MpptStringReading;
  pv3: MpptStringReading;
  busV: number;
  acOutHz: number;
  panelCompany: string;
  panelWatts: number;
  panelCount: number;
  pvInstalledW: number;
  peakMpptSnapshot: {
    time: string;
    solarW: number;
    pv1W: number;
    pv1V: number;
    pv1A: number;
    pv2W: number;
    pv2V: number;
    pv2A: number;
  } | null;
}

export interface ParsedTelemetry {
  deviceId: string;
  solarWatts: number;
  solarVoltage: number;
  solarAmpere: number;
  loadWatts: number;
  loadVa: number;
  loadVoltage: number;
  loadAmpere: number;
  loadPercentage: number;
  gridWatts: number;
  gridVoltage: number;
  gridAmpere: number;
  gridHz: number;
  batteryVoltage: number;
  chargingAmpere: number;
  dischargingAmpere: number;
  batteryPercentage: number;
  batteryWatts: number;
  batteryState: 'no-battery' | 'charging' | 'discharging' | 'idle';
  mode: string;
  chargingMode: string;
  fanSpeed: number;
  time: string;
  mpptTemperature: number;
  powerFactor: number;
  wifiSignalDbm: number;
  mpptSummary?: MpptRealtimeSummary | null;
  fetchedAt: number;
  stale: boolean;
}

export interface SolarPanelSettings {
  company: string;
  panelWatts: number;
  panelCount: number;
  pvInstalled: number;
}

export type EnableDisable = 'Enable' | 'Disable';

export interface NotificationSettingsConfig {
  masterEnabled: boolean;
  overloadAndFaultAlerts: boolean;
  gridInterruptAlerts: boolean;
  highTempAlerts: boolean;
}

export interface DailySummaryConfig {
  enabled: boolean;
  sendAt24h: string;
  lastSentDate: string | null;
}

export interface InverterSettingsConfig {
  inverterSoftware: string;
  inverterCompany: string;
  inverterModel: string;
  inverterType: string;
  mode: 'SUB' | 'SBU' | 'SOL' | 'USB';
  inputRange: 'Appliances' | 'UPS';
  outputVoltage: '220' | '230' | '240';
  netMetering: boolean;
  electricityRateRs: number;
  alarm: EnableDisable;
  overloadBypass: EnableDisable;
  lcdAutoReturnDefault: EnableDisable;
  overloadRestart: EnableDisable;
  overTempRestart: EnableDisable;
  backlightOn: EnableDisable;
  alarmOnSourceInterrupt: EnableDisable;
  faultCodeRecord: EnableDisable;
}

export interface DeviceConfig {
  id: string;
  name: string;
  ratedWatts: number;
  phone: string;
  email: string;
  firmware: string;
  favorite: boolean;
  solarPanels: SolarPanelSettings;
  notifications: NotificationSettingsConfig;
  dailySummary: DailySummaryConfig;
  inverterSettings: InverterSettingsConfig;
}

export interface TelemetrySample {
  timestamp: number;
  label: string;
  solarWatts: number;
  loadWatts: number;
  loadVa?: number;
  gridWatts: number;
  batteryWatts: number;
  gridVoltage: number;
  loadVoltage: number;
  gridHz: number;
  mpptTemperature: number;
  fanSpeed: number;
}

export interface DailyEnergyRecord {
  dateKey: string; // DD-MM-YYYY matching inverter timestamp date
  isoDate: string; // YYYY-MM-DD for sorting/filtering
  solarEnergyKwh: number;
  gridEnergyKwh: number;
  solarChargingKwh: number;
  gridChargingKwh: number;
  batteryUsedKwh: number;
  loadConsumedKwh: number;
  updatedAt: number;
}

export type CloudEnergyPeriod = 'T' | 'Y' | 'TM' | 'LM' | 'TY' | 'LY';

export interface CloudEnergySummary {
  period: CloudEnergyPeriod;
  todaySolar: number;
  todayGrid: number;
  todayNetGrid: number;
  todayNetSolar: number;
  todayBattery: number;
  todaySolarBattery: number;
  todayGridBattery: number;
  todayTotal: number;
  todayLoad: number;
  rate: number;
  fetchedAt: number;
}

export interface CloudChartPoint {
  time: string;
  label: string;
  datePart: string;
  timestamp: number;
  solarW: number;
  acOutW: number;
  acOutVa: number;
  gridW: number;
  solarV: number;
  solarA: number;
  battV: number;
  battPercent: number;
  battChargeA: number;
  battDischargeA: number;
  gridV: number;
  acOutV: number;
  gridHz: number;
  heatSinkDegC: number;
  solarW1: number;
  solarV1?: number;
  solarA1?: number;
  solarW2: number;
  solarV2?: number;
  solarA2?: number;
}

export interface CloudStat2Bundle {
  deviceId: string;
  period: CloudEnergyPeriod;
  hours: 1 | 2 | 4 | 6;
  energy: CloudEnergySummary;
  allPeriods: Partial<Record<CloudEnergyPeriod, CloudEnergySummary>>;
  realtimeChart: CloudChartPoint[];
  historyChart24: CloudChartPoint[];
  historyChartMonth: CloudChartPoint[];
  monthStats: Array<CloudEnergySummary & { time?: string }>;
  stale: boolean;
  fetchedAt: number;
}

export interface ModeTimerItem {
  id: string;
  label: string;
  time: string;
  targetMode: 'SUB' | 'SBU' | 'USB' | 'SOL';
  chargingMode: 'CSO' | 'SNU' | 'OSO';
  days: string[];
  enabled: boolean;
}

export interface AlertThresholds {
  maxMpptTemp: number;
  maxLoadPercent: number;
  minGridVoltage: number;
  maxGridVoltage: number;
  notifyNoBattery: boolean;
}

export interface EvaluatedAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  metric: string;
  timestamp: string;
}

export interface FaultLogEntry {
  id: string;
  code: string;
  title: string;
  metric: string;
  recordedAt: string;
}

export interface InAppNotificationBanner {
  id: string;
  title: string;
  body: string;
  metricsLine?: string;
  timestamp: string;
}

export type AccentThemeId = 'emerald' | 'blue' | 'coral' | 'amber' | 'violet';

export type DetailTab = 'realtime' | 'stats' | 'stat2' | 'alerts' | 'settings' | 'test';

export interface DongleExtendedDiagnostics {
  deviceId: string;
  fetchedAt: number;
  stale: boolean;
  localIp: string;
  signalDbm: number;
  firmwareVersion: string;
  hardwareModel: string;
  freeHeapBytes: number;
  jsonMemBytes: number;
  heapFragPct: number;
  packageValidity: string;
  realTime: string;
  serverTime: string;
  brandName: string;
  modelName: string;
  inverterType: string;
  protocol: string;
  inverterSoftware: string;
  ivModeCode: string;
  settingsWritable: boolean;
  busV: number;
  pvInstalledW: number;
  peakSolarW: number;
  peakLoadW: number;
  solarW: number;
  solarV: number;
  solarA: number;
  pv1: { watts: number; volts: number; amps: number };
  pv2: { watts: number; volts: number; amps: number };
  pv3: { watts: number; volts: number; amps: number };
  gridV: number;
  gridHz: number;
  gridW: number;
  acOutV: number;
  acOutHz: number;
  acOutW: number;
  acOutVa: number;
  reactiveVar: number;
  acOutPercent: number;
  acOutRatingW: number;
  acOutRatingV: number;
  acOutRatingHz: number;
  heatSinkDegC: number;
  fanSpeedPct: number;
  battV: number;
  battPercent: number;
  battChargeA: number;
  battDischargeA: number;
  solarBatteryWatts: number;
  gridBatteryWatts: number;
  battType: string;
  battRatingV: number;
  battBulkV: number;
  battFloatV: number;
  cutOffVolts: number;
  backToGridV: number;
  backToDisV: number;
  battMaxAcChrgA: number;
  battMaxChrgA: number;
  inputVoltType: string;
  outputSource: string;
  chargeSource: string;
  cloudChargeMode: string;
  eqStatus: number;
  eqTimeMin: number;
  eqIntervalDays: number;
  eqVoltage: number;
  eqActivate: number;
  dualOutput: number;
  dualOutputVolts: number | null;
  gridFeed: number;
  gridFeedCapable: number;
  netMetering: string;
  electricityRateRs: number;
  panelCompany: string;
  panelWatts: number;
  panelCount: number;
  flags: {
    gridPresent: boolean;
    faultCode: string;
    heavyLoad: boolean;
    heavyLoadBattery: boolean;
    lowSolar: boolean;
    learnMode: boolean;
    inverterBuzzer: boolean;
    powerSaving: boolean;
    overloadRestart: boolean;
    temperatureRestart: boolean;
    lcdBacklight: boolean;
    alarmInterrupt: boolean;
    faultRecord: boolean;
    overloadBypass: boolean;
    defaultLcdPage: boolean;
    cloudNotification: boolean;
    emailNotification: boolean;
  };
  panelCompanies: Array<{ label: string; value: string }>;
  peakMpptSnapshot: {
    time: string;
    solarW: number;
    pv1W: number;
    pv1V: number;
    pv1A: number;
    pv2W: number;
    pv2V: number;
    pv2A: number;
  } | null;
  rawExtendedDto: Record<string, unknown>;
  rawCloudSettings: Record<string, unknown>;
}

export interface AiHealthRecommendation {
  title: string;
  impact: string;
  action: string;
  priority: 'High' | 'Medium' | 'Low';
}

export interface AiHealthDiagnosticReport {
  healthScore: number;
  overallStatus: string;
  summary: string;
  mpptStringVerdict: string;
  busAndGridVerdict: string;
  estimatedMonthlySavingsPotentialRs: number;
  recommendations: AiHealthRecommendation[];
  generatedAt: number;
}

export interface AiSolarForecastSlot {
  timeWindow: string;
  appliance: string;
  reason: string;
}

export interface AiSolarForecastReport {
  location: string;
  forecastSummary: string;
  expectedSolarKwh: number;
  expectedSavingsRs: number;
  peakSunWindow: string;
  weatherNotes: string;
  applianceSchedule: AiSolarForecastSlot[];
  sources: Array<{ title: string; uri: string }>;
  generatedAt: number;
}

export type SmartRuleMetric =
  | 'solar1_voltage'
  | 'solar1_watts'
  | 'solar2_watts'
  | 'total_solar_watts'
  | 'grid_voltage'
  | 'load_watts'
  | 'heatsink_temp'
  | 'bus_voltage';

export interface SmartConditionalRule {
  id: string;
  name: string;
  description: string;
  metric: SmartRuleMetric;
  operator: 'LT' | 'GT';
  threshold: number;
  targetSetting: 'Mode' | 'ChargerPriority';
  targetValue: string;
  enabled: boolean;
}

export interface Cloud30DayAuditSummary {
  daysCount: number;
  totalSolarKwh: number;
  totalGridKwh: number;
  totalLoadKwh: number;
  solarSelfSufficiencyPct: number;
  avgDailySolarKwh: number;
  peakSolarDay: {
    date: string;
    solarKwh: number;
    loadKwh: number;
  } | null;
  totalSavingsRs: number;
  rateRs: number;
}

export interface CloudAiQaEntry {
  id: string;
  question: string;
  answer: string;
  askedAt: number;
}

export interface CloudAiLabBundle {
  deviceId: string;
  locationCity: string;
  lastHealthReport: AiHealthDiagnosticReport | null;
  lastForecastReport: AiSolarForecastReport | null;
  smartRules: SmartConditionalRule[];
  qaHistory: CloudAiQaEntry[];
  audit30Day: Cloud30DayAuditSummary;
}


