const state = {
  active: false,
  processing: false,
  sales: 0,
  observer: null
};

let menuBtn = null;
let floatingWindow = null;

function injectMenuButton() {
  if (document.getElementById('bh-float-btn')) return;

  const btn = document.createElement('div');
  btn.id = 'bh-float-btn';
  btn.style.cssText = `
    position: fixed; bottom: 20px; right: 20px;
    width: 48px; height: 48px; background: #1e1330;
    border: 2px solid #ffd70066; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    transition: transform 0.2s;
  `;

  const imgUrl = chrome.runtime.getURL('icon128.png');
  btn.innerHTML = `<img src="${imgUrl}" width="24" height="24">`;

  btn.addEventListener('click', toggleWindow);
  btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.1)');
  btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');

  document.body.appendChild(btn);
}

/* ================== JANELA FLUTUANTE ================== */
function createFloatingWindow() {
  if (document.getElementById('bh-window')) return;

  const win = document.createElement('div');
  win.id = 'bh-window';
  win.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(0.95);
    width: 360px; max-width: 90vw; background: #1e1330; border: 1px solid #ffd70033;
    border-radius: 16px; padding: 20px; z-index: 999999; color: #fff;
    font-family: sans-serif; opacity: 0; pointer-events: none;
    transition: opacity 0.3s, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    box-shadow: 0 20px 40px rgba(0,0,0,0.7);
  `;

  win.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <span style="font-size:18px; font-weight:bold; color:#ffd700;">⚡ Baiak Helper</span>
      <button id="bh-close" style="background:none; border:none; color:#aaa; font-size:20px; cursor:pointer;">✕</button>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <span>Venda Automática</span>
      <label style="position:relative; width:48px; height:26px; display:inline-block;">
        <input type="checkbox" id="bh-toggle" style="opacity:0; width:0; height:0;">
        <span style="position:absolute; top:0; left:0; right:0; bottom:0; background:#444;
              border-radius:26px; transition:0.3s; cursor:pointer;"></span>
        <span style="position:absolute; top:3px; left:3px; width:20px; height:20px;
              background:#fff; border-radius:50%; transition:0.3s; box-shadow:0 2px 4px rgba(0,0,0,0.3);"></span>
      </label>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
      <span>📦 Vendas realizadas:</span>
      <span id="bh-sales">0</span>
    </div>
    <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
      <span>Status:</span>
      <span id="bh-status">Inativo</span>
    </div>
    <div style="display:flex; gap:8px;">
      <button id="bh-test" style="flex:1; padding:8px; background:#ffd70022; border:1px solid #ffd70044;
            color:#ffd700; border-radius:8px; cursor:pointer;">🧪 Testar venda</button>
      <button id="bh-reset" style="padding:8px; background:#fff1; border:1px solid #fff2;
            color:#ccc; border-radius:8px; cursor:pointer;">🔄 Reset</button>
    </div>
  `;

  document.body.appendChild(win);
  floatingWindow = win;

  document.getElementById('bh-close').addEventListener('click', closeWindow);
  document.getElementById('bh-toggle').addEventListener('change', onToggle);
  document.getElementById('bh-test').addEventListener('click', () => doSell());
  document.getElementById('bh-reset').addEventListener('click', resetSales);

  chrome.storage.local.get(['bh_active', 'bh_sales'], (r) => {
    if (r.bh_active) {
      document.getElementById('bh-toggle').checked = true;
      updateToggleStyle(true);
      startAutoSell();
    }
    if (r.bh_sales) {
      state.sales = r.bh_sales;
      updateSalesDisplay();
    }
  });
}

/* ================== CONTROLE DA JANELA ================== */
function openWindow() {
  if (!floatingWindow) createFloatingWindow();
  floatingWindow.style.opacity = '1';
  floatingWindow.style.transform = 'translate(-50%, -50%) scale(1)';
  floatingWindow.style.pointerEvents = 'auto';
}

function closeWindow() {
  if (floatingWindow) {
    floatingWindow.style.opacity = '0';
    floatingWindow.style.transform = 'translate(-50%, -50%) scale(0.95)';
    floatingWindow.style.pointerEvents = 'none';
  }
}

function toggleWindow() {
  if (floatingWindow && floatingWindow.style.opacity === '1') closeWindow();
  else openWindow();
}

/* ================== TOGGLE ================== */
function onToggle(e) {
  if (e.target.checked) startAutoSell();
  else stopAutoSell();
}

function updateToggleStyle(active) {
  const toggle = document.querySelector('#bh-toggle');
  if (!toggle) return;
  const bg = toggle.nextElementSibling;
  const knob = bg.nextElementSibling;
  bg.style.background = active ? 'linear-gradient(45deg, #ffd700, #ff8c00)' : '#444';
  knob.style.transform = active ? 'translateX(22px)' : 'translateX(0)';
}

/* ================== AUTOMAÇÃO INTELIGENTE ================== */
function startAutoSell() {
  if (state.active) return;
  state.active = true;
  chrome.storage.local.set({ bh_active: true });
  updateToggleStyle(true);
  updateDot(true);
  updateStatusText('Monitorando...');

  if (state.observer) state.observer.disconnect();

  const sellBtn = document.querySelector('#sell-all');
  if (!sellBtn) {
    console.error('[Helper] Botão #sell-all não encontrado para monitorar.');
    return;
  }

  state.observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'disabled') {
        if (!sellBtn.disabled && state.active && !state.processing) {
          console.log('[Helper] Botão #sell-all habilitado, vendendo...');
          doSell();
        }
      }
    }
  });

  state.observer.observe(sellBtn, { attributes: true, attributeFilter: ['disabled'] });

  if (!sellBtn.disabled && !state.processing) {
    console.log('[Helper] Botão já está habilitado, vendendo imediatamente.');
    doSell();
  }
}

function stopAutoSell() {
  state.active = false;
  state.processing = false;
  if (state.observer) {
    state.observer.disconnect();
    state.observer = null;
  }
  chrome.storage.local.set({ bh_active: false });
  updateToggleStyle(false);
  updateDot(false);
  updateStatusText('Inativo');
}

function resetSales() {
  state.sales = 0;
  chrome.storage.local.set({ bh_sales: 0 });
  updateSalesDisplay();
}

/* ================== EXECUÇÃO DA VENDA ================== */
async function doSell() {
  if (state.processing) return;
  state.processing = true;
  updateStatusText('Vendendo...');
  console.log('[Helper] Iniciando venda...');

  const sellBtn = document.querySelector('#sell-all');
  if (!sellBtn) {
    console.error('[Helper] #sell-all não encontrado.');
    state.processing = false;
    updateStatusText('Erro');
    return;
  }

  if (sellBtn.disabled) {
    console.log('[Helper] Botão ainda desabilitado, aguardando...');
    state.processing = false;
    updateStatusText('Aguardando...');
    return;
  }

  sellBtn.click();
  console.log('[Helper] #sell-all clicado.');

  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500));
    let confirmBtn = document.querySelector('#confirm-yes');
    if (!confirmBtn) {
      confirmBtn = [...document.querySelectorAll('button')].find(btn =>
        btn.textContent.includes('Vender tudo') || 
        btn.textContent.includes('Confirmar') ||
        btn.textContent.includes('Sim')
      );
    }
    if (confirmBtn) {
      console.log('[Helper] Confirmando venda...');
      confirmBtn.click();
      state.sales++;
      chrome.storage.local.set({ bh_sales: state.sales });
      updateSalesDisplay();
      state.processing = false;
      updateStatusText('Monitorando...');
      updateDot(true);
      return;
    }
  }
  console.error('[Helper] Confirmação não encontrada.');
  state.processing = false;
  updateStatusText('Falha na confirmação');
}

/* ================== UI ================== */
function updateSalesDisplay() {
  const el = document.getElementById('bh-sales');
  if (el) el.textContent = state.sales;
}

function updateStatusText(text) {
  const el = document.getElementById('bh-status');
  if (el) el.textContent = text;
}

function updateDot(active) {
  const dot = document.getElementById('bh-dot');
  if (!dot) return;
  dot.style.background = active ? '#4ade80' : '#666';
  dot.style.boxShadow = active ? '0 0 8px #4ade80' : 'none';
}

/* ================== INICIALIZAÇÃO (com retry específico) ================== */
function init() {
  // Tenta injetar imediatamente
  injectMenuButton();

  // Se não conseguiu, observa o DOM até a barra aparecer
  if (!document.getElementById('bh-menu-btn')) {
    const observer = new MutationObserver(() => {
      if (document.querySelector('.tabs.bar-sys') && !document.getElementById('bh-menu-btn')) {
        injectMenuButton();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Cria a janela sempre
  createFloatingWindow();
}

if (document.readyState === 'complete') {
  init();
} else {
  window.addEventListener('load', init);
}