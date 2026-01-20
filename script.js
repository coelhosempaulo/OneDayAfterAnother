// --- CONFIGURAÇÃO DO SUPABASE ---
// COLE SUAS CHAVES AQUI (Settings > API no painel do Supabase)
const SUPABASE_URL = 'https://chyntmcnydprvusrdclr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoeW50bWNueWRwcnZ1c3JkY2xyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MjQxMjgsImV4cCI6MjA4NDUwMDEyOH0.HZLj-hYDHV2Ef9CG7p8mJcoHARs8dMO3M_-BJRXsH68';

// --- CORREÇÃO DO ERRO ---
// Usamos 'supabaseClient' para não conflitar com a variável global 'supabase'
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- ESTADO GLOBAL DA APLICAÇÃO ---
let habits = []; 
let dailyChecks = {}; 
let currentUser = null;

// Configuração de Datas
const now = new Date();
const currentDay = now.getDate();
const currentMonth = now.getMonth();
const currentYear = now.getFullYear();
const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Dados do mês para navegação
const monthStart = new Date(currentYear, currentMonth, 1);
const monthName = monthStart.toLocaleString('pt-BR', { month: 'long' });
const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
const totalWeeks = Math.ceil(daysInMonth / 7);
let currentWeek = Math.ceil(currentDay / 7);

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', async function() {
    // Tenta autenticar
    try {
        await checkAuth(); 
        if (currentUser) {
            await loadData(); // Baixa dados
            setupUI();        // Destrava a tela
        }
    } catch (error) {
        console.error("Erro fatal na inicialização:", error);
        alert("Erro ao conectar com o sistema. Verifique o console (F12).");
    }
});

// --- AUTENTICAÇÃO ---
async function checkAuth() {
    // ATENÇÃO: Usando supabaseClient aqui
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error) {
        console.error("Erro de sessão:", error);
        return;
    }

    if (!session) {
        window.location.href = 'login.html'; // Manda pro login se não tiver logado
        return;
    }
    
    currentUser = session.user;
    
    // Atualiza saudação
    // Atualiza saudação (COM NOME)
// Tenta pegar o nome dos metadados, se não tiver, pega o começo do email
const userName = currentUser.user_metadata.display_name || currentUser.email.split('@')[0];
const greetingElement = document.getElementById('user-greeting');

if (greetingElement) {
    // Coloca a primeira letra maiúscula pra ficar bonito (ex: pedro -> Pedro)
    const formattedName = userName.charAt(0).toUpperCase() + userName.slice(1);
    greetingElement.textContent = `Olá, ${formattedName}!`;
}

    // Configura botão de Sair
    const logoutBtn = document.getElementById('logout-link');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabaseClient.auth.signOut();
            window.location.href = 'login.html';
        });
    }
}

// --- FUNÇÕES DE DADOS (SUPABASE) ---

async function loadData() {
    // 1. Pegar Hábitos
    const { data: habitsData, error: habitsError } = await supabaseClient
        .from('habits')
        .select('*')
        .order('created_at', { ascending: true });

    if (habitsError) console.error("Erro ao carregar hábitos:", habitsError);
    habits = habitsData || [];

    // 2. Pegar Checks (Marcações)
    const { data: checksData, error: checksError } = await supabaseClient
        .from('daily_checks')
        .select('*');
        
    if (checksError) console.error("Erro ao carregar checks:", checksError);
    
    // Transformar checks em um formato fácil
    dailyChecks = {};
    if (checksData) {
        checksData.forEach(check => {
            const key = `${check.habit_id}-${check.date}`;
            dailyChecks[key] = true;
        });
    }

    updateWeekView();
    updateStatsTab();
}

// Adicionar Novo Hábito
async function addHabit() {
    const input = document.getElementById('new-habit');
    const title = input.value.trim();
    
    if (!title) return;

    // Feedback visual de carregamento
    const btn = document.getElementById('add-habit');
    const originalText = btn.textContent;
    btn.textContent = "...";
    btn.disabled = true;

    // Salva no Supabase
    const { data, error } = await supabaseClient
        .from('habits')
        .insert([{ user_id: currentUser.id, title: title }])
        .select();

    if (error) {
        alert("Erro ao criar hábito: " + error.message);
        console.error(error);
    } else {
        // Se deu certo, adiciona na lista local e atualiza a tela
        if(data && data.length > 0) {
            habits.push(data[0]); 
            input.value = '';
            updateWeekView();
            updateStatsTab();
        }
    }
    
    btn.textContent = originalText;
    btn.disabled = false;
}

// Remover Hábito
async function removeHabit(habitId) {
    if(!confirm("Tem certeza que deseja apagar este hábito?")) return;

    const { error } = await supabaseClient
        .from('habits')
        .delete()
        .eq('id', habitId);

    if (error) {
        alert("Erro ao apagar: " + error.message);
    } else {
        habits = habits.filter(h => h.id !== habitId);
        updateWeekView();
        updateStatsTab();
    }
}

// Marcar/Desmarcar Checkbox
async function toggleHabit(habitId, day) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const key = `${habitId}-${dateStr}`;
    
    const isCheckedNow = dailyChecks[key]; // Estado atual antes do clique

    // Atualização Otimista (Muda na tela antes de confirmar no banco para ser rápido)
    const checkbox = document.querySelector(`.checkbox[data-habit="${habitId}"][data-day="${day}"]`);
    if(checkbox) checkbox.classList.toggle('checked');
    
    // Atualiza estado local
    if (isCheckedNow) delete dailyChecks[key];
    else dailyChecks[key] = true;
    updateStatsTab(); // Recalcula stats visualmente

    // Envia para o Supabase em segundo plano
    if (isCheckedNow) {
        // Deletar check
        const { error } = await supabaseClient
            .from('daily_checks')
            .delete()
            .match({ habit_id: habitId, date: dateStr });
        if(error) console.error("Erro ao desmarcar:", error);
    } else {
        // Criar check
        const { error } = await supabaseClient
            .from('daily_checks')
            .insert([{ user_id: currentUser.id, habit_id: habitId, date: dateStr }]);
        if(error) console.error("Erro ao marcar:", error);
    }
}

// --- INTERFACE (UI) ---

function setupUI() {
    // Navegação Semanal
    const prevBtn = document.getElementById('prev-week');
    const nextBtn = document.getElementById('next-week');
    
    if(prevBtn) prevBtn.addEventListener('click', () => {
        if (currentWeek > 1) { currentWeek--; updateWeekView(); }
    });
    
    if(nextBtn) nextBtn.addEventListener('click', () => {
        if (currentWeek < totalWeeks) { currentWeek++; updateWeekView(); }
    });

    // Adicionar Hábito
    const addBtn = document.getElementById('add-habit');
    const inputHabit = document.getElementById('new-habit');
    
    if(addBtn) addBtn.addEventListener('click', addHabit);
    if(inputHabit) inputHabit.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addHabit();
    });

    setupTabs();
}

function updateWeekView() {
    const titleEl = document.getElementById('month-title');
    const weekEl = document.getElementById('current-week');
    
    if(titleEl) titleEl.textContent = `${monthName} ${currentYear}`;
    if(weekEl) weekEl.textContent = `Semana ${currentWeek}`;

    const startDay = (currentWeek - 1) * 7 + 1;
    const endDay = Math.min(startDay + 6, daysInMonth);
    
    // Cabeçalho dos dias
    const daysHeader = document.getElementById('days-header');
    if(daysHeader) {
        daysHeader.innerHTML = '';
        const weekDays = [];
        for (let d = startDay; d <= endDay; d++) {
            weekDays.push(d);
            const div = document.createElement('div');
            div.className = 'day-header';
            const date = new Date(currentYear, currentMonth, d);
            div.textContent = `${dayNames[date.getDay()]} ${d}`;
            daysHeader.appendChild(div);
        }
    
        // Linhas dos hábitos
        const habitsRows = document.getElementById('habits-rows');
        if(habitsRows) {
            habitsRows.innerHTML = '';
    
            habits.forEach(habit => {
                const row = document.createElement('div');
                row.className = 'habit-row';
    
                // Nome do hábito
                const habitCell = document.createElement('div');
                habitCell.className = 'habit-cell';
                habitCell.innerHTML = `
                    <span>${habit.title}</span>
                    <button class="remove-btn">×</button>
                `;
                const removeBtn = habitCell.querySelector('.remove-btn');
                if(removeBtn) removeBtn.onclick = () => removeHabit(habit.id);
                row.appendChild(habitCell);
    
                // Checkboxes
                for (let d = startDay; d <= endDay; d++) {
                    const checkboxCell = document.createElement('div');
                    checkboxCell.className = 'checkbox-cell';
                    
                    const checkbox = document.createElement('div');
                    checkbox.className = 'checkbox';
                    checkbox.dataset.day = d;
                    checkbox.dataset.habit = habit.id;
                    checkbox.textContent = '✓';
    
                    // Verifica status
                    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    if (dailyChecks[`${habit.id}-${dateStr}`]) {
                        checkbox.classList.add('checked');
                    }
    
                    // Regra: Pode editar hoje ou dias anteriores (nunca o futuro)
                    if (d <= currentDay) {
                        checkbox.onclick = () => toggleHabit(habit.id, d);
                    } else {
                        checkbox.classList.add('disabled');
                    }
    
                    checkboxCell.appendChild(checkbox);
                    row.appendChild(checkboxCell);
                }
    
                habitsRows.appendChild(row);
            });
        }
    }
}

// --- ESTATÍSTICAS E ABAS ---

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tabContent = document.getElementById(btn.dataset.tab + '-tab');
            if(tabContent) tabContent.classList.add('active');
            if (btn.dataset.tab === 'stats') updateStatsTab();
        });
    });
    
    document.querySelectorAll('.stats-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.stats-subtab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const subContent = document.getElementById(btn.dataset.subtab + '-stats');
            if(subContent) subContent.classList.add('active');
            updateStatsTab();
        });
    });
}

function updateStatsTab() {
    const activeBtn = document.querySelector('.stats-subtab.active');
    if(!activeBtn) return;
    
    const activeSubtab = activeBtn.dataset.subtab;
    if (activeSubtab === 'weekly') updateWeeklyStats();
    else updateMonthlyStats();
}

function isChecked(day, habitId) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return !!dailyChecks[`${habitId}-${dateStr}`];
}

function updateWeeklyStats() {
    const startDay = (currentWeek - 1) * 7 + 1;
    const endDay = Math.min(startDay + 6, Math.min(currentDay, daysInMonth));
    
    updateStatDOM('total-habits-weekly', habits.length);

    let totalCompletions = 0, totalPossible = 0, activeDaysCount = 0;

    for (let d = startDay; d <= endDay; d++) {
        let dayHasActivity = false;
        habits.forEach(h => {
            totalPossible++;
            if (isChecked(d, h.id)) {
                totalCompletions++;
                dayHasActivity = true;
            }
        });
        if (dayHasActivity) activeDaysCount++;
    }

    const avg = totalPossible > 0 ? ((totalCompletions / totalPossible) * 100).toFixed(0) : 0;
    updateStatDOM('avg-completion-weekly', avg + '%');
    updateStatDOM('active-days-weekly', activeDaysCount);
    
    // Streak
    let streak = 0;
    for (let d = currentDay; d >= 1; d--) {
        let allDone = true;
        if(habits.length === 0) allDone = false;
        habits.forEach(h => { if (!isChecked(d, h.id)) allDone = false; });
        if (allDone) streak++; else break;
    }
    updateStatDOM('current-streak-weekly', streak);

    renderProgressBars('weekly-progress', startDay, endDay);
    renderHabitPerformance('habit-performance-weekly', startDay, endDay);
}

function updateMonthlyStats() {
    const maxDay = Math.min(currentDay, daysInMonth);
    updateStatDOM('total-habits-monthly', habits.length);

    let totalCompletions = 0, totalPossible = 0, activeDaysCount = 0;

    for (let d = 1; d <= maxDay; d++) {
        let dayHasActivity = false;
        habits.forEach(h => {
            totalPossible++;
            if (isChecked(d, h.id)) { totalCompletions++; dayHasActivity = true; }
        });
        if (dayHasActivity) activeDaysCount++;
    }

    const avg = totalPossible > 0 ? ((totalCompletions / totalPossible) * 100).toFixed(0) : 0;
    updateStatDOM('avg-completion-monthly', avg + '%');
    updateStatDOM('active-days-monthly', activeDaysCount);
    
    let streak = 0;
    for (let d = currentDay; d >= 1; d--) {
        let allDone = true;
        if(habits.length === 0) allDone = false;
        habits.forEach(h => { if (!isChecked(d, h.id)) allDone = false; });
        if (allDone) streak++; else break;
    }
    updateStatDOM('current-streak-monthly', streak);

    renderProgressBars('monthly-progress', 1, maxDay);
    renderHabitPerformance('habit-performance-monthly', 1, maxDay);
}

function updateStatDOM(id, value) {
    const el = document.getElementById(id);
    if(el) el.textContent = value;
}

function renderProgressBars(elementId, startDay, endDay) {
    const container = document.getElementById(elementId);
    if(!container) return;
    container.innerHTML = '';
    
    for (let d = startDay; d <= endDay; d++) {
        let completed = 0;
        habits.forEach(h => { if (isChecked(d, h.id)) completed++; });
        const pct = habits.length > 0 ? ((completed / habits.length) * 100).toFixed(0) : 0;
        
        const date = new Date(currentYear, currentMonth, d);
        const dayName = dayNames[date.getDay()];

        container.innerHTML += `
            <div style="margin-bottom: 8px;">
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:2px;">
                    <span>${dayName} ${d}</span>
                    <span>${pct}%</span>
                </div>
                <div class="progress-bar"><div class="progress-fill" style="width: ${pct}%"></div></div>
            </div>`;
    }
}

function renderHabitPerformance(elementId, startDay, endDay) {
    const container = document.getElementById(elementId);
    if(!container) return;
    container.innerHTML = '';
    
    habits.forEach(h => {
        let completed = 0;
        let total = 0;
        for (let d = startDay; d <= endDay; d++) {
            total++;
            if (isChecked(d, h.id)) completed++;
        }
        const pct = total > 0 ? ((completed / total) * 100).toFixed(0) : 0;

        container.innerHTML += `
            <div class="habit-stat">
                <span class="habit-name">${h.title}</span>
                <span class="habit-percentage">${pct}%</span>
                <div class="habit-bar"><div class="habit-bar-fill" style="width: ${pct}%"></div></div>
            </div>`;
    });
}