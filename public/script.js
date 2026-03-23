let cards = [];
const container = document.getElementById('cards-container');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalName = document.getElementById('modal-name');
const modalLink = document.getElementById('modal-link');
const modalIcon = document.getElementById('modal-icon');
const modalCategory = document.getElementById('modal-category');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');

const editModeBtn = document.getElementById('edit-mode-btn');
const adultToggleBtn = document.getElementById('adult-toggle-btn');
const addBtn = document.getElementById('add-link-btn');
const clock = document.getElementById('clock');

const calendarTitle = document.getElementById('calendar-title');
const calendarGrid = document.getElementById('calendar-grid');
const calPrevBtn = document.getElementById('cal-prev');
const calNextBtn = document.getElementById('cal-next');
const agendaDate = document.getElementById('agenda-date');
const agendaList = document.getElementById('agenda-list');
const agendaText = document.getElementById('agenda-text');
const agendaAdd = document.getElementById('agenda-add');
const notesText = document.getElementById('notes-text');
const notesStatus = document.getElementById('notes-status');

let editMode = false;
let editIndex = null;
let dragIndex = null;
let isDragging = false;
let adultUnlocked = false;
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let selectedDate = '';
let agendaDates = new Set();

function normalizeLink(link) {
  if (link.startsWith(':')) {
    return `${location.protocol}//${location.hostname}${link}`;
  }
  if (link.startsWith('//')) {
    return `${location.protocol}${link}`;
  }
  return link;
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateLabel(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

// Função para carregar links do servidor
async function loadLinks() {
  const res = await fetch('/api/links');
  cards = await res.json();
  renderCards();
  cacheMissingIcons();
}

async function loadAdultStatus() {
  const res = await fetch('/api/adult/status');
  const data = await res.json();
  adultUnlocked = !!data.unlocked;
  adultToggleBtn.classList.toggle('active', adultUnlocked);
  renderCards();
}

async function saveCards() {
  await fetch('/api/links', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(cards)
  });
}

function renderCalendar() {
  const first = new Date(viewYear, viewMonth, 1);
  const firstDay = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  const monthLabel = first.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  calendarTitle.textContent = monthLabel;
  calendarGrid.innerHTML = '';

  for (let i = 0; i < 42; i++) {
    const dayNum = i - firstDay + 1;
    let date;
    let isOther = false;

    if (dayNum <= 0) {
      date = new Date(viewYear, viewMonth - 1, prevMonthDays + dayNum);
      isOther = true;
    } else if (dayNum > daysInMonth) {
      date = new Date(viewYear, viewMonth + 1, dayNum - daysInMonth);
      isOther = true;
    } else {
      date = new Date(viewYear, viewMonth, dayNum);
    }

    const iso = toISODate(date);
    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    if (isOther) cell.classList.add('other-month');
    if (iso === toISODate(new Date())) cell.classList.add('today');
    if (iso === selectedDate) cell.classList.add('selected');
    if (agendaDates.has(iso)) cell.classList.add('has-event');
    cell.textContent = String(date.getDate());
    cell.onclick = () => {
      selectedDate = iso;
      if (isOther) {
        viewYear = date.getFullYear();
        viewMonth = date.getMonth();
      }
      renderCalendar();
      loadAgenda();
    };

    calendarGrid.appendChild(cell);
  }
}

async function loadAgendaDates() {
  const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
  const res = await fetch(`/api/events/dates?month=${encodeURIComponent(month)}`);
  const dates = await res.json();
  agendaDates = new Set(dates);
  renderCalendar();
}

async function loadAgenda() {
  if (!selectedDate) return;
  agendaDate.textContent = formatDateLabel(selectedDate);
  const res = await fetch(`/api/events?date=${encodeURIComponent(selectedDate)}`);
  const items = await res.json();
  agendaList.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'agenda-item';
    row.innerHTML = `
      <span>${item.text}</span>
      <button class="agenda-remove" title="Remover">✖</button>
    `;
    const removeBtn = row.querySelector('.agenda-remove');
  removeBtn.onclick = async () => {
    await fetch(`/api/events/${item.id}`, { method: 'DELETE' });
    await loadAgendaDates();
    loadAgenda();
  };
    agendaList.appendChild(row);
  });
}

async function addAgendaItem() {
  const text = agendaText.value.trim();
  if (!text || !selectedDate) return;
  await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ date: selectedDate, text })
  });
  agendaText.value = '';
  await loadAgendaDates();
  loadAgenda();
}

async function loadNotes() {
  const res = await fetch('/api/notes');
  const data = await res.json();
  notesText.value = data.content || '';
}

async function saveNotes() {
  const content = notesText.value;
  const res = await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ content })
  });
  if (res.ok) {
    notesStatus.textContent = 'Salvo';
    setTimeout(() => { notesStatus.textContent = ''; }, 1200);
  }
}

// Detecta se é URL/caminho de imagem
function isImage(value) {
  if (!value || typeof value !== 'string') return false;
  if (value.startsWith('data:image/')) return true;
  if (value.startsWith('/cache/')) return true;
  if (value.startsWith('http://') || value.startsWith('https://')) return true;
  return /\.(png|jpe?g|gif|svg|webp)(\?.*)?$/i.test(value);
}

function isRemoteUrl(value) {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
}

async function cacheIcon(url) {
  try {
    const res = await fetch('/api/icons/cache', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ url })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.path || null;
  } catch (err) {
    return null;
  }
}

// Renderiza os cards
function renderCards() {
  container.innerHTML = '';

  const sections = [
    { key: 'site', title: 'Sites 🌐' },
    { key: 'local', title: 'Apps locais 🏠' },
    { key: 'adult', title: '+18 🔞' }
  ];

  sections.forEach(section => {
    const sectionCards = cards
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => (card.categoria || 'site') === section.key)
      .filter(({ card }) => !(section.key === 'adult' && !adultUnlocked));

    if (sectionCards.length === 0) return;

    const sectionEl = document.createElement('div');
    sectionEl.className = 'section';

    const titleEl = document.createElement('div');
    titleEl.className = 'section-title';
    titleEl.textContent = section.title;

    const cardsEl = document.createElement('div');
    cardsEl.className = 'section-cards';

    sectionEl.appendChild(titleEl);
    sectionEl.appendChild(cardsEl);
    container.appendChild(sectionEl);

    sectionCards.forEach(({ card, index }) => {
      const div = document.createElement('div');
      div.className = 'card';

    let iconHTML = '';
    if(isImage(card.icone)) {
      iconHTML = `<img src="${card.icone}" alt="${card.nome}" style="width:40px;height:40px;margin-bottom:10px;">`;
    } else {
      iconHTML = `<i>${card.icone}</i>`;
    }

      div.innerHTML = `
        ${iconHTML}
        <span>${card.nome}</span>
        <button class="edit-btn" title="Editar">✏️</button>
      `;

      div.onclick = e => {
        if(e.target.classList.contains('edit-btn')) return;
        if (isDragging) return;
        window.open(normalizeLink(card.link), '_blank');
      }

      const editBtnCard = div.querySelector('.edit-btn');
      editBtnCard.style.display = editMode ? 'block' : 'none';
      editBtnCard.onclick = () => openModal(index);

      if (editMode) {
        div.draggable = true;
        div.ondragstart = e => {
          dragIndex = index;
          isDragging = true;
          div.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(index));
        };
        div.ondragover = e => {
          e.preventDefault();
          if (dragIndex === index) return;
          div.classList.add('drag-over');
        };
        div.ondragleave = () => div.classList.remove('drag-over');
        div.ondrop = e => {
          e.preventDefault();
          div.classList.remove('drag-over');
          const from = dragIndex;
          const to = index;
          if (from === null || from === to) return;
          const [moved] = cards.splice(from, 1);
          const insertAt = from < to ? to - 1 : to;
          cards.splice(insertAt, 0, moved);
          dragIndex = null;
          renderCards();
          saveCards();
        };
        div.ondragend = () => {
          isDragging = false;
          dragIndex = null;
          div.classList.remove('dragging');
          div.classList.remove('drag-over');
        };
      } else {
        div.draggable = false;
        div.ondragstart = null;
        div.ondragover = null;
        div.ondragleave = null;
        div.ondrop = null;
        div.ondragend = null;
        div.classList.remove('dragging', 'drag-over');
      }

      cardsEl.appendChild(div);
    });
  });
}

// Abrir modal
function openModal(index = null) {
  editIndex = index;
  modal.style.display = 'flex';

  if(index !== null){
    modalTitle.textContent = 'Editar Link';
    modalName.value = cards[index].nome;
    modalLink.value = cards[index].link;
    modalIcon.value = cards[index].icone;
    modalCategory.value = cards[index].categoria || 'site';
  } else {
    modalTitle.textContent = 'Adicionar Link';
    modalName.value = '';
    modalLink.value = '';
    modalIcon.value = '';
    modalCategory.value = 'site';
  }
}

// Fechar modal
function closeModal() {
  modal.style.display = 'none';
}

// Salvar link
saveBtn.onclick = async () => {
  const nome = modalName.value.trim();
  const link = modalLink.value.trim();
  let icone = modalIcon.value.trim() || '🔗';
  const categoria = (modalCategory && modalCategory.value) ? modalCategory.value : 'site';

  if(nome && link){
    if (isRemoteUrl(icone)) {
      const cached = await cacheIcon(icone);
      if (cached) icone = cached;
    }
    if(editIndex !== null) {
      cards[editIndex] = { nome, icone, link, categoria };
    } else {
      cards.push({ nome, icone, link, categoria });
    }

    renderCards();
    closeModal();

    // Salva no servidor
    await saveCards();
  }
}

// Botão cancelar
cancelBtn.onclick = closeModal;

// Botão adicionar
addBtn.onclick = () => openModal();

// Botão modo edição
editModeBtn.onclick = () => {
  editMode = !editMode;
  editModeBtn.classList.toggle('active', editMode);
  renderCards();
}

adultToggleBtn.onclick = () => {
  if (adultUnlocked) {
    fetch('/api/adult/lock', { method: 'POST' }).then(() => {
      adultUnlocked = false;
      adultToggleBtn.classList.toggle('active', adultUnlocked);
      renderCards();
    });
    return;
  }
  const pass = prompt('Senha para liberar +18:');
  if (pass === null) return;
  fetch('/api/adult/unlock', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ password: pass })
  }).then(res => {
    if (!res.ok) {
      alert('Senha incorreta.');
      return;
    }
    adultUnlocked = true;
    adultToggleBtn.classList.toggle('active', adultUnlocked);
    renderCards();
  });
}

calPrevBtn.onclick = () => {
  viewMonth -= 1;
  if (viewMonth < 0) {
    viewMonth = 11;
    viewYear -= 1;
  }
  loadAgendaDates();
}

calNextBtn.onclick = () => {
  viewMonth += 1;
  if (viewMonth > 11) {
    viewMonth = 0;
    viewYear += 1;
  }
  loadAgendaDates();
}

agendaAdd.onclick = addAgendaItem;
agendaText.addEventListener('keydown', e => {
  if (e.key === 'Enter') addAgendaItem();
});

let notesSaveTimer = null;
notesText.addEventListener('input', () => {
  notesStatus.textContent = 'Salvando...';
  if (notesSaveTimer) clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(saveNotes, 800);
});
notesText.addEventListener('blur', () => {
  if (notesSaveTimer) clearTimeout(notesSaveTimer);
  saveNotes();
});

async function cacheMissingIcons() {
  if (!Array.isArray(cards) || cards.length === 0) return;
  let changed = false;
  for (const card of cards) {
    if (!card || !isRemoteUrl(card.icone)) continue;
    const cached = await cacheIcon(card.icone);
    if (cached && cached !== card.icone) {
      card.icone = cached;
      changed = true;
    }
  }
  if (changed) {
    renderCards();
    saveCards();
  }
}

// Relógio
function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2,'0');
  const minutes = String(now.getMinutes()).padStart(2,'0');
  const seconds = String(now.getSeconds()).padStart(2,'0');
  if(clock) clock.textContent = `${hours}:${minutes}:${seconds}`;
}
setInterval(updateClock, 1000);
updateClock();

// Inicializa
loadLinks();
loadAdultStatus();
selectedDate = toISODate(new Date());
renderCalendar();
loadAgendaDates();
loadAgenda();
loadNotes();
