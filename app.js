// Finanzas Tournament Manager - Application Logic

// Application State
let state = {
  active: false,
  players: [],      // 8 players: { id, name, pot, country }
  teams: [],        // 4 teams: { id, name, player1, player2 }
  fixtures: [],     // 3 rounds (Lunes, Martes, Jueves), each with 2 series
  semifinals: null, // Weekend Semifinals: { sf1, sf2 }
  grandFinal: null  // Weekend Grand Final series: { teamA_id, teamB_id, matches: [...] }
};

// LocalStorage Keys
const STORAGE_KEY = 'finanzas_tournament_state';

// Pre-filled defaults for quick testing
const DEFAULT_PLAYERS_A = ["Carlos", "Mateo", "Sofía", "Lucas"];
const DEFAULT_PLAYERS_B = ["Diego", "Valentina", "Thiago", "Martina"];
const DEFAULT_COUNTRIES = [
  "Argentina", "Brasil", "Francia", "Inglaterra", 
  "España", "Alemania", "Italia", "Portugal"
];

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  initTabs();
  
  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registrado con éxito', reg))
      .catch(err => console.warn('Error al registrar Service Worker', err));
  }

  // Live Cloud Database Polling: Fetch changes every 30 seconds
  setInterval(() => {
    // Only poll if the tab is visible to save battery/bandwidth
    if (document.visibilityState === 'visible') {
      fetchStateFromCloud();
    }
  }, 30000);
});

// Load state from LocalStorage and Cloudflare API
function loadState() {
  // 1. Instant local load (Fast feedback)
  let savedState = localStorage.getItem(STORAGE_KEY);
  if (!savedState) {
    // Graceful migration from previous key
    savedState = localStorage.getItem('efootball_tournament_state');
    if (savedState) {
      localStorage.setItem(STORAGE_KEY, savedState);
    }
  }
  if (savedState) {
    try {
      state = JSON.parse(savedState);
      updateUI();
    } catch (e) {
      console.error("Error parsing saved state", e);
    }
  } else {
    updateUI();
  }

  // 2. Fetch live global state from cloud database
  fetchStateFromCloud();
}

async function fetchStateFromCloud() {
  try {
    const res = await fetch('./api/state');
    if (res.ok) {
      const cloudState = await res.json();
      if (cloudState && 'active' in cloudState) {
        // Compare with local state to see if it changed
        const localStr = localStorage.getItem(STORAGE_KEY) || '';
        const cloudStr = JSON.stringify(cloudState);
        if (localStr !== cloudStr) {
          state = cloudState;
          localStorage.setItem(STORAGE_KEY, cloudStr);
          updateUI();
        }
      }
    }
  } catch (err) {
    console.warn("Cloud Sync: Error al conectar con la base de datos", err);
  }
}

// Save state to LocalStorage and Cloudflare API
function saveState() {
  const stateStr = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, stateStr);
  
  // If admin, sync to cloud database
  if (getIsAdmin()) {
    syncStateToCloud(stateStr);
  }
}

async function syncStateToCloud(stateStr) {
  try {
    const res = await fetch('./api/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'admin777' // Backend API admin validation
      },
      body: stateStr
    });
    if (!res.ok) {
      console.warn("Cloud Sync: Fallo al guardar en la nube", res.statusText);
    }
  } catch (err) {
    console.error("Cloud Sync: Error de red al sincronizar", err);
  }
}

// Reset/Clean Tournament (Triggers custom confirmation modal)
function resetTournament() {
  if (!getIsAdmin()) {
    alert("Operación denegada. Debes iniciar sesión como Administrador para reiniciar el torneo.");
    return;
  }
  document.getElementById('confirm-modal').style.display = 'flex';
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').style.display = 'none';
}

function executeReset() {
  closeConfirmModal();

  state = {
    active: false,
    players: [],
    teams: [],
    fixtures: [],
    semifinals: null,
    grandFinal: null
  };
  saveState();
  
  // Clear Sorteo result display and reset inputs to defaults
  document.getElementById('draw-results-card').style.display = 'none';
  
  // Restore input defaults in DOM
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`p-a${i}`).value = DEFAULT_PLAYERS_A[i-1];
    document.getElementById(`p-b${i}`).value = DEFAULT_PLAYERS_B[i-1];
  }
  for (let i = 1; i <= 8; i++) {
    document.getElementById(`c-${i}`).value = DEFAULT_COUNTRIES[i-1];
  }

  // Switch view to Sorteo
  switchView('view-sorteo');
  updateUI();
}

// Utility: Shuffle Array (Fisher-Yates)
function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  const newArray = [...array];

  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [newArray[currentIndex], newArray[randomIndex]] = [
      newArray[randomIndex], newArray[currentIndex]];
  }

  return newArray;
}

// RUN THE DRAW (Sorteo)
function runDraw() {
  // 1. Gather values from DOM
  const playersA = [];
  const playersB = [];
  const countries = [];

  for (let i = 1; i <= 4; i++) {
    const valA = document.getElementById(`p-a${i}`).value.trim();
    const valB = document.getElementById(`p-b${i}`).value.trim();
    if (!valA || !valB) {
      alert("Por favor ingresa todos los nombres de los jugadores.");
      return;
    }
    playersA.push(valA);
    playersB.push(valB);
  }

  for (let i = 1; i <= 8; i++) {
    const countryVal = document.getElementById(`c-${i}`).value.trim();
    if (!countryVal) {
      alert("Por favor ingresa todos los 8 países.");
      return;
    }
    countries.push(countryVal);
  }

  // Check if manual assignment is enabled
  const isManual = document.getElementById('manual-draw-checkbox').checked;

  // Shuffle Countries if not manual
  const shuffledCountries = isManual ? [...countries] : shuffle(countries);

  // 2. Create player objects with countries assigned
  const potAPlayers = playersA.map((name, idx) => ({
    id: `A-${idx + 1}`,
    name: name,
    pot: 'A',
    country: shuffledCountries[idx] // indices 0 to 3 (Country 1, 3, 5, 7 in order)
  }));

  const potBPlayers = playersB.map((name, idx) => ({
    id: `B-${idx + 1}`,
    name: name,
    pot: 'B',
    country: shuffledCountries[idx + 4] // indices 4 to 7 (Country 2, 4, 6, 8 in order)
  }));

  state.players = [...potAPlayers, ...potBPlayers];

  // 3. Pair Pot A with Pot B to form 4 Teams
  const finalA = isManual ? [...potAPlayers] : shuffle(potAPlayers);
  const finalB = isManual ? [...potBPlayers] : shuffle(potBPlayers);

  state.teams = [];
  for (let i = 0; i < 4; i++) {
    state.teams.push({
      id: i + 1,
      name: `Pareja ${i + 1}`,
      player1: finalA[i],
      player2: finalB[i]
    });
  }

  // 4. Generate Fixtures (Round Robin - 3 Jornadas)
  // Let T1, T2, T3, T4 represent Team IDs 1, 2, 3, 4
  // Round 1: T1 vs T4, T2 vs T3
  // Round 2: T1 vs T3, T4 vs T2
  // Round 3: T1 vs T2, T3 vs T4
  state.fixtures = [
    {
      id: 'lunes',
      name: 'Jornada 1 (Lunes)',
      series: [
        createSeries('j1-s1', 1, 4),
        createSeries('j1-s2', 2, 3)
      ]
    },
    {
      id: 'martes',
      name: 'Jornada 2 (Martes)',
      series: [
        createSeries('j2-s1', 1, 3),
        createSeries('j2-s2', 4, 2)
      ]
    },
    {
      id: 'jueves',
      name: 'Jornada 3 (Jueves)',
      series: [
        createSeries('j3-s1', 1, 2),
        createSeries('j3-s2', 3, 4)
      ]
    }
  ];

  state.semifinals = null;
  state.grandFinal = null;
  state.active = true;

  saveState();
  updateUI();

  // Show draw results and highlight them
  document.getElementById('draw-results-card').style.display = 'block';
  renderPairs();

  // Scroll to show pairings
  document.getElementById('draw-results-card').scrollIntoView({ behavior: 'smooth' });
}

// Create a 5-match series between Team A and Team B
function createSeries(seriesId, teamAId, teamBId) {
  const teamA = state.teams.find(t => t.id === teamAId);
  const teamB = state.teams.find(t => t.id === teamBId);

  // Each series consists of:
  // Match 1: Player 1 (A) vs Player 1 (B) [1vs1]
  // Match 2: Player 1 (A) vs Player 2 (B) [1vs1]
  // Match 3: Player 2 (A) vs Player 1 (B) [1vs1]
  // Match 4: Player 2 (A) vs Player 2 (B) [1vs1]
  // Match 5: Team A vs Team B [2vs2]
  return {
    id: seriesId,
    teamA_id: teamAId,
    teamB_id: teamBId,
    matches: [
      {
        id: `${seriesId}-m1`,
        type: '1vs1',
        title: 'Partido 1 (1vs1)',
        pA_name: `${teamA.player1.name} (${teamA.player1.country})`,
        pB_name: `${teamB.player1.name} (${teamB.player1.country})`,
        scoreA: null,
        scoreB: null
      },
      {
        id: `${seriesId}-m2`,
        type: '1vs1',
        title: 'Partido 2 (1vs1)',
        pA_name: `${teamA.player1.name} (${teamA.player1.country})`,
        pB_name: `${teamB.player2.name} (${teamB.player2.country})`,
        scoreA: null,
        scoreB: null
      },
      {
        id: `${seriesId}-m3`,
        type: '1vs1',
        title: 'Partido 3 (1vs1)',
        pA_name: `${teamA.player2.name} (${teamA.player2.country})`,
        pB_name: `${teamB.player1.name} (${teamB.player1.country})`,
        scoreA: null,
        scoreB: null
      },
      {
        id: `${seriesId}-m4`,
        type: '1vs1',
        title: 'Partido 4 (1vs1)',
        pA_name: `${teamA.player2.name} (${teamA.player2.country})`,
        pB_name: `${teamB.player2.name} (${teamB.player2.country})`,
        scoreA: null,
        scoreB: null
      },
      {
        id: `${seriesId}-m5`,
        type: '2vs2',
        title: 'Partido 5 (2vs2)',
        pA_name: `${teamA.name} [Doble]`,
        pB_name: `${teamB.name} [Doble]`,
        scoreA: null,
        scoreB: null
      }
    ]
  };
}

// Standings Calculator
function calculateStandings() {
  if (!state.active || state.teams.length === 0) return [];

  // Initialize
  const standings = state.teams.map(t => ({
    id: t.id,
    name: t.name,
    player1: t.player1,
    player2: t.player2,
    pj: 0,
    pg: 0,
    pe: 0,
    pp: 0,
    gf: 0,
    gc: 0,
    points: 0 // Bolsa
  }));

  // Aggregate results from Round Robin fixtures
  state.fixtures.forEach(jornada => {
    jornada.series.forEach(series => {
      series.matches.forEach(match => {
        if (match.scoreA !== null && match.scoreB !== null) {
          const sA = parseInt(match.scoreA);
          const sB = parseInt(match.scoreB);
          
          if (isNaN(sA) || isNaN(sB)) return;

          const teamA = standings.find(t => t.id === series.teamA_id);
          const teamB = standings.find(t => t.id === series.teamB_id);

          if (teamA && teamB) {
            teamA.pj += 1;
            teamB.pj += 1;
            teamA.gf += sA;
            teamB.gf += sB;
            teamA.gc += sB;
            teamB.gc += sA;

            if (sA > sB) {
              teamA.pg += 1;
              teamA.points += 3;
              teamB.pp += 1;
            } else if (sA < sB) {
              teamB.pg += 1;
              teamB.points += 3;
              teamA.pp += 1;
            } else {
              teamA.pe += 1;
              teamB.pe += 1;
              teamA.points += 1;
              teamB.points += 1;
            }
          }
        }
      });
    });
  });

  // Sort Standings
  // 1. Bolsa (Points)
  // 2. Goal Difference (GF - GC)
  // 3. Goals For (GF)
  standings.sort((a, b) => {
    const gdA = a.gf - a.gc;
    const gdB = b.gf - b.gc;

    if (b.points !== a.points) {
      return b.points - a.points;
    }
    if (gdB !== gdA) {
      return gdB - gdA;
    }
    return b.gf - a.gf;
  });

  return standings;
}

// Check and manage playoff stages (Semifinals and Grand Final)
function checkAndGeneratePlayoffs() {
  if (!state.active) return;

  // 1. Check if all 30 matches of the Round Robin are complete
  let roundRobinComplete = true;
  let totalRRMatches = 0;

  state.fixtures.forEach(j => {
    j.series.forEach(s => {
      s.matches.forEach(m => {
        totalRRMatches++;
        if (m.scoreA === null || m.scoreB === null || m.scoreA === '' || m.scoreB === '') {
          roundRobinComplete = false;
        }
      });
    });
  });

  if (roundRobinComplete && totalRRMatches > 0) {
    const standings = calculateStandings();
    if (standings.length >= 4) {
      const top1 = standings[0];
      const top2 = standings[1];
      const top3 = standings[2];
      const top4 = standings[3];

      // If Semifinals are not created or teams changed, generate them
      if (
        !state.semifinals ||
        state.semifinals.sf1.teamA_id !== top1.id ||
        state.semifinals.sf1.teamB_id !== top4.id ||
        state.semifinals.sf2.teamA_id !== top2.id ||
        state.semifinals.sf2.teamB_id !== top3.id
      ) {
        state.semifinals = {
          sf1: createPlayoffSeries('sf1', top1, top4, 'Semifinal 1'),
          sf2: createPlayoffSeries('sf2', top2, top3, 'Semifinal 2')
        };
        // Reset Grand Final because Semis are fresh
        state.grandFinal = null;
      }
    }
  } else {
    // Round Robin not complete -> no playoffs
    state.semifinals = null;
    state.grandFinal = null;
    return;
  }

  // 2. Check if Semifinals are complete to generate Grand Final
  if (state.semifinals) {
    let sfComplete = true;
    
    // Check SF1
    state.semifinals.sf1.matches.forEach(m => {
      if (m.scoreA === null || m.scoreB === null || m.scoreA === '' || m.scoreB === '') {
        sfComplete = false;
      }
    });

    // Check SF2
    state.semifinals.sf2.matches.forEach(m => {
      if (m.scoreA === null || m.scoreB === null || m.scoreA === '' || m.scoreB === '') {
        sfComplete = false;
      }
    });

    if (sfComplete) {
      const winnerSF1 = getPlayoffWinner(state.semifinals.sf1);
      const winnerSF2 = getPlayoffWinner(state.semifinals.sf2);

      if (winnerSF1 && winnerSF2) {
        // Generate Grand Final if not exists or if finalists changed
        if (
          !state.grandFinal ||
          state.grandFinal.teamA_id !== winnerSF1.id ||
          state.grandFinal.teamB_id !== winnerSF2.id
        ) {
          state.grandFinal = createPlayoffSeries('gf', winnerSF1, winnerSF2, 'Gran Final');
        }
      }
    } else {
      state.grandFinal = null;
    }
  }
}

// Create a 5-match playoff series structure
function createPlayoffSeries(seriesId, teamA, teamB, titlePrefix) {
  return {
    id: seriesId,
    teamA_id: teamA.id,
    teamB_id: teamB.id,
    matches: [
      {
        id: `${seriesId}-m1`,
        type: '1vs1',
        title: `${titlePrefix} - Partido 1 (1vs1)`,
        pA_name: `${teamA.player1.name} (${teamA.player1.country})`,
        pB_name: `${teamB.player1.name} (${teamB.player1.country})`,
        scoreA: null,
        scoreB: null
      },
      {
        id: `${seriesId}-m2`,
        type: '1vs1',
        title: `${titlePrefix} - Partido 2 (1vs1)`,
        pA_name: `${teamA.player1.name} (${teamA.player1.country})`,
        pB_name: `${teamB.player2.name} (${teamB.player2.country})`,
        scoreA: null,
        scoreB: null
      },
      {
        id: `${seriesId}-m3`,
        type: '1vs1',
        title: `${titlePrefix} - Partido 3 (1vs1)`,
        pA_name: `${teamA.player2.name} (${teamA.player2.country})`,
        pB_name: `${teamB.player1.name} (${teamB.player1.country})`,
        scoreA: null,
        scoreB: null
      },
      {
        id: `${seriesId}-m4`,
        type: '1vs1',
        title: `${titlePrefix} - Partido 4 (1vs1)`,
        pA_name: `${teamA.player2.name} (${teamA.player2.country})`,
        pB_name: `${teamB.player2.name} (${teamB.player2.country})`,
        scoreA: null,
        scoreB: null
      },
      {
        id: `${seriesId}-m5`,
        type: '2vs2',
        title: `${titlePrefix} - Partido 5 (2vs2)`,
        pA_name: `${teamA.name} [Doble]`,
        pB_name: `${teamB.name} [Doble]`,
        scoreA: null,
        scoreB: null
      }
    ]
  };
}

// Get the winner of a playoff series (handling tie-breakers)
function getPlayoffWinner(series) {
  const teamA = state.teams.find(t => t.id === series.teamA_id);
  const teamB = state.teams.find(t => t.id === series.teamB_id);

  let ptsA = 0;
  let ptsB = 0;
  let gfA = 0;
  let gfB = 0;

  series.matches.forEach(m => {
    if (m.scoreA !== null && m.scoreB !== null && m.scoreA !== '' && m.scoreB !== '') {
      const sA = parseInt(m.scoreA);
      const sB = parseInt(m.scoreB);
      gfA += sA;
      gfB += sB;

      if (sA > sB) ptsA += 3;
      else if (sA < sB) ptsB += 3;
      else {
        ptsA += 1;
        ptsB += 1;
      }
    }
  });

  if (ptsA > ptsB) return teamA;
  if (ptsB > ptsA) return teamB;

  // Tie breaker 1: Goal Difference in series
  const gdA = gfA - gfB;
  const gdB = gfB - gfA;
  if (gdA > gdB) return teamA;
  if (gdB > gdA) return teamB;

  // Tie breaker 2: Goals For in series
  if (gfA > gfB) return teamA;
  if (gfB > gfA) return teamB;

  // Tie breaker 3: Seed (Position in Round Robin standings)
  const standings = calculateStandings();
  const indexA = standings.findIndex(t => t.id === teamA.id);
  const indexB = standings.findIndex(t => t.id === teamB.id);

  if (indexA < indexB) return teamA; // Higher standings has lower index
  return teamB;
}

// SAVE MATCH SCORE (Updates state dynamically and triggers recalculations)
function saveScore(jornadaId, seriesId, matchId, teamIndex, value) {
  const scoreVal = value === '' ? null : parseInt(value);

  if (jornadaId === 'finde') {
    // Weekend Playoffs Match Score Update
    if (matchId.startsWith('sf1') && state.semifinals) {
      const match = state.semifinals.sf1.matches.find(m => m.id === matchId);
      if (match) {
        if (teamIndex === 'A') match.scoreA = scoreVal;
        if (teamIndex === 'B') match.scoreB = scoreVal;
      }
    } else if (matchId.startsWith('sf2') && state.semifinals) {
      const match = state.semifinals.sf2.matches.find(m => m.id === matchId);
      if (match) {
        if (teamIndex === 'A') match.scoreA = scoreVal;
        if (teamIndex === 'B') match.scoreB = scoreVal;
      }
    } else if (matchId.startsWith('gf') && state.grandFinal) {
      const match = state.grandFinal.matches.find(m => m.id === matchId);
      if (match) {
        if (teamIndex === 'A') match.scoreA = scoreVal;
        if (teamIndex === 'B') match.scoreB = scoreVal;
      }
    }
  } else {
    // Round Robin Match Score Update
    const jornada = state.fixtures.find(j => j.id === jornadaId);
    if (jornada) {
      const series = jornada.series.find(s => s.id === seriesId);
      if (series) {
        const match = series.matches.find(m => m.id === matchId);
        if (match) {
          if (teamIndex === 'A') match.scoreA = scoreVal;
          if (teamIndex === 'B') match.scoreB = scoreVal;
        }
      }
    }
  }

  // Recalculate Playoffs
  checkAndGeneratePlayoffs();
  saveState();

  // Dynamically update views
  renderStandings();
  updateRecoveryStats();
  
  if (jornadaId === 'finde') {
    renderPlayoffs();
  } else {
    updateSeriesSummaryHeader(jornadaId, seriesId);
  }
}

// Update the series accordion header points summary in the DOM without fully rebuilding
function updateSeriesSummaryHeader(jornadaId, seriesId) {
  const jornada = state.fixtures.find(j => j.id === jornadaId);
  if (!jornada) return;
  const series = jornada.series.find(s => s.id === seriesId);
  if (!series) return;

  const headerEl = document.querySelector(`.series-accordion[data-series-id="${seriesId}"] .series-scores-summary`);
  const statusEl = document.querySelector(`.series-accordion[data-series-id="${seriesId}"] .series-status-badge`);
  
  if (headerEl && statusEl) {
    const summary = getSeriesSummary(series);
    headerEl.textContent = `Series: ${summary.ptsA} - ${summary.ptsB} pts`;
    
    if (summary.isComplete) {
      statusEl.className = 'series-status-badge status-completed';
      statusEl.textContent = 'Completado';
    } else {
      statusEl.className = 'series-status-badge status-pending';
      statusEl.textContent = 'Pendiente';
    }
  }
}

// Calculate points gained inside a specific series
function getSeriesSummary(series) {
  let ptsA = 0;
  let ptsB = 0;
  let isComplete = true;

  series.matches.forEach(m => {
    if (m.scoreA !== null && m.scoreB !== null && m.scoreA !== '' && m.scoreB !== '') {
      const sA = parseInt(m.scoreA);
      const sB = parseInt(m.scoreB);
      if (sA > sB) ptsA += 3;
      else if (sA < sB) ptsB += 3;
      else {
        ptsA += 1;
        ptsB += 1;
      }
    } else {
      isComplete = false;
    }
  });

  return { ptsA, ptsB, isComplete };
}

// Tab Switching
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetView = tab.getAttribute('data-view');
      switchView(targetView);
      
      // Update active nav-tab styling
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Day buttons navigation inside Fixture View
  const dayBtns = document.querySelectorAll('.day-btn');
  dayBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetDay = btn.getAttribute('data-day');
      
      // Update active day-btn styling
      dayBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Toggle display of day sections
      const dayContents = document.querySelectorAll('.day-content');
      dayContents.forEach(content => content.classList.remove('active'));
      document.getElementById(`day-${targetDay}`).classList.add('active');
    });
  });
}

function switchView(viewId) {
  const views = document.querySelectorAll('.view');
  views.forEach(v => v.classList.remove('active'));
  document.getElementById(viewId).classList.add('active');
}

// UPDATE ALL VISUALS
function updateUI() {
  const isAdmin = getIsAdmin();

  // Show/Hide locked vs unlocked draw config panel
  const configLocked = document.getElementById('draw-config-card-locked');
  const configUnlocked = document.getElementById('draw-config-card');
  const syncCard = document.getElementById('admin-sync-card');
  if (configLocked && configUnlocked) {
    if (isAdmin) {
      configLocked.style.display = 'none';
      configUnlocked.style.display = 'block';
      if (syncCard) syncCard.style.display = 'block';
    } else {
      configLocked.style.display = 'block';
      configUnlocked.style.display = 'none';
      if (syncCard) syncCard.style.display = 'none';
    }
  }

  renderHeaderActions();
  renderStandings();
  renderFixtures();
  renderPairs();
  updateRecoveryStats();
  renderPlayoffs();
}

// RENDER STANDINGS
function renderStandings() {
  const tbody = document.getElementById('standings-body');
  if (!state.active) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-placeholder">
          <i class="icon-trophy"></i>
          <p>El torneo aún no ha comenzado.</p>
          <span style="font-size: 0.8rem; color: var(--text-secondary);">Realiza el sorteo de parejas en la pestaña Sorteo / Admin.</span>
        </td>
      </tr>
    `;
    return;
  }

  const standings = calculateStandings();
  let html = '';

  standings.forEach((team, index) => {
    const rank = index + 1;
    const isGFZone = rank <= 2;
    const rankClass = rank === 1 ? 'rank-1' : (rank === 2 ? 'rank-2' : '');
    const gd = team.gf - team.gc;
    const gdDisplay = gd > 0 ? `+${gd}` : gd;

    html += `
      <tr class="${isGFZone ? 'gf-zone' : ''} ${rankClass}">
        <td>
          <span class="rank-badge">${rank}</span>
        </td>
        <td>
          <div class="table-team">
            <span class="table-team-name">${team.name}</span>
            <span class="table-team-details">
              ${team.player1.name} (${team.player1.country}) & ${team.player2.name} (${team.player2.country})
            </span>
          </div>
        </td>
        <td style="text-align: center;">${team.pj}</td>
        <td style="text-align: center;">${team.pg}</td>
        <td style="text-align: center;">${team.pe}</td>
        <td style="text-align: center;">${team.pp}</td>
        <td style="text-align: center;">${team.gf}</td>
        <td style="text-align: center;">${team.gc}</td>
        <td style="text-align: center;" class="highlight-points">${team.points}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// RENDER DRAW RESULT (Sorteo / Admin screen)
function renderPairs() {
  const container = document.getElementById('pairs-container');
  const resultsCard = document.getElementById('draw-results-card');

  if (!state.active || state.teams.length === 0) {
    resultsCard.style.display = 'none';
    return;
  }

  resultsCard.style.display = 'block';
  let html = '';

  state.teams.forEach(team => {
    html += `
      <div class="pair-card">
        <div class="pair-header">
          <span class="pair-title">${team.name}</span>
          <span style="font-size: 0.75rem; color: var(--accent-green); font-weight: 700; text-transform: uppercase;">Activo</span>
        </div>
        <div class="pair-members">
          <div class="member">
            <span class="member-name">${team.player1.name} <span class="pot-badge pot-badge-a">A</span></span>
            <span class="member-country">${team.player1.country}</span>
          </div>
          <div class="member">
            <span class="member-name">${team.player2.name} <span class="pot-badge pot-badge-b">B</span></span>
            <span class="member-country">${team.player2.country}</span>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// RENDER FIXTURES (Lunes, Martes, Jueves)
function renderFixtures() {
  const days = ['lunes', 'martes', 'jueves'];
  
  days.forEach(dayId => {
    const daySection = document.getElementById(`day-${dayId}`);
    if (!state.active) {
      daySection.innerHTML = `
        <div class="empty-placeholder">
          <i class="icon-calendar"></i>
          <p>No hay jornadas disponibles.</p>
          <span>Realiza el sorteo primero en la pestaña Sorteo / Admin.</span>
        </div>
      `;
      return;
    }

    const dayFixture = state.fixtures.find(j => j.id === dayId);
    if (!dayFixture) return;

    let html = '';

    dayFixture.series.forEach(series => {
      const teamA = state.teams.find(t => t.id === series.teamA_id);
      const teamB = state.teams.find(t => t.id === series.teamB_id);
      
      const summary = getSeriesSummary(series);
      const statusClass = summary.isComplete ? 'status-completed' : 'status-pending';
      const statusText = summary.isComplete ? 'Completado' : 'Pendiente';

      html += `
        <div class="series-accordion" data-series-id="${series.id}">
          <div class="series-header" onclick="toggleAccordion('${series.id}')">
            <div class="series-info">
              <span class="series-title">${dayFixture.name.split(' ')[0]}</span>
              <div class="series-team-display">
                <span class="team-display-name">${teamA.name}</span>
                <span class="team-display-vs">VS</span>
                <span class="team-display-name">${teamB.name}</span>
              </div>
            </div>
            <div class="series-summary">
              <span class="series-scores-summary">Series: ${summary.ptsA} - ${summary.ptsB} pts</span>
              <span class="series-status-badge ${statusClass}">${statusText}</span>
              <span class="accordion-arrow"><i class="icon-chevron"></i></span>
            </div>
          </div>
          <div class="series-details">
            <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 12px; font-weight: 500; text-transform: uppercase;">
              Detalles de los partidos (Win = 3pts, Draw = 1pt, Loss = 0pts)
            </p>
            ${renderMatchList(series.matches, dayId, series.id)}
          </div>
        </div>
      `;
    });

    daySection.innerHTML = html;
  });
}

// Generate HTML for the list of matches inside a series
function renderMatchList(matches, dayId, seriesId) {
  let html = '';
  const disabledAttr = getIsAdmin() ? '' : 'disabled';

  matches.forEach(m => {
    const valA = m.scoreA !== null ? m.scoreA : '';
    const valB = m.scoreB !== null ? m.scoreB : '';
    
    html += `
      <div class="match-item">
        <div class="match-type">${m.title}</div>
        <div class="match-party-a">${m.pA_name}</div>
        <div>
          <input type="number" min="0" placeholder="-" class="match-score-input" value="${valA}" ${disabledAttr}
                 onchange="saveScore('${dayId}', '${seriesId}', '${m.id}', 'A', this.value)">
        </div>
        <div class="match-score-separator">vs</div>
        <div>
          <input type="number" min="0" placeholder="-" class="match-score-input" value="${valB}" ${disabledAttr}
                 onchange="saveScore('${dayId}', '${seriesId}', '${m.id}', 'B', this.value)">
        </div>
        <div class="match-party-b">${m.pB_name}</div>
      </div>
    `;
  });
  return html;
}

// Toggle accordion opening
function toggleAccordion(seriesId) {
  const accordion = document.querySelector(`.series-accordion[data-series-id="${seriesId}"]`);
  if (accordion) {
    accordion.classList.toggle('open');
  }
}

// UPDATE RECOVERY STATS (Viernes)
function updateRecoveryStats() {
  const statPending = document.getElementById('stat-pending-matches');
  const statGoals = document.getElementById('stat-total-goals');
  const pendingList = document.getElementById('recovery-pending-list');

  if (!state.active) {
    if (statPending) statPending.textContent = '0';
    if (statGoals) statGoals.textContent = '0';
    if (pendingList) pendingList.innerHTML = '';
    return;
  }

  let pendingMatchesCount = 0;
  let totalGoals = 0;
  let pendingHtml = '';

  state.fixtures.forEach(j => {
    j.series.forEach(s => {
      s.matches.forEach(m => {
        if (m.scoreA === null || m.scoreB === null || m.scoreA === '' || m.scoreB === '') {
          pendingMatchesCount++;
          pendingHtml += `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; margin-bottom: 8px; font-size: 0.8rem; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="color: var(--accent-cyan);">${j.name.split(' ')[0]}</strong>: ${m.pA_name} vs ${m.pB_name}
              </div>
              <div style="font-size: 0.7rem; color: var(--accent-danger); font-weight: 700; text-transform: uppercase;">
                Pendiente
              </div>
            </div>
          `;
        } else {
          totalGoals += parseInt(m.scoreA) + parseInt(m.scoreB);
        }
      });
    });
  });

  if (statPending) statPending.textContent = pendingMatchesCount;
  if (statGoals) statGoals.textContent = totalGoals;

  if (pendingList) {
    if (pendingMatchesCount === 0) {
      pendingList.innerHTML = `
        <div style="text-align: center; color: var(--accent-green); padding: 10px; font-size: 0.9rem; font-weight: 600;">
          <i class="icon-check"></i> ¡Todos los partidos del Round Robin están al día! Listos para el fin de semana.
        </div>
      `;
    } else {
      pendingList.innerHTML = `
        <h4 style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 10px; font-weight: 700;">Partidos pendientes por disputar:</h4>
        ${pendingHtml}
      `;
    }
  }
}

// RENDER PLAYOFFS (Semifinals on Saturday, Grand Final on Sunday)
function renderPlayoffs() {
  const container = document.getElementById('day-finde');
  if (!state.active) {
    container.innerHTML = `
      <div class="empty-placeholder">
        <i class="icon-calendar"></i>
        <p>No hay jornadas disponibles.</p>
        <span>Realiza el sorteo primero en la pestaña Sorteo / Admin.</span>
      </div>
    `;
    return;
  }

  // 1. Check if Semifinals are unlocked
  if (!state.semifinals) {
    container.innerHTML = `
      <div class="card">
        <div class="recovery-container">
          <i class="icon-trophy" style="color: rgba(255,255,255,0.1); filter: none;"></i>
          <h2 class="recovery-title" style="color: var(--text-secondary);">Fase Final Bloqueada</h2>
          <p class="recovery-desc">
            Las Semifinales se disputarán el **Sábado** y la Gran Final el **Domingo**. Completa todos los 30 partidos del Round Robin (Lunes, Martes y Jueves) para desbloquear las fases finales.
          </p>
        </div>
      </div>
    `;
    return;
  }

  // 2. We have Semifinals generated. Let's render Semifinals
  const teamSF1_A = state.teams.find(t => t.id === state.semifinals.sf1.teamA_id);
  const teamSF1_B = state.teams.find(t => t.id === state.semifinals.sf1.teamB_id);
  const teamSF2_A = state.teams.find(t => t.id === state.semifinals.sf2.teamA_id);
  const teamSF2_B = state.teams.find(t => t.id === state.semifinals.sf2.teamB_id);

  const summarySF1 = getSeriesSummary(state.semifinals.sf1);
  const summarySF2 = getSeriesSummary(state.semifinals.sf2);

  const statusSF1Class = summarySF1.isComplete ? 'status-completed' : 'status-pending';
  const statusSF1Text = summarySF1.isComplete ? 'Completado' : 'Pendiente';
  const statusSF2Class = summarySF2.isComplete ? 'status-completed' : 'status-pending';
  const statusSF2Text = summarySF2.isComplete ? 'Completado' : 'Pendiente';

  let html = `
    <!-- Semifinals Block -->
    <div style="margin-bottom: 30px;">
      <h3 style="font-size: 1.1rem; color: var(--accent-cyan); text-transform: uppercase; margin-bottom: 12px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
        📅 Sábado: Semifinales (5 Partidos)
      </h3>
      
      <!-- SF 1 Accordion -->
      <div class="series-accordion" data-series-id="sf1">
        <div class="series-header" onclick="toggleAccordion('sf1')">
          <div class="series-info">
            <span class="series-title" style="color: var(--accent-cyan);">SF 1</span>
            <div class="series-team-display">
              <span class="team-display-name">${teamSF1_A.name}</span>
              <span class="team-display-vs">VS</span>
              <span class="team-display-name">${teamSF1_B.name}</span>
            </div>
          </div>
          <div class="series-summary">
            <span class="series-scores-summary">Series: ${summarySF1.ptsA} - ${summarySF1.ptsB} pts</span>
            <span class="series-status-badge ${statusSF1Class}">${statusSF1Text}</span>
            <span class="accordion-arrow"><i class="icon-chevron"></i></span>
          </div>
        </div>
        <div class="series-details">
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 12px; font-weight: 500; text-transform: uppercase;">
            Si hay empate absoluto en puntos y goles, clasifica el mejor posicionado en el Round Robin (Seed).
          </p>
          ${renderMatchList(state.semifinals.sf1.matches, 'finde', 'sf1')}
        </div>
      </div>

      <!-- SF 2 Accordion -->
      <div class="series-accordion" data-series-id="sf2">
        <div class="series-header" onclick="toggleAccordion('sf2')">
          <div class="series-info">
            <span class="series-title" style="color: var(--accent-cyan);">SF 2</span>
            <div class="series-team-display">
              <span class="team-display-name">${teamSF2_A.name}</span>
              <span class="team-display-vs">VS</span>
              <span class="team-display-name">${teamSF2_B.name}</span>
            </div>
          </div>
          <div class="series-summary">
            <span class="series-scores-summary">Series: ${summarySF2.ptsA} - ${summarySF2.ptsB} pts</span>
            <span class="series-status-badge ${statusSF2Class}">${statusSF2Text}</span>
            <span class="accordion-arrow"><i class="icon-chevron"></i></span>
          </div>
        </div>
        <div class="series-details">
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 12px; font-weight: 500; text-transform: uppercase;">
            Si hay empate absoluto en puntos y goles, clasifica el mejor posicionado en el Round Robin (Seed).
          </p>
          ${renderMatchList(state.semifinals.sf2.matches, 'finde', 'sf2')}
        </div>
      </div>
    </div>
  `;

  // 3. Render Grand Final (Domingo)
  html += `
    <div style="margin-top: 20px;">
      <h3 style="font-size: 1.1rem; color: var(--accent-gold); text-transform: uppercase; margin-bottom: 12px; font-weight: 800; display: flex; align-items: center; gap: 8px;">
        🏆 Domingo: Gran Final (5 Partidos)
      </h3>
  `;

  if (!state.grandFinal) {
    html += `
        <div class="card" style="border: 1px dashed rgba(251, 191, 36, 0.2); background: rgba(255,255,255,0.01);">
          <div style="text-align: center; padding: 24px; color: var(--text-secondary); font-size: 0.9rem;">
            <i class="icon-clock" style="font-size: 2rem; color: rgba(251, 191, 36, 0.3); display: block; margin-bottom: 8px;"></i>
            La Gran Final está bloqueada. Completa las dos Semifinales de arriba para conocer a los clasificados.
          </div>
        </div>
      </div>
    `;
    container.innerHTML = html;
    return;
  }

  // Grand Final Unlocked
  const teamGF_A = state.teams.find(t => t.id === state.grandFinal.teamA_id);
  const teamGF_B = state.teams.find(t => t.id === state.grandFinal.teamB_id);

  // Calculate GF Stats
  let ptsGF_A = 0;
  let ptsGF_B = 0;
  let gfGF_A = 0;
  let gfGF_B = 0;
  let gfMatchesPlayed = 0;

  state.grandFinal.matches.forEach(m => {
    if (m.scoreA !== null && m.scoreB !== null && m.scoreA !== '' && m.scoreB !== '') {
      gfMatchesPlayed++;
      const sA = parseInt(m.scoreA);
      const sB = parseInt(m.scoreB);
      gfGF_A += sA;
      gfGF_B += sB;

      if (sA > sB) ptsGF_A += 3;
      else if (sA < sB) ptsGF_B += 3;
      else {
        ptsGF_A += 1;
        ptsGF_B += 1;
      }
    }
  });

  const isGFComplete = gfMatchesPlayed === 5;
  let championsBannerHtml = '';

  if (isGFComplete) {
    let championName = '';
    let championPlayers = '';
    let isTied = false;

    if (ptsGF_A > ptsGF_B) {
      championName = teamGF_A.name;
      championPlayers = `${teamGF_A.player1.name} (${teamGF_A.player1.country}) & ${teamGF_A.player2.name} (${teamGF_A.player2.country})`;
    } else if (ptsGF_B > ptsGF_A) {
      championName = teamGF_B.name;
      championPlayers = `${teamGF_B.player1.name} (${teamGF_B.player1.country}) & ${teamGF_B.player2.name} (${teamGF_B.player2.country})`;
    } else {
      // Tie breakers for GF: GF Goal Difference, then GF Goals For
      const gdA = gfGF_A - gfGF_B;
      const gdB = gfGF_B - gfGF_A;
      if (gdA > gdB) {
        championName = teamGF_A.name;
        championPlayers = `${teamGF_A.player1.name} (${teamGF_A.player1.country}) & ${teamGF_A.player2.name} (${teamGF_A.player2.country})`;
      } else if (gdB > gdA) {
        championName = teamGF_B.name;
        championPlayers = `${teamGF_B.player1.name} (${teamGF_B.player1.country}) & ${teamGF_B.player2.name} (${teamGF_B.player2.country})`;
      } else {
        if (gfGF_A > gfGF_B) {
          championName = teamGF_A.name;
          championPlayers = `${teamGF_A.player1.name} (${teamGF_A.player1.country}) & ${teamGF_A.player2.name} (${teamGF_A.player2.country})`;
        } else if (gfGF_B > gfGF_A) {
          championName = teamGF_B.name;
          championPlayers = `${teamGF_B.player1.name} (${teamGF_B.player1.country}) & ${teamGF_B.player2.name} (${teamGF_B.player2.country})`;
        } else {
          // Absolute tiebreaker: Higher seed in RR standings
          const standings = calculateStandings();
          const indexA = standings.findIndex(t => t.id === teamGF_A.id);
          const indexB = standings.findIndex(t => t.id === teamGF_B.id);
          if (indexA < indexB) {
            championName = teamGF_A.name;
            championPlayers = `${teamGF_A.player1.name} (${teamGF_A.player1.country}) & ${teamGF_A.player2.name} (${teamGF_A.player2.country})`;
          } else {
            championName = teamGF_B.name;
            championPlayers = `${teamGF_B.player1.name} (${teamGF_B.player1.country}) & ${teamGF_B.player2.name} (${teamGF_B.player2.country})`;
          }
        }
      }
    }

    championsBannerHtml = `
      <div class="champions-banner">
        <h3>🏆 ¡CAMPEONES DE LA WORLD CUP! 🏆</h3>
        <h2 style="color: var(--text-primary); font-size: 1.8rem; font-weight: 800; margin: 10px 0;">${championName}</h2>
        <p>${championPlayers}</p>
      </div>
    `;
  }

  html += `
      <div class="gf-card">
        <div class="gf-trophy-overlay">🏆</div>
        <h2 class="gf-header-title">🔥 LA GRAN FINAL 🔥</h2>
        
        <div class="gf-teams-vs">
          <div class="gf-team-panel ${isGFComplete && ptsGF_A >= ptsGF_B ? 'winner' : ''}">
            <div style="font-size: 0.7rem; color: var(--accent-cyan); font-weight: 700; text-transform: uppercase;">Ganador SF 1</div>
            <div class="gf-team-pname">${teamGF_A.name}</div>
            <div class="gf-team-psub">${teamGF_A.player1.name} (${teamGF_A.player1.country})</div>
            <div class="gf-team-psub">${teamGF_A.player2.name} (${teamGF_A.player2.country})</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: var(--accent-gold); margin-top: 8px;">${ptsGF_A} pts</div>
          </div>
          
          <div style="font-size: 1.2rem; font-weight: 800; color: var(--text-secondary);">VS</div>
          
          <div class="gf-team-panel ${isGFComplete && ptsGF_B >= ptsGF_A ? 'winner' : ''}">
            <div style="font-size: 0.7rem; color: #c084fc; font-weight: 700; text-transform: uppercase;">Ganador SF 2</div>
            <div class="gf-team-pname">${teamGF_B.name}</div>
            <div class="gf-team-psub">${teamGF_B.player1.name} (${teamGF_B.player1.country})</div>
            <div class="gf-team-psub">${teamGF_B.player2.name} (${teamGF_B.player2.country})</div>
            <div style="font-size: 1.25rem; font-weight: 800; color: var(--accent-gold); margin-top: 8px;">${ptsGF_B} pts</div>
          </div>
        </div>

        <div class="gf-match-list">
          <p style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 12px; font-weight: 700; text-transform: uppercase; text-align: center;">
            Juegos de la Serie Final (Win = 3pts, Draw = 1pt, Loss = 0pts)
          </p>
          ${renderMatchList(state.grandFinal.matches, 'finde', 'grand-final')}
        </div>

        ${championsBannerHtml}
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// ADMIN AUTHENTICATION FUNCTIONS
function getIsAdmin() {
  return sessionStorage.getItem('finanzas_is_admin') === 'true' || sessionStorage.getItem('efootball_is_admin') === 'true';
}

function openAdminModal() {
  document.getElementById('admin-modal').style.display = 'flex';
  document.getElementById('admin-passcode').focus();
  document.getElementById('login-error-msg').style.display = 'none';
}

function closeAdminModal() {
  document.getElementById('admin-modal').style.display = 'none';
  document.getElementById('admin-passcode').value = '';
}

function loginAdmin() {
  const passField = document.getElementById('admin-passcode');
  const errorMsg = document.getElementById('login-error-msg');
  if (passField.value === 'admin777') {
    sessionStorage.setItem('finanzas_is_admin', 'true');
    closeAdminModal();
    updateUI();
  } else {
    errorMsg.style.display = 'block';
    passField.value = '';
    passField.focus();
  }
}

function logoutAdmin() {
  sessionStorage.removeItem('finanzas_is_admin');
  sessionStorage.removeItem('efootball_is_admin');
  updateUI();
}

// SAVE TOURNAMENT STATE TO CLOUDFLARE KV
async function saveStateToCloud() {
  if (!getIsAdmin()) return;
  
  // Save locally first
  saveState();
  
  const stateStr = JSON.stringify(state);
  
  try {
    const res = await fetch('./api/state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'admin777' // Backend API admin validation
      },
      body: stateStr
    });
    if (res.ok) {
      alert("¡Resultados y datos del torneo guardados con éxito en la nube!");
    } else {
      alert("Fallo al guardar en la nube: " + res.statusText);
    }
  } catch (err) {
    console.error("Cloud Sync Error", err);
    alert("Error de red al conectar con la base de datos de Cloudflare: " + err.message);
  }
}

function renderHeaderActions() {
  const container = document.getElementById('header-actions');
  if (!container) return;

  const isAdmin = getIsAdmin();
  if (isAdmin) {
    container.innerHTML = `
      <button class="reset-btn" onclick="saveStateToCloud()" style="background: rgba(0, 255, 135, 0.1); color: var(--accent-green); border-color: rgba(0, 255, 135, 0.2);">
        <i class="icon-check"></i> Guardar Cambios
      </button>
      <button class="reset-btn" onclick="resetTournament()" style="background: rgba(244, 63, 94, 0.1); color: var(--accent-danger); border-color: rgba(244, 63, 94, 0.2);">
        <i class="icon-settings"></i> Reiniciar
      </button>
      <button class="reset-btn" onclick="logoutAdmin()" style="background: rgba(255, 255, 255, 0.05); color: var(--text-primary); border-color: var(--border-color);">
        Salir Admin
      </button>
    `;
  } else {
    container.innerHTML = `
      <button class="reset-btn" onclick="openAdminModal()" style="background: rgba(0, 210, 255, 0.1); color: var(--accent-cyan); border-color: rgba(0, 210, 255, 0.2);">
        Acceso Admin
      </button>
    `;
  }
}
