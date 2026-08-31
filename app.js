// Finanzas Pro - Financial Engine & Application Logic

// Initial Default State
const DEFAULT_STATE = {
  accounts: {
    cash: 0,     // Efectivo en mano
    bank: 0      // Banco / Yape / Plin
  },
  funds: {
    savings: 0,  // Fondo de Ahorro Total Acumulado (20%)
    tithe: 0     // Fondo de Diezmo Apartado (10%)
  },
  projects: [
    { id: 'p_viaje', name: 'Viaje / Vacaciones', emoji: '✈️', targetAmount: 3000, currentAmount: 0, deadline: '2026-12-31', category: 'Viajes' },
    { id: 'p_equipos', name: 'Equipos de Trabajo / Laptop', emoji: '💻', targetAmount: 2500, currentAmount: 0, deadline: '2026-11-30', category: 'Trabajo' }
  ],
  transactions: [],
  fixedPayments: [
    { id: 'f1', name: 'Alquiler / Vivienda', amount: 600, dueDay: 5, category: 'Vivienda', isPaidThisMonth: false, lastPaidMonth: '' },
    { id: 'f2', name: 'Servicios (Luz, Agua)', amount: 120, dueDay: 15, category: 'Servicios', isPaidThisMonth: false, lastPaidMonth: '' },
    { id: 'f3', name: 'Internet y Celular', amount: 85, dueDay: 20, category: 'Conectividad', isPaidThisMonth: false, lastPaidMonth: '' }
  ],
  titheDeliveries: [],
  config: {
    currency: 'S/.',
    tithePct: 10,
    savingsPct: 20,
    workDaysPerMonth: 26,
    cloudPasscode: 'admin777',
    cloudSyncEnabled: false
  }
};

let state = JSON.parse(JSON.stringify(DEFAULT_STATE));
const STORAGE_KEY = 'finanzas_pro_state_v1';

// DOM Initialization
window.addEventListener('DOMContentLoaded', () => {
  loadSavedState();
  initNavigation();
  initFormDates();
  runAllocationCalculator();
  updateUI();

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Finanzas PWA Service Worker registrado', reg))
      .catch(err => console.warn('Error en Service Worker', err));
  }

  // Periodic Cloud Sync
  setInterval(() => {
    if (state.config && state.config.cloudSyncEnabled && document.visibilityState === 'visible') {
      fetchCloudState();
    }
  }, 30000);
});

// Setup default form dates to today
function initFormDates() {
  const today = new Date().toISOString().split('T')[0];
  const dateInputs = ['inp-ingreso-fecha', 'inp-gasto-fecha', 'inp-diezmo-fecha', 'inp-proy-fecha'];
  dateInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });
}

// Navigation Tabs Manager
function initNavigation() {
  const tabs = document.querySelectorAll('.nav-item');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const viewId = tab.getAttribute('data-view');
      switchTab(viewId);
    });
  });
}

function switchTab(viewId) {
  // Update Tab buttons
  document.querySelectorAll('.nav-item').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-view') === viewId);
  });

  // Update View Sections
  document.querySelectorAll('.view-section').forEach(v => {
    v.classList.toggle('active', v.id === viewId);
  });

  // Refresh visual elements for the selected tab
  if (viewId === 'view-reportes') {
    renderWeeklyChart();
    renderCategoryBreakdown();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Storage & Cloud Persistence
function loadSavedState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      state = Object.assign({}, DEFAULT_STATE, parsed);
      state.accounts = Object.assign({}, DEFAULT_STATE.accounts, parsed.accounts || {});
      state.funds = Object.assign({}, DEFAULT_STATE.funds, parsed.funds || {});
      state.config = Object.assign({}, DEFAULT_STATE.config, parsed.config || {});
      if (!Array.isArray(state.transactions)) state.transactions = [];
      if (!Array.isArray(state.fixedPayments)) state.fixedPayments = DEFAULT_STATE.fixedPayments;
      if (!Array.isArray(state.projects)) {
        // Migration from old savingsGoals if exists
        if (Array.isArray(parsed.savingsGoals) && parsed.savingsGoals.length > 0) {
          state.projects = parsed.savingsGoals.map(g => ({
            id: g.id || 'p_' + Date.now(),
            name: g.name,
            emoji: '🎯',
            targetAmount: g.targetAmount,
            currentAmount: g.currentAmount || 0,
            deadline: '',
            category: 'Ahorro'
          }));
        } else {
          state.projects = DEFAULT_STATE.projects;
        }
      }
      if (!Array.isArray(state.titheDeliveries)) state.titheDeliveries = [];
    } catch (e) {
      console.error('Error parseando estado local', e);
    }
  }

  // Load config inputs
  if (state.config) {
    const currInp = document.getElementById('cfg-currency');
    const titheInp = document.getElementById('cfg-tithe-pct');
    const savInp = document.getElementById('cfg-savings-pct');
    const workInp = document.getElementById('cfg-workdays');
    const passInp = document.getElementById('cfg-cloud-passcode');

    if (currInp) currInp.value = state.config.currency || 'S/.';
    if (titheInp) titheInp.value = state.config.tithePct || 10;
    if (savInp) savInp.value = state.config.savingsPct || 20;
    if (workInp) workInp.value = state.config.workDaysPerMonth || 26;
    if (passInp) passInp.value = state.config.cloudPasscode || '';
  }

  if (state.config && state.config.cloudSyncEnabled) {
    fetchCloudState();
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (state.config && state.config.cloudSyncEnabled) {
    pushCloudState();
  }
}

// Cloudflare Pages API Integration
async function fetchCloudState() {
  const syncBadge = document.getElementById('sync-status');
  const syncText = document.getElementById('sync-text');

  try {
    const res = await fetch('./api/state');
    if (!res.ok) throw new Error('API request failed');
    const data = await res.json();
    
    if (data && !data.empty && data.transactions) {
      state = data;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      updateUI();
    }
    
    if (syncBadge && syncText) {
      syncBadge.className = 'status-badge sync-ok';
      syncText.textContent = 'Nube Sincronizada';
    }
  } catch (err) {
    if (syncBadge && syncText) {
      syncBadge.className = 'status-badge';
      syncText.textContent = 'Local / Offline';
    }
  }
}

async function pushCloudState() {
  const passcode = state.config.cloudPasscode || 'admin777';
  const syncBadge = document.getElementById('sync-status');
  const syncText = document.getElementById('sync-text');

  if (syncBadge && syncText) {
    syncBadge.className = 'status-badge sync-working';
    syncText.textContent = 'Guardando en la Nube...';
  }

  try {
    const res = await fetch('./api/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': passcode
      },
      body: JSON.stringify(state)
    });

    if (res.ok) {
      if (syncBadge && syncText) {
        syncBadge.className = 'status-badge sync-ok';
        syncText.textContent = 'Nube Sincronizada';
      }
    } else {
      throw new Error('Error al sincronizar');
    }
  } catch (e) {
    if (syncBadge && syncText) {
      syncBadge.className = 'status-badge';
      syncText.textContent = 'Guardado Local';
    }
  }
}

// Currency Formatter
function formatMoney(amount) {
  const curr = (state.config && state.config.currency) ? state.config.currency : 'S/.';
  const num = Number(amount) || 0;
  return `${curr} ${num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Smart Allocation Calculator Engine
function runAllocationCalculator() {
  const inp = document.getElementById('calc-input-amount');
  const amount = parseFloat(inp ? inp.value : 0) || 0;

  const tithePct = (state.config ? state.config.tithePct : 10) / 100;
  const savingsPct = (state.config ? state.config.savingsPct : 20) / 100;

  const titheVal = amount * tithePct;
  const savingsVal = amount * savingsPct;
  
  // Calculate recommended daily fixed bills quota
  const fixedDailyReq = calculateDailyFixedQuota();
  const fixedSuggested = Math.min(amount * 0.30, fixedDailyReq);
  const freeVal = Math.max(0, amount - titheVal - savingsVal - (amount > 0 ? fixedSuggested : 0));

  const titheEl = document.getElementById('calc-tithe-val');
  const savEl = document.getElementById('calc-savings-val');
  const fixedEl = document.getElementById('calc-fixed-val');
  const freeEl = document.getElementById('calc-free-val');

  if (titheEl) titheEl.textContent = formatMoney(titheVal);
  if (savEl) savEl.textContent = formatMoney(savingsVal);
  if (fixedEl) fixedEl.textContent = formatMoney(fixedSuggested);
  if (freeEl) freeEl.textContent = formatMoney(freeVal);
}

function applyQuickAllocationFromCalc() {
  const inp = document.getElementById('calc-input-amount');
  const amount = parseFloat(inp ? inp.value : 0) || 0;
  if (amount <= 0) {
    alert('Ingresa un monto válido mayor a 0 para registrar el ingreso.');
    return;
  }

  // Pre-fill modal
  openModal('modal-ingreso');
  const modalMonto = document.getElementById('inp-ingreso-monto');
  if (modalMonto) {
    modalMonto.value = amount;
    updateModalIngresoReparto();
  }
}

function updateModalIngresoReparto() {
  const inp = document.getElementById('inp-ingreso-monto');
  const amount = parseFloat(inp ? inp.value : 0) || 0;

  const tithePct = (state.config ? state.config.tithePct : 10) / 100;
  const savingsPct = (state.config ? state.config.savingsPct : 20) / 100;

  const titheVal = amount * tithePct;
  const savingsVal = amount * savingsPct;
  const freeVal = Math.max(0, amount - titheVal - savingsVal);

  const mDiezmo = document.getElementById('modal-ingreso-diezmo');
  const mAhorro = document.getElementById('modal-ingreso-ahorro');
  const mLibre = document.getElementById('modal-ingreso-libre');

  if (mDiezmo) mDiezmo.textContent = formatMoney(titheVal);
  if (mAhorro) mAhorro.textContent = formatMoney(savingsVal);
  if (mLibre) mLibre.textContent = formatMoney(freeVal);
}

// Calculate remaining working days in current month (Domingo a Viernes, excluding Saturdays)
function getRemainingWorkDays() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();

  let workdays = 0;
  for (let day = today; day <= lastDay; day++) {
    const d = new Date(year, month, day);
    // 6 is Saturday (Sabbath / descanso)
    if (d.getDay() !== 6) {
      workdays++;
    }
  }
  return Math.max(1, workdays);
}

// Calculate remaining workdays between today and a target date
function getRemainingWorkdaysUntil(targetDateStr) {
  if (!targetDateStr) return 0;
  const now = new Date();
  const target = new Date(targetDateStr + 'T23:59:59');
  if (target <= now) return 0;

  let workdays = 0;
  const cur = new Date(now);
  while (cur <= target) {
    if (cur.getDay() !== 6) { // Exclude Saturdays
      workdays++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, workdays);
}

// Calculate pending fixed obligations and daily quota
function calculateDailyFixedQuota() {
  const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
  const pendingTotal = state.fixedPayments.reduce((acc, bill) => {
    const isPaid = bill.isPaidThisMonth && bill.lastPaidMonth === currentMonth;
    return isPaid ? acc : acc + Number(bill.amount);
  }, 0);

  const workdaysRemaining = getRemainingWorkDays();
  return pendingTotal / workdaysRemaining;
}

// UI RENDERING ENGINE
function updateUI() {
  renderDashboardBalances();
  renderAccountsList();
  renderRecentTransactions();
  renderTransactionsList();
  renderFixedPayments();
  renderAhorrosYDiezmos();
  renderAdvisorInsight();
  renderWeeklyChart();
  renderCategoryBreakdown();
}

function renderDashboardBalances() {
  const cash = Number(state.accounts.cash) || 0;
  const bank = Number(state.accounts.bank) || 0;
  const savings = Number(state.funds.savings) || 0;
  const tithe = Number(state.funds.tithe) || 0;
  const total = cash + bank + savings; // Net financial worth

  const currentMonth = new Date().toISOString().substring(0, 7);
  
  // Calculate month income & expenses
  let monthIncome = 0;
  let monthExpenses = 0;

  state.transactions.forEach(tx => {
    if (tx.date && tx.date.startsWith(currentMonth)) {
      if (tx.type === 'income') monthIncome += Number(tx.amount);
      if (tx.type === 'expense') monthExpenses += Number(tx.amount);
    }
  });

  // Calculate pending fixed bills
  const pendingFixed = state.fixedPayments.reduce((acc, bill) => {
    const isPaid = bill.isPaidThisMonth && bill.lastPaidMonth === currentMonth;
    return isPaid ? acc : acc + Number(bill.amount);
  }, 0);

  const dailyQuota = calculateDailyFixedQuota();

  // Set DOM Values
  document.getElementById('dash-total-balance').textContent = formatMoney(total);
  document.getElementById('dash-cash-balance').textContent = formatMoney(cash);
  document.getElementById('dash-bank-balance').textContent = formatMoney(bank);
  document.getElementById('dash-savings-balance').textContent = formatMoney(savings);
  document.getElementById('dash-tithe-balance').textContent = formatMoney(tithe);

  document.getElementById('dash-month-income').textContent = formatMoney(monthIncome);
  document.getElementById('dash-month-expenses').textContent = formatMoney(monthExpenses);
  document.getElementById('dash-fixed-pending').textContent = formatMoney(pendingFixed);
  document.getElementById('dash-savings-total').textContent = formatMoney(savings);

  const workdaysRemaining = getRemainingWorkDays();
  const workdaysTotal = state.config.workDaysPerMonth || 26;
  const daysPassed = Math.max(0, workdaysTotal - workdaysRemaining);
  
  document.getElementById('dash-income-days').textContent = `${daysPassed} de ${workdaysTotal} días trabajados`;
  document.getElementById('dash-fixed-quota').textContent = `Meta: ${formatMoney(dailyQuota)} / día laborable`;
  
  const avgExpense = daysPassed > 0 ? (monthExpenses / daysPassed) : monthExpenses;
  document.getElementById('dash-expense-rate').textContent = `Promedio: ${formatMoney(avgExpense)} / día`;
}

// Virtual Financial Advisor Algorithm
function renderAdvisorInsight() {
  const currentMonth = new Date().toISOString().substring(0, 7);
  let monthIncome = 0;
  let monthExpenses = 0;

  state.transactions.forEach(tx => {
    if (tx.date && tx.date.startsWith(currentMonth)) {
      if (tx.type === 'income') monthIncome += Number(tx.amount);
      if (tx.type === 'expense') monthExpenses += Number(tx.amount);
    }
  });

  const savings = Number(state.funds.savings) || 0;
  const tithe = Number(state.funds.tithe) || 0;
  const pendingFixed = state.fixedPayments.reduce((acc, bill) => {
    const isPaid = bill.isPaidThisMonth && bill.lastPaidMonth === currentMonth;
    return isPaid ? acc : acc + Number(bill.amount);
  }, 0);

  const totalFixedMonthly = state.fixedPayments.reduce((acc, b) => acc + Number(b.amount), 0);
  const advisorText = document.getElementById('advisor-text');
  if (!advisorText) return;

  if (monthIncome === 0) {
    advisorText.innerHTML = `¡Bienvenido! Inicia el mes registrando tus ingresos diarios. Al ingresar cada monto, el sistema apartará automáticamente tu <strong>10% de Diezmo</strong> y <strong>20% de Ahorro</strong>.`;
  } else if (pendingFixed > 0 && (state.accounts.cash + state.accounts.bank) < pendingFixed) {
    const dailyQuota = calculateDailyFixedQuota();
    advisorText.innerHTML = `⚠️ <strong>Atención a tus Pagos Fijos:</strong> Tienes ${formatMoney(pendingFixed)} en cuentas por pagar este mes. Procura reservar <strong>${formatMoney(dailyQuota)}</strong> por cada día laboral (Dom-Vie) para cubrirlas sin contratiempos.`;
  } else if (tithe > 0) {
    advisorText.innerHTML = `🕊️ Tienes <strong>${formatMoney(tithe)}</strong> de diezmo acumulado listo para entregar en tu congregación. Tu fondo de ahorro actual es de <strong>${formatMoney(savings)}</strong>. ¡Excelente orden!`;
  } else if (state.projects && state.projects.length > 0 && state.projects.some(p => (p.currentAmount / p.targetAmount) >= 0.5)) {
    const topProj = state.projects.find(p => (p.currentAmount / p.targetAmount) >= 0.5);
    advisorText.innerHTML = `✈️ <strong>¡Gran avance en tu meta!</strong> Tu proyecto <strong>${escapeHTML(topProj.name)}</strong> ya superó el 50% de ahorro. Sigue aportando en cada jornada.`;
  } else if (monthExpenses > (monthIncome * 0.70)) {
    advisorText.innerHTML = `💡 <strong>Consejo de Ahorro:</strong> Tus gastos del mes representan más del 70% de lo ingresado. Revisa la sección de Reportes para identificar y recortar posibles gastos hormiga.`;
  } else if (savings >= totalFixedMonthly * 3 && totalFixedMonthly > 0) {
    advisorText.innerHTML = `🌟 <strong>¡Salud Financiera Excelente!</strong> Tu fondo de ahorro supera los 3 meses de gastos fijos. Tienes un sólido colchón de tranquilidad para tu trabajo independiente.`;
  } else {
    advisorText.innerHTML = `✅ <strong>Buen balance:</strong> Llevas ${formatMoney(monthIncome)} generados este mes. Mantén el ritmo de Domingo a Viernes y respeta tu descanso del Sábado.`;
  }
}

// Render Accounts
function renderAccountsList() {
  const container = document.getElementById('accounts-list-container');
  if (!container) return;

  const cash = Number(state.accounts.cash) || 0;
  const bank = Number(state.accounts.bank) || 0;
  const savings = Number(state.funds.savings) || 0;

  container.innerHTML = `
    <div class="tx-item">
      <div class="tx-left">
        <div class="tx-icon income">💵</div>
        <div class="tx-details">
          <h5>Efectivo en Mano</h5>
          <div class="tx-meta">Billetera física / Caja chica</div>
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount pos">${formatMoney(cash)}</div>
      </div>
    </div>

    <div class="tx-item">
      <div class="tx-left">
        <div class="tx-icon savings">📱</div>
        <div class="tx-details">
          <h5>Banco / Yape / Plin</h5>
          <div class="tx-meta">Cuentas digitales bancarias</div>
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount pos">${formatMoney(bank)}</div>
      </div>
    </div>

    <div class="tx-item">
      <div class="tx-left">
        <div class="tx-icon tithe">🛡️</div>
        <div class="tx-details">
          <h5>Bóveda de Ahorro (20%)</h5>
          <div class="tx-meta">Fondo protegido (Proyectos + Reserva)</div>
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount" style="color: var(--blue-light);">${formatMoney(savings)}</div>
      </div>
    </div>
  `;
}

// Render Recent Transactions
function renderRecentTransactions() {
  const container = document.getElementById('dash-recent-txs');
  if (!container) return;

  const recent = (state.transactions || []).slice(0, 5);
  if (recent.length === 0) {
    container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 20px;">Aún no tienes movimientos registrados. Pulsa <strong>+ Ingreso</strong> o <strong>- Gasto</strong> para empezar.</p>`;
    return;
  }

  container.innerHTML = recent.map(tx => buildTxItemHTML(tx)).join('');
}

// Render Full Transaction List with Filter
function renderTransactionsList() {
  const container = document.getElementById('all-transactions-list');
  const filterSelect = document.getElementById('tx-filter-type');
  if (!container) return;

  const filter = filterSelect ? filterSelect.value : 'all';
  let list = state.transactions || [];

  if (filter !== 'all') {
    list = list.filter(t => t.type === filter);
  }

  if (list.length === 0) {
    container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 30px;">No hay movimientos para este filtro.</p>`;
    return;
  }

  container.innerHTML = list.map(tx => buildTxItemHTML(tx, true)).join('');
}

function buildTxItemHTML(tx, showDelete = false) {
  let iconClass = 'income';
  let iconEmoji = '💰';
  let sign = '+';
  let amountClass = 'pos';
  let accountLabel = tx.accountId === 'cash' ? 'Efectivo' : 'Banco / Yape';

  if (tx.type === 'expense') {
    iconClass = 'expense';
    iconEmoji = '🛒';
    sign = '-';
    amountClass = 'neg';
  } else if (tx.type === 'tithe_delivery') {
    iconClass = 'tithe';
    iconEmoji = '🕊️';
    sign = '✓';
    amountClass = 'neutral';
    accountLabel = 'Entrega Diezmo';
  } else if (tx.type === 'transfer') {
    iconClass = 'transfer';
    iconEmoji = '⇄';
    sign = '⇄';
    amountClass = 'neutral';
    accountLabel = 'Transferencia';
  } else if (tx.type === 'project_deposit') {
    iconClass = 'savings';
    iconEmoji = '📥';
    sign = '→';
    amountClass = 'neutral';
    accountLabel = 'Aporte Proyecto';
  } else if (tx.type === 'project_withdraw') {
    iconClass = 'expense';
    iconEmoji = '📤';
    sign = '←';
    amountClass = 'neg';
    accountLabel = 'Uso Proyecto';
  }

  const deleteBtn = showDelete ? `
    <button class="tx-delete-btn" onclick="deleteTransaction('${tx.id}')" title="Eliminar movimiento">
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
    </button>
  ` : '';

  return `
    <div class="tx-item">
      <div class="tx-left">
        <div class="tx-icon ${iconClass}">${iconEmoji}</div>
        <div class="tx-details">
          <h5>${escapeHTML(tx.description || tx.category || 'Movimiento')}</h5>
          <div class="tx-meta">
            <span>📅 ${tx.date || 'Hoy'}</span>
            <span>•</span>
            <span>${accountLabel}</span>
            ${tx.category ? `<span>• <strong style="color: var(--text-secondary);">${escapeHTML(tx.category)}</strong></span>` : ''}
          </div>
        </div>
      </div>
      <div class="tx-right" style="display: flex; align-items: center; gap: 8px;">
        <div class="tx-amount ${amountClass}">${sign} ${formatMoney(tx.amount)}</div>
        ${deleteBtn}
      </div>
    </div>
  `;
}

// Fixed Payments Management
function renderFixedPayments() {
  const container = document.getElementById('fixed-bills-container');
  if (!container) return;

  const currentMonth = new Date().toISOString().substring(0, 7);
  let totalMonthly = 0;
  let totalPaid = 0;
  let paidCount = 0;

  const bills = state.fixedPayments || [];
  bills.forEach(b => {
    const amt = Number(b.amount) || 0;
    totalMonthly += amt;
    const isPaid = b.isPaidThisMonth && b.lastPaidMonth === currentMonth;
    if (isPaid) {
      totalPaid += amt;
      paidCount++;
    }
  });

  const totalMonthlyEl = document.getElementById('fixed-total-monthly');
  const totalPaidEl = document.getElementById('fixed-total-paid');
  const paidCountEl = document.getElementById('fixed-paid-count');
  const dailyQuotaEl = document.getElementById('fixed-daily-quota');

  if (totalMonthlyEl) totalMonthlyEl.textContent = formatMoney(totalMonthly);
  if (totalPaidEl) totalPaidEl.textContent = formatMoney(totalPaid);
  if (paidCountEl) paidCountEl.textContent = `${paidCount} de ${bills.length} cuentas pagadas`;
  if (dailyQuotaEl) dailyQuotaEl.textContent = formatMoney(calculateDailyFixedQuota());

  if (bills.length === 0) {
    container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); padding: 20px;">No has añadido pagos fijos todavía. Pulsa <strong>+ Nuevo Pago Fijo</strong>.</p>`;
    return;
  }

  container.innerHTML = bills.map(bill => {
    const isPaid = bill.isPaidThisMonth && bill.lastPaidMonth === currentMonth;
    const todayDate = new Date().getDate();
    const isUrgent = !isPaid && (bill.dueDay - todayDate <= 3) && (bill.dueDay >= todayDate);
    const isOverdue = !isPaid && (todayDate > bill.dueDay);

    let statusBadge = isPaid 
      ? `<span class="alloc-badge badge-emerald">✓ Pagado</span>`
      : (isOverdue 
          ? `<span class="alloc-badge badge-rose">⚠️ Vencido (Día ${bill.dueDay})</span>`
          : (isUrgent 
              ? `<span class="alloc-badge badge-rose">⚡ Por Vencer (Día ${bill.dueDay})</span>`
              : `<span class="alloc-badge badge-blue">Vence el ${bill.dueDay}</span>`));

    return `
      <div class="bill-card ${isPaid ? 'paid' : (isUrgent || isOverdue ? 'urgent' : 'pending')}">
        <div class="bill-header">
          <div>
            <div class="bill-name">${escapeHTML(bill.name)}</div>
            <div class="bill-due">${escapeHTML(bill.category || 'Fijo')} • Vence día ${bill.dueDay} de cada mes</div>
          </div>
          ${statusBadge}
        </div>

        <div class="bill-amount" style="color: ${isPaid ? 'var(--emerald-light)' : 'var(--text-main)'};">
          ${formatMoney(bill.amount)}
        </div>

        <div class="bill-actions">
          <button class="btn ${isPaid ? 'btn-ghost' : 'btn-primary'}" style="padding: 6px 12px; font-size: 0.8rem;" onclick="toggleFixedBillPaid('${bill.id}')">
            ${isPaid ? '↩ Desmarcar' : '✓ Marcar como Pagado'}
          </button>
          <button class="tx-delete-btn" onclick="deleteFixedBill('${bill.id}')" title="Eliminar cuenta fija">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function toggleFixedBillPaid(billId) {
  const currentMonth = new Date().toISOString().substring(0, 7);
  const bill = state.fixedPayments.find(b => b.id === billId);
  if (!bill) return;

  const wasPaid = bill.isPaidThisMonth && bill.lastPaidMonth === currentMonth;
  bill.isPaidThisMonth = !wasPaid;
  bill.lastPaidMonth = !wasPaid ? currentMonth : '';

  persistState();
  updateUI();
}

function deleteFixedBill(billId) {
  if (!confirm('¿Deseas eliminar este compromiso de pago fijo?')) return;
  state.fixedPayments = state.fixedPayments.filter(b => b.id !== billId);
  persistState();
  updateUI();
}

// Ahorros, Proyectos y Diezmos Management
function renderAhorrosYDiezmos() {
  const titheAmount = Number(state.funds.tithe) || 0;
  const savingsAmount = Number(state.funds.savings) || 0;
  const totalMonthlyBills = state.fixedPayments.reduce((acc, b) => acc + Number(b.amount), 0);

  // Calculate sum of project balances
  const totalProjectSavings = (state.projects || []).reduce((acc, p) => acc + Number(p.currentAmount || 0), 0);
  const freeEmergencyFund = Math.max(0, savingsAmount - totalProjectSavings);

  const titheBox = document.getElementById('tithe-box-amount');
  const savingsBox = document.getElementById('savings-box-amount');
  const savingsMonths = document.getElementById('savings-months-cushion');
  const freeFundEl = document.getElementById('savings-free-fund');

  if (titheBox) titheBox.textContent = formatMoney(titheAmount);
  if (savingsBox) savingsBox.textContent = formatMoney(savingsAmount);
  if (freeFundEl) freeFundEl.textContent = formatMoney(freeEmergencyFund);

  if (savingsMonths) {
    if (totalMonthlyBills > 0) {
      const months = (savingsAmount / totalMonthlyBills).toFixed(1);
      savingsMonths.textContent = `Equivalente a ${months} meses de tus pagos fijos cubiertos.`;
    } else {
      savingsMonths.textContent = `Fondo de reserva disponible para imprevistos e inversión.`;
    }
  }

  // Render Projects Grid
  renderProjects();

  // Render Tithe Deliveries
  const titheContainer = document.getElementById('tithe-history-list');
  if (titheContainer) {
    const list = state.titheDeliveries || [];
    if (list.length === 0) {
      titheContainer.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-muted); padding: 10px;">Aún no has registrado entregas de diezmo.</p>`;
    } else {
      titheContainer.innerHTML = list.slice(0, 5).map(item => `
        <div class="tx-item">
          <div class="tx-left">
            <div class="tx-icon tithe">🕊️</div>
            <div class="tx-details">
              <h5>${escapeHTML(item.church || 'Iglesia')}</h5>
              <div class="tx-meta">
                <span>📅 ${item.date}</span>
                ${item.note ? `<span>• ${escapeHTML(item.note)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="tx-right">
            <div class="tx-amount neutral">${formatMoney(item.amount)}</div>
          </div>
        </div>
      `).join('');
    }
  }
}

// Render Projects (Sinking Funds) Cards
function renderProjects() {
  const container = document.getElementById('projects-container');
  if (!container) return;

  const projects = state.projects || [];
  populateProjectSelects();

  if (projects.length === 0) {
    container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); padding: 20px; grid-column: 1/-1;">No tienes proyectos de ahorro aún. ¡Crea uno para tu viaje, equipo o meta pulsando <strong>+ Nuevo Proyecto</strong>!</p>`;
    return;
  }

  container.innerHTML = projects.map(proj => {
    const target = Number(proj.targetAmount) || 1;
    const current = Number(proj.currentAmount) || 0;
    const pct = Math.min(100, Math.round((current / target) * 100));
    const isCompleted = current >= target;
    const remaining = Math.max(0, target - current);

    // Calculate daily pace if deadline set
    let paceBadge = '';
    if (!isCompleted && proj.deadline) {
      const remainingWorkdays = getRemainingWorkdaysUntil(proj.deadline);
      if (remainingWorkdays > 0) {
        const dailyReq = remaining / remainingWorkdays;
        paceBadge = `
          <div class="project-daily-pace">
            <span>⚡ Meta:</span>
            <span>${formatMoney(dailyReq)} / día laboral (${remainingWorkdays} días rest.)</span>
          </div>
        `;
      }
    } else if (isCompleted) {
      paceBadge = `
        <div class="project-daily-pace" style="color: var(--emerald-light); background: rgba(16, 185, 129, 0.15);">
          <span>🎉 ¡Meta de ahorro 100% completada!</span>
        </div>
      `;
    }

    return `
      <div class="project-card ${isCompleted ? 'completed' : ''}">
        <div>
          <div class="project-header">
            <div class="project-brand">
              <div class="project-icon-badge">${proj.emoji || '🎯'}</div>
              <div class="project-title-box">
                <h4>${escapeHTML(proj.name)}</h4>
                <span>${escapeHTML(proj.category || 'Meta')}${proj.deadline ? ` • Límite: ${proj.deadline}` : ''}</span>
              </div>
            </div>
            <span class="alloc-badge ${isCompleted ? 'badge-emerald' : 'badge-blue'}">${pct}%</span>
          </div>

          <div class="project-amounts">
            <div class="project-current-val">${formatMoney(current)}</div>
            <div class="project-target-val">de ${formatMoney(target)}</div>
          </div>

          <div class="progress-bar-container">
            <div class="progress-fill ${isCompleted ? 'fill-emerald' : 'fill-blue'}" style="width: ${pct}%;"></div>
          </div>

          ${paceBadge}
        </div>

        <div class="project-actions">
          <button class="btn-project-action btn-primary" onclick="openAportarModalFor('${proj.id}')">
            + Aportar
          </button>
          <button class="btn-project-action btn-ghost" onclick="openUsarModalFor('${proj.id}')">
            - Usar / Retirar
          </button>
          <button class="tx-delete-btn" onclick="deleteProyecto('${proj.id}')" title="Eliminar proyecto">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Populate Project dropdowns in modals
function populateProjectSelects() {
  const aporteSelect = document.getElementById('inp-aporte-proy-id');
  const usarSelect = document.getElementById('inp-usar-proy-id');
  const projects = state.projects || [];

  const options = projects.map(p => `<option value="${p.id}">${p.emoji || '🎯'} ${escapeHTML(p.name)} (${formatMoney(p.currentAmount)})</option>`).join('');

  if (aporteSelect) aporteSelect.innerHTML = options || '<option value="">No hay proyectos</option>';
  if (usarSelect) usarSelect.innerHTML = options || '<option value="">No hay proyectos</option>';
}

function openAportarModalFor(projectId) {
  openModal('modal-aportar-proyecto');
  const select = document.getElementById('inp-aporte-proy-id');
  if (select) select.value = projectId;
}

function openUsarModalFor(projectId) {
  openModal('modal-usar-proyecto');
  const select = document.getElementById('inp-usar-proy-id');
  if (select) select.value = projectId;
}

// Visual Reports: Weekly Rhythm Chart & Category Breakdown
function renderWeeklyChart() {
  const container = document.getElementById('weekly-chart-bars');
  if (!container) return;

  const daysNames = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const now = new Date();
  
  // Calculate current week Sunday to Saturday
  const currentDayIndex = now.getDay(); // 0 is Sunday
  const sundayDate = new Date(now);
  sundayDate.setDate(now.getDate() - currentDayIndex);

  const weekIncomes = [0, 0, 0, 0, 0, 0, 0];

  state.transactions.forEach(tx => {
    if (tx.type === 'income' && tx.date) {
      const txDate = new Date(tx.date + 'T00:00:00');
      const diffTime = txDate - sundayDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 7) {
        weekIncomes[diffDays] += Number(tx.amount);
      }
    }
  });

  const maxIncome = Math.max(...weekIncomes, 100);

  container.innerHTML = weekIncomes.map((inc, i) => {
    const isSabbath = i === 6; // Saturday
    const heightPct = Math.round((inc / maxIncome) * 100);

    return `
      <div class="bar-col ${isSabbath ? 'sabbath' : ''}">
        <div style="font-family: var(--font-mono); font-size: 0.65rem; color: var(--text-muted);">${inc > 0 ? formatMoney(inc).replace(/S\/\.\s?/, '') : ''}</div>
        <div class="bar-track" title="${daysNames[i]}: ${isSabbath ? 'Descanso / Shabat' : formatMoney(inc)}">
          <div class="bar-fill-income" style="height: ${heightPct}%;"></div>
        </div>
        <div class="bar-label">${daysNames[i]}${isSabbath ? '<br><span style="font-size:0.6rem; color:var(--blue-light);">⛪</span>' : ''}</div>
      </div>
    `;
  }).join('');
}

function renderCategoryBreakdown() {
  const container = document.getElementById('category-breakdown-list');
  if (!container) return;

  const currentMonth = new Date().toISOString().substring(0, 7);
  const categories = {};
  let totalExpense = 0;

  state.transactions.forEach(tx => {
    if (tx.type === 'expense' && tx.date && tx.date.startsWith(currentMonth)) {
      const cat = tx.category || 'Otros';
      const amt = Number(tx.amount) || 0;
      categories[cat] = (categories[cat] || 0) + amt;
      totalExpense += amt;
    }
  });

  const sortedCats = Object.entries(categories).sort((a, b) => b[1] - a[1]);

  if (sortedCats.length === 0) {
    container.innerHTML = `<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 20px;">No hay gastos registrados en el mes actual.</p>`;
    return;
  }

  container.innerHTML = sortedCats.map(([catName, amt]) => {
    const pct = totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0;
    return `
      <div>
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px;">
          <span>${escapeHTML(catName)}</span>
          <span style="font-family: var(--font-mono); font-weight: 700;">${formatMoney(amt)} (${pct}%)</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-fill fill-rose" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

// FORM SUBMISSIONS & ACTIONS

// 1. Submit Nuevo Ingreso
function submitNuevoIngreso() {
  const montoInput = document.getElementById('inp-ingreso-monto');
  const cuentaSelect = document.getElementById('inp-ingreso-cuenta');
  const descInput = document.getElementById('inp-ingreso-desc');
  const fechaInput = document.getElementById('inp-ingreso-fecha');
  const autoAllocateCheck = document.getElementById('inp-ingreso-auto-allocate');

  const amount = parseFloat(montoInput ? montoInput.value : 0);
  if (!amount || amount <= 0) {
    alert('Por favor ingresa un monto válido.');
    return;
  }

  const account = cuentaSelect ? cuentaSelect.value : 'cash';
  const desc = (descInput && descInput.value.trim()) ? descInput.value.trim() : 'Ingreso por trabajo';
  const date = (fechaInput && fechaInput.value) ? fechaInput.value : new Date().toISOString().split('T')[0];
  const autoAllocate = autoAllocateCheck ? autoAllocateCheck.checked : true;

  const tithePct = (state.config ? state.config.tithePct : 10) / 100;
  const savingsPct = (state.config ? state.config.savingsPct : 20) / 100;

  const titheVal = autoAllocate ? (amount * tithePct) : 0;
  const savingsVal = autoAllocate ? (amount * savingsPct) : 0;
  const freeCash = amount - titheVal - savingsVal;

  // Add into selected account
  state.accounts[account] = (Number(state.accounts[account]) || 0) + (autoAllocate ? freeCash : amount);

  // Add into funds
  if (autoAllocate) {
    state.funds.tithe = (Number(state.funds.tithe) || 0) + titheVal;
    state.funds.savings = (Number(state.funds.savings) || 0) + savingsVal;
  }

  // Register Transaction
  const newTx = {
    id: 'tx_' + Date.now(),
    type: 'income',
    amount: amount,
    accountId: account,
    category: 'Ingresos',
    description: desc,
    date: date,
    allocations: {
      tithe: titheVal,
      savings: savingsVal,
      free: freeCash
    },
    createdAt: Date.now()
  };

  state.transactions.unshift(newTx);

  // Reset form & close
  montoInput.value = '';
  if (descInput) descInput.value = '';
  closeModal('modal-ingreso');

  persistState();
  updateUI();
}

// 2. Submit Nuevo Gasto
function submitNuevoGasto() {
  const montoInput = document.getElementById('inp-gasto-monto');
  const cuentaSelect = document.getElementById('inp-gasto-cuenta');
  const catSelect = document.getElementById('inp-gasto-cat');
  const descInput = document.getElementById('inp-gasto-desc');
  const fechaInput = document.getElementById('inp-gasto-fecha');

  const amount = parseFloat(montoInput ? montoInput.value : 0);
  if (!amount || amount <= 0) {
    alert('Por favor ingresa un monto válido.');
    return;
  }

  const account = cuentaSelect ? cuentaSelect.value : 'cash';
  const cat = catSelect ? catSelect.value : 'Alimentación';
  const desc = (descInput && descInput.value.trim()) ? descInput.value.trim() : cat;
  const date = (fechaInput && fechaInput.value) ? fechaInput.value : new Date().toISOString().split('T')[0];

  // Deduct from account
  state.accounts[account] = (Number(state.accounts[account]) || 0) - amount;

  const newTx = {
    id: 'tx_' + Date.now(),
    type: 'expense',
    amount: amount,
    accountId: account,
    category: cat,
    description: desc,
    date: date,
    createdAt: Date.now()
  };

  state.transactions.unshift(newTx);

  montoInput.value = '';
  if (descInput) descInput.value = '';
  closeModal('modal-gasto');

  persistState();
  updateUI();
}

// 3. Submit Transferencia entre Cuentas
function submitTransferencia() {
  const montoInput = document.getElementById('inp-transfer-monto');
  const origenSelect = document.getElementById('inp-transfer-origen');
  const destinoSelect = document.getElementById('inp-transfer-destino');
  const descInput = document.getElementById('inp-transfer-desc');

  const amount = parseFloat(montoInput ? montoInput.value : 0);
  if (!amount || amount <= 0) {
    alert('Ingresa un monto válido para transferir.');
    return;
  }

  const fromAcc = origenSelect.value;
  const toAcc = destinoSelect.value;

  if (fromAcc === toAcc) {
    alert('La cuenta de origen y destino no pueden ser la misma.');
    return;
  }

  // Process balance transfer
  if (fromAcc === 'savings') {
    state.funds.savings = (Number(state.funds.savings) || 0) - amount;
  } else {
    state.accounts[fromAcc] = (Number(state.accounts[fromAcc]) || 0) - amount;
  }

  if (toAcc === 'savings') {
    state.funds.savings = (Number(state.funds.savings) || 0) + amount;
  } else {
    state.accounts[toAcc] = (Number(state.accounts[toAcc]) || 0) + amount;
  }

  const desc = (descInput && descInput.value.trim()) ? descInput.value.trim() : `Transferencia de ${fromAcc} a ${toAcc}`;

  state.transactions.unshift({
    id: 'tx_' + Date.now(),
    type: 'transfer',
    amount: amount,
    accountId: fromAcc,
    toAccountId: toAcc,
    category: 'Transferencia',
    description: desc,
    date: new Date().toISOString().split('T')[0],
    createdAt: Date.now()
  });

  montoInput.value = '';
  closeModal('modal-transfer');

  persistState();
  updateUI();
}

// 4. Submit Nuevo Pago Fijo
function submitNuevoPagoFijo() {
  const nombreInput = document.getElementById('inp-fijo-nombre');
  const montoInput = document.getElementById('inp-fijo-monto');
  const diaInput = document.getElementById('inp-fijo-dia');
  const catSelect = document.getElementById('inp-fijo-cat');

  const nombre = nombreInput ? nombreInput.value.trim() : '';
  const monto = parseFloat(montoInput ? montoInput.value : 0);
  const dia = parseInt(diaInput ? diaInput.value : 15, 10);
  const cat = catSelect ? catSelect.value : 'Vivienda';

  if (!nombre || monto <= 0) {
    alert('Ingresa el nombre y un monto válido.');
    return;
  }

  state.fixedPayments.push({
    id: 'f_' + Date.now(),
    name: nombre,
    amount: monto,
    dueDay: dia,
    category: cat,
    isPaidThisMonth: false,
    lastPaidMonth: ''
  });

  nombreInput.value = '';
  montoInput.value = '';
  closeModal('modal-fijo');

  persistState();
  updateUI();
}

// 5. Submit Entrega de Diezmo
function submitEntregaDiezmo() {
  const montoInput = document.getElementById('inp-diezmo-monto');
  const origenSelect = document.getElementById('inp-diezmo-origen');
  const iglesiaInput = document.getElementById('inp-diezmo-iglesia');
  const fechaInput = document.getElementById('inp-diezmo-fecha');
  const notaInput = document.getElementById('inp-diezmo-nota');

  const amount = parseFloat(montoInput ? montoInput.value : 0);
  if (!amount || amount <= 0) {
    alert('Ingresa un monto válido para la entrega de diezmo.');
    return;
  }

  const origen = origenSelect ? origenSelect.value : 'cash';
  const church = (iglesiaInput && iglesiaInput.value.trim()) ? iglesiaInput.value.trim() : 'Iglesia Adventista';
  const date = (fechaInput && fechaInput.value) ? fechaInput.value : new Date().toISOString().split('T')[0];
  const note = notaInput ? notaInput.value.trim() : '';

  // Deduct from Tithe fund and account
  state.funds.tithe = Math.max(0, (Number(state.funds.tithe) || 0) - amount);

  // Register in Tithe Deliveries
  state.titheDeliveries.unshift({
    id: 'td_' + Date.now(),
    amount: amount,
    fromAccount: origen,
    church: church,
    date: date,
    note: note
  });

  // Register in general ledger
  state.transactions.unshift({
    id: 'tx_' + Date.now(),
    type: 'tithe_delivery',
    amount: amount,
    accountId: origen,
    category: 'Diezmo',
    description: `Entrega de Diezmo - ${church}`,
    date: date,
    createdAt: Date.now()
  });

  montoInput.value = '';
  closeModal('modal-entrega-diezmo');

  persistState();
  updateUI();
}

// 6. Submit Nuevo Proyecto de Ahorro
function submitNuevoProyecto() {
  const nombreInput = document.getElementById('inp-proy-nombre');
  const emojiSelect = document.getElementById('inp-proy-emoji');
  const montoInput = document.getElementById('inp-proy-monto');
  const inicialInput = document.getElementById('inp-proy-inicial');
  const fechaInput = document.getElementById('inp-proy-fecha');

  const nombre = nombreInput ? nombreInput.value.trim() : '';
  const emoji = emojiSelect ? emojiSelect.value : '✈️';
  const targetAmount = parseFloat(montoInput ? montoInput.value : 0);
  const initialAmount = parseFloat(inicialInput ? inicialInput.value : 0) || 0;
  const deadline = fechaInput ? fechaInput.value : '';

  if (!nombre || targetAmount <= 0) {
    alert('Ingresa el nombre y un monto meta válido mayor a 0.');
    return;
  }

  if (!Array.isArray(state.projects)) state.projects = [];

  const newProject = {
    id: 'p_' + Date.now(),
    name: nombre,
    emoji: emoji,
    targetAmount: targetAmount,
    currentAmount: initialAmount,
    deadline: deadline,
    category: 'Proyecto'
  };

  state.projects.push(newProject);

  // If initial amount > 0, reflect in savings
  if (initialAmount > 0) {
    state.funds.savings = (Number(state.funds.savings) || 0) + initialAmount;
    state.transactions.unshift({
      id: 'tx_' + Date.now(),
      type: 'project_deposit',
      amount: initialAmount,
      accountId: 'cash',
      category: 'Ahorro',
      description: `Aporte inicial para ${emoji} ${nombre}`,
      date: new Date().toISOString().split('T')[0],
      createdAt: Date.now()
    });
  }

  nombreInput.value = '';
  montoInput.value = '';
  if (inicialInput) inicialInput.value = '0';
  closeModal('modal-nuevo-proyecto');

  persistState();
  updateUI();
}

// 7. Submit Aporte a Proyecto
function submitAporteProyecto() {
  const proySelect = document.getElementById('inp-aporte-proy-id');
  const montoInput = document.getElementById('inp-aporte-proy-monto');
  const origenSelect = document.getElementById('inp-aporte-proy-origen');
  const descInput = document.getElementById('inp-aporte-proy-desc');

  const proyId = proySelect ? proySelect.value : '';
  const amount = parseFloat(montoInput ? montoInput.value : 0);
  const origen = origenSelect ? origenSelect.value : 'cash';
  const desc = (descInput && descInput.value.trim()) ? descInput.value.trim() : 'Aporte a proyecto';

  if (!proyId) {
    alert('Selecciona un proyecto.');
    return;
  }
  if (!amount || amount <= 0) {
    alert('Ingresa un monto válido para aportar.');
    return;
  }

  const project = state.projects.find(p => p.id === proyId);
  if (!project) return;

  // Deduct from origin
  if (origen === 'cash' || origen === 'bank') {
    state.accounts[origen] = (Number(state.accounts[origen]) || 0) - amount;
    state.funds.savings = (Number(state.funds.savings) || 0) + amount;
  } else if (origen === 'savings_free') {
    // Coming from general savings pool, savings total stays same, project current increases
  }

  project.currentAmount = (Number(project.currentAmount) || 0) + amount;

  state.transactions.unshift({
    id: 'tx_' + Date.now(),
    type: 'project_deposit',
    amount: amount,
    accountId: origen === 'savings_free' ? 'savings' : origen,
    category: 'Proyectos',
    description: `Aporte a ${project.emoji || '🎯'} ${project.name}: ${desc}`,
    date: new Date().toISOString().split('T')[0],
    createdAt: Date.now()
  });

  montoInput.value = '';
  if (descInput) descInput.value = '';
  closeModal('modal-aportar-proyecto');

  persistState();
  updateUI();
}

// 8. Submit Usar / Retirar Dinero de Proyecto
function submitUsarProyecto() {
  const proySelect = document.getElementById('inp-usar-proy-id');
  const montoInput = document.getElementById('inp-usar-proy-monto');
  const destinoSelect = document.getElementById('inp-usar-proy-destino');
  const descInput = document.getElementById('inp-usar-proy-desc');

  const proyId = proySelect ? proySelect.value : '';
  const amount = parseFloat(montoInput ? montoInput.value : 0);
  const destino = destinoSelect ? destinoSelect.value : 'expense';
  const desc = (descInput && descInput.value.trim()) ? descInput.value.trim() : 'Uso de fondos';

  if (!proyId) {
    alert('Selecciona un proyecto.');
    return;
  }
  if (!amount || amount <= 0) {
    alert('Ingresa un monto válido.');
    return;
  }

  const project = state.projects.find(p => p.id === proyId);
  if (!project) return;

  if (amount > Number(project.currentAmount || 0)) {
    alert(`El proyecto solo cuenta con ${formatMoney(project.currentAmount)} disponibles.`);
    return;
  }

  // Deduct from project
  project.currentAmount = (Number(project.currentAmount) || 0) - amount;
  state.funds.savings = Math.max(0, (Number(state.funds.savings) || 0) - amount);

  if (destino === 'cash') {
    state.accounts.cash = (Number(state.accounts.cash) || 0) + amount;
  } else if (destino === 'bank') {
    state.accounts.bank = (Number(state.accounts.bank) || 0) + amount;
  }

  state.transactions.unshift({
    id: 'tx_' + Date.now(),
    type: destino === 'expense' ? 'expense' : 'transfer',
    amount: amount,
    accountId: destino === 'expense' ? 'savings' : 'savings',
    toAccountId: destino !== 'expense' ? destino : null,
    category: 'Proyectos',
    description: `Gasto de ${project.emoji || '🎯'} ${project.name}: ${desc}`,
    date: new Date().toISOString().split('T')[0],
    createdAt: Date.now()
  });

  montoInput.value = '';
  if (descInput) descInput.value = '';
  closeModal('modal-usar-proyecto');

  persistState();
  updateUI();
}

function deleteProyecto(projectId) {
  const project = (state.projects || []).find(p => p.id === projectId);
  if (!project) return;

  if (confirm(`¿Deseas eliminar el proyecto "${project.name}"? Los fondos acumulados (${formatMoney(project.currentAmount)}) permanecerán en tu fondo de ahorro libre.`)) {
    state.projects = state.projects.filter(p => p.id !== projectId);
    persistState();
    updateUI();
  }
}

// 9. Delete Transaction
function deleteTransaction(txId) {
  if (!confirm('¿Deseas eliminar este movimiento del historial?')) return;
  state.transactions = state.transactions.filter(t => t.id !== txId);
  persistState();
  updateUI();
}

// Configuration & Backup Handlers
function saveFinancialConfig() {
  const currInp = document.getElementById('cfg-currency');
  const titheInp = document.getElementById('cfg-tithe-pct');
  const savInp = document.getElementById('cfg-savings-pct');
  const workInp = document.getElementById('cfg-workdays');

  state.config.currency = currInp ? currInp.value.trim() : 'S/.';
  state.config.tithePct = parseFloat(titheInp ? titheInp.value : 10) || 10;
  state.config.savingsPct = parseFloat(savInp ? savInp.value : 20) || 20;
  state.config.workDaysPerMonth = parseInt(workInp ? workInp.value : 26, 10) || 26;

  persistState();
  updateUI();
  alert('Parámetros guardados con éxito.');
}

function submitSyncPasscode() {
  const passInp = document.getElementById('modal-sync-pass');
  const code = passInp ? passInp.value.trim() : '';
  if (!code) {
    alert('Ingresa una clave de seguridad.');
    return;
  }

  state.config.cloudPasscode = code;
  state.config.cloudSyncEnabled = true;
  closeModal('modal-sync');
  pushCloudState();
}

function syncNowWithCloud() {
  const passInp = document.getElementById('cfg-cloud-passcode');
  if (passInp && passInp.value.trim()) {
    state.config.cloudPasscode = passInp.value.trim();
    state.config.cloudSyncEnabled = true;
  }
  pushCloudState();
}

function exportDataJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `finanzas_backup_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function exportTransactionsCSV() {
  let csv = "\uFEFFFecha,Tipo,Categoría,Descripción,Monto,Cuenta\n";
  state.transactions.forEach(t => {
    const typeLabel = t.type === 'income' ? 'Ingreso' : (t.type === 'expense' ? 'Gasto' : t.type);
    const accLabel = t.accountId === 'cash' ? 'Efectivo' : 'Banco/Digital';
    csv += `"${t.date || ''}","${typeLabel}","${t.category || ''}","${(t.description || '').replace(/"/g, '""')}","${t.amount}","${accLabel}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `movimientos_finanzas_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function importDataJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported && (imported.accounts || imported.transactions)) {
        state = imported;
        persistState();
        updateUI();
        alert('¡Copia de seguridad restaurada con éxito!');
      } else {
        alert('Archivo de copia de seguridad no válido.');
      }
    } catch (err) {
      alert('Error al leer el archivo JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function resetAllDataConfirm() {
  if (confirm('⚠️ ¿Estás completamente seguro de reiniciar todos los datos a cero? Se borrarán todos los movimientos registrados.')) {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    persistState();
    updateUI();
    alert('Datos reiniciados.');
  }
}

// Modal Helpers
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('open');
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('open');
  }
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
  if (e.target && e.target.classList.contains('modal-backdrop')) {
    e.target.classList.remove('open');
  }
});

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
