(function () {
  const LETTERS = ['א', 'ב', 'ג', 'ד'];

  function formatScore(num) {
    const n = Number(num) || 0;
    if (Number.isInteger(n)) return String(n);
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function applyQuizBranding(settings) {
    if (!settings) return;

    const bgLayer = document.getElementById('quiz-bg-layer');
    if (bgLayer) {
      if (settings.backgroundImage) {
        const safeUrl = encodeURI(settings.backgroundImage);
        bgLayer.style.backgroundImage = `url("${safeUrl}")`;
      } else {
        bgLayer.style.backgroundImage = '';
      }
    }

    const opacity =
      typeof settings.bgOverlayOpacity === 'number' ? settings.bgOverlayOpacity : 0.68;
    document.documentElement.style.setProperty('--bg-overlay-opacity', String(opacity));

    const headerImg = document.getElementById('brand-header-img');
    if (headerImg) {
      if (settings.headerImage) {
        headerImg.src = settings.headerImage;
        headerImg.hidden = false;
      } else {
        headerImg.removeAttribute('src');
        headerImg.hidden = true;
      }
    }

    const titleEl = document.getElementById('brand-title');
    if (titleEl) {
      const titleText = (settings.title ?? '').trim();
      titleEl.textContent = titleText;
      titleEl.hidden = !titleText && Boolean(settings.headerImage);
      if (titleText) {
        document.title = `${titleText} | טריוויה`;
      }
    }

    const subtitleEl = document.getElementById('brand-subtitle');
    if (subtitleEl) {
      const subText = (settings.subtitle ?? '').trim();
      subtitleEl.textContent = subText;
      subtitleEl.hidden = !subText;
    }
  }

  // Fallback for browsers without CSS :has() support
  function syncHasImageFallback(container) {
    if (!container) return;
    if (!CSS.supports('selector(:has(*))')) {
      const hasImg = Boolean(container.querySelector('.question-img'));
      container.classList.toggle('has-image', hasImg);
    }
  }

  // Light-dismiss fallback for <dialog closedby="any"> where closedBy isn't natively supported
  function initDialogs() {
    for (const dialog of document.querySelectorAll('dialog')) {
      dialog.addEventListener('close', () => {
        dialog.returnValue = '';
      });
    }

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const outside = (e, dialog) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
        let pressedOutside = false;
        dialog.addEventListener('pointerdown', (e) => {
          pressedOutside = outside(e, dialog);
        });
        dialog.addEventListener('pointerup', (e) => {
          if (pressedOutside && outside(e, dialog)) {
            dialog.close();
          }
        });
      }
    }
  }

  async function uploadImageFile(file, category) {
    if (!file) throw new Error('לא נבחר קובץ.');
    if (file.size > 24 * 1024 * 1024) {
      throw new Error('הקובץ גדול מדי (מקסימום 24MB).');
    }
    const parts = (file.name || '').split('.');
    const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';

    const res = await fetch(
      `/api/upload?category=${encodeURIComponent(category)}&ext=${encodeURIComponent(ext)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        },
        body: file
      }
    );

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'שגיאה בהעלאת התמונה.');
    }
    return data.url;
  }

  let toastTimer = null;
  function showToast(message) {
    const el = document.getElementById('app-toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }

  function openImageZoom(src, altText) {
    const dlg = document.getElementById('zoom-dialog');
    const img = document.getElementById('zoom-dialog-img');
    if (!dlg || !img || !src) return;
    img.src = src;
    img.alt = altText || 'תמונת שאלה מוגדלת';
    if (!dlg.open) dlg.showModal();
  }

  window.TriviaUI = {
    LETTERS,
    formatScore,
    escapeHtml,
    applyQuizBranding,
    syncHasImageFallback,
    initDialogs,
    uploadImageFile,
    showToast,
    openImageZoom
  };
})();
