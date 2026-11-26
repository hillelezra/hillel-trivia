(function () {
  const LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];

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
    if (file.size > 34 * 1024 * 1024) {
      throw new Error('הקובץ גדול מדי (מקסימום 34MB).');
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

  const FIXED_QUESTION_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" width="640" height="420">
    <defs>
      <radialGradient id="qmBg" cx="50%" cy="48%" r="58%">
        <stop offset="0%" stop-color="#1e293b"/>
        <stop offset="65%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#070b14"/>
      </radialGradient>
      <linearGradient id="qmGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fef08a"/>
        <stop offset="45%" stop-color="#fbbf24"/>
        <stop offset="100%" stop-color="#d97706"/>
      </linearGradient>
      <linearGradient id="qmRing" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#38bdf8"/>
        <stop offset="100%" stop-color="#8b5cf6"/>
      </linearGradient>
      <filter id="qmGlow" x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="10" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <rect width="640" height="420" rx="32" fill="url(#qmBg)"/>
    <circle cx="320" cy="210" r="165" fill="none" stroke="url(#qmRing)" stroke-width="5" opacity="0.35" stroke-dasharray="14 10"/>
    <circle cx="320" cy="210" r="136" fill="rgba(15, 23, 42, 0.78)" stroke="url(#qmGold)" stroke-width="6" filter="url(#qmGlow)"/>
    <text x="320" y="274" text-anchor="middle" font-family="'Heebo', 'Segoe UI', Arial, sans-serif" font-size="210" font-weight="900" fill="url(#qmGold)" filter="url(#qmGlow)">?</text>
  </svg>`;

  const FIXED_QUESTION_MARK_IMAGE = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(FIXED_QUESTION_MARK_SVG)}`;

  function isUserUploadedQuestionImage(rawSrc) {
    const src = String(rawSrc || '').trim();
    if (!src) return false;
    if (src.startsWith('/api/question-art')) return false;
    return true;
  }

  function resolveQuestionReadingImage(rawSrc) {
    return isUserUploadedQuestionImage(rawSrc) ? String(rawSrc).trim() : FIXED_QUESTION_MARK_IMAGE;
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
    FIXED_QUESTION_MARK_IMAGE,
    isUserUploadedQuestionImage,
    resolveQuestionReadingImage,
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
