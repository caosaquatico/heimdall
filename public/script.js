let cards = [];
const container = document.getElementById('cards-container');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalName = document.getElementById('modal-name');
const modalLink = document.getElementById('modal-link');
const modalIcon = document.getElementById('modal-icon');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');

const editModeBtn = document.getElementById('edit-mode-btn');
const addBtn = document.getElementById('add-link-btn');
const clock = document.getElementById('clock');

let editMode = false;
let editIndex = null;

// Função para carregar links do servidor
async function loadLinks() {
  const res = await fetch('/api/links');
  cards = await res.json();
  renderCards();
}

// Detecta se é URL de imagem ou SVG
function isImage(url) {
  return (url.startsWith('http://') || url.startsWith('https://')) && 
         (url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.jpeg') || url.endsWith('.gif') || url.endsWith('.svg'));
}

// Renderiza os cards
function renderCards() {
  container.innerHTML = '';
  cards.forEach((card, index) => {
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
      window.open(card.link, '_blank');
    }

    const editBtnCard = div.querySelector('.edit-btn');
    editBtnCard.style.display = editMode ? 'block' : 'none';
    editBtnCard.onclick = () => openModal(index);

    container.appendChild(div);
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
  } else {
    modalTitle.textContent = 'Adicionar Link';
    modalName.value = '';
    modalLink.value = '';
    modalIcon.value = '';
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
  const icone = modalIcon.value.trim() || '🔗';

  if(nome && link){
    if(editIndex !== null) {
      cards[editIndex] = { nome, icone, link };
    } else {
      cards.push({ nome, icone, link });
    }

    renderCards();
    closeModal();

    // Salva no servidor
    await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(cards)
    });
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
