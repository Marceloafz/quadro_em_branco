(function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const statusDot = document.getElementById('status-dot');
  const statusTxt = document.getElementById('status-txt');
  const espSlider = document.getElementById('espessura-slider');
  const espPreview = document.getElementById('espessura-preview');
  const btnLimpar = document.getElementById('btn-limpar');
  const corCustom = document.getElementById('cor-custom');

  let corAtual = '#1a1a1a';
  let espessuraAtual = 4;
  let desenhando = false;
  let px = 0, py = 0;

  function iniciarCanvas() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    configurarCtx();
  }

  function configurarCtx() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const url = canvas.toDataURL();
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      configurarCtx();
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = url;
    }, 80);
  });

  iniciarCanvas();

  function getCoordenadas(e) {
    const r = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length) {
      return {
        x: e.touches[0].clientX - r.left,
        y: e.touches[0].clientY - r.top,
      };
    }
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function renderizarSegmento(x0, y0, x1, y1, cor, espessura) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = cor;
    ctx.lineWidth = espessura;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function aoIniciar(e) {
    e.preventDefault();
    desenhando = true;
    const p = getCoordenadas(e);
    px = p.x;
    py = p.y;
    renderizarSegmento(px, py, px + 0.1, py, corAtual, espessuraAtual);
    window.wb?.enviarTraco(px, py, px + 0.1, py, corAtual, espessuraAtual);
  }

  function aoMover(e) {
    e.preventDefault();
    if (!desenhando) return;
    const p = getCoordenadas(e);
    renderizarSegmento(px, py, p.x, p.y, corAtual, espessuraAtual);
    window.wb?.enviarTraco(px, py, p.x, p.y, corAtual, espessuraAtual);
    px = p.x;
    py = p.y;
  }

  function aoTerminar() {
    desenhando = false;
  }

  canvas.addEventListener('mousedown', aoIniciar);
  canvas.addEventListener('mousemove', aoMover);
  canvas.addEventListener('mouseup', aoTerminar);
  canvas.addEventListener('mouseleave', aoTerminar);
  canvas.addEventListener('touchstart', aoIniciar, { passive: false });
  canvas.addEventListener('touchmove', aoMover, { passive: false });
  canvas.addEventListener('touchend', aoTerminar);

  function selecionarCor(novaCor) {
    corAtual = novaCor;
    document.querySelectorAll('.swatch').forEach((s) => {
      s.classList.toggle('selecionado', s.dataset.cor === novaCor);
    });
    atualizarPreview();
  }

  document.querySelectorAll('.swatch').forEach((s) => {
    s.addEventListener('click', () => selecionarCor(s.dataset.cor));
  });

  corCustom.addEventListener('input', () => {
    document.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selecionado'));
    corAtual = corCustom.value;
    atualizarPreview();
  });

  function atualizarPreview() {
    const val = parseInt(espSlider.value);
    espessuraAtual = val;
    const display = Math.max(4, Math.min(val * 1.5, 36));
    espPreview.style.width = display + 'px';
    espPreview.style.height = display + 'px';
    espPreview.style.background = corAtual === '#ffffff' ? '#d1d5db' : corAtual;
  }

  espSlider.addEventListener('input', atualizarPreview);

  btnLimpar.addEventListener('click', () => {
    if (window.wb) {
      window.wb.enviarLimpar();
    } else {
      limparCanvas();
    }
  });

  function setStatus(estado, texto) {
    statusDot.className = 'status-dot ' + estado;
    statusTxt.textContent = texto;
  }

  document.addEventListener('socket:conectado', (e) => {
    const id = String(e.detail).slice(0, 6);
    setStatus('online', `conectado · ${id}`);
  });

  document.addEventListener('socket:desconectado', () => {
    setStatus('offline', 'desconectado');
  });

  window.desenharTraco = function (dados) {
    const { x0, y0, x1, y1, cor = '#1a1a1a', espessura = 4 } = dados;
    renderizarSegmento(x0, y0, x1, y1, cor, espessura);
  };

  window.limparCanvas = function () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  window.removerCursor = function (id) {
    console.log('[canvas] cursor removido:', id);
  };

  selecionarCor('#1a1a1a');
})();