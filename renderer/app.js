(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const pet = $('#pet');
  const idle = $('#idle');
  const laughVideo = $('#laughVideo');
  const fallVideo = $('#fallVideo');
  const gifFallback = $('#gifFallback');
  const fallbackAudio = $('#fallbackAudio');
  const fx = $('#fx');
  const hint = $('#hint');
  const menu = $('#menu');
  const wobbleEl = $('.wobble');

  const words = ['哈哈哈', '哈哈', '嘎嘎嘎', '啊哈', '笑死', '笑不活了', '嘿嘿嘿'];
  const colors = ['#ffffff', '#ffd84d', '#ffeaa0', '#ffb86b'];

  let settings = {
    muted: false,
    alwaysOnTop: true,
    scale: 1,
    scales: [0.85, 1, 1.18],
  };
  let smoke = false;
  let mode = 'idle';
  let clickCount = 0;
  let videoBroken = false;
  let fallBroken = false;
  let gifTimer = null;
  let fallHoldTimer = null;
  let hintHideTimer = null;
  let menuOpen = false;
  let drag = null;

  init();

  async function init() {
    try {
      settings = { ...settings, ...(await window.petAPI.getSettings()) };
      smoke = !!settings.smoke;
    } catch (err) {
      console.warn('读取设置失败', err);
    }
    applySettings();

    laughVideo.addEventListener('ended', () => {
      if (mode === 'laughing') returnToIdle();
    });
    fallVideo.addEventListener('ended', () => {
      if (mode !== 'falling') return;
      clearTimeout(fallHoldTimer);
      fallHoldTimer = setTimeout(() => {
        if (mode === 'falling') returnToIdle();
      }, 900);
    });
    laughVideo.addEventListener('error', () => useGifFallback());
    fallVideo.addEventListener('error', () => {
      fallBroken = true;
    });

    window.petAPI.onPoke(() => poke());
    window.petAPI.onState((next) => {
      settings = { ...settings, ...next };
      applySettings();
    });

    bindPetPointer();
    bindMenu();
    bindHint();
    maybeShowHint();

    window.__petTest = {
      poke: () => poke(),
      status: () => ({
        mode,
        clickCount,
        videoBroken,
        fallBroken,
        hintShown: !hint.hidden,
        idleOpacity: getComputedStyle(idle).opacity,
        laughOpacity: getComputedStyle(laughVideo).opacity,
        fallOpacity: getComputedStyle(fallVideo).opacity,
        laugh: {
          readyState: laughVideo.readyState,
          paused: laughVideo.paused,
          time: Number(laughVideo.currentTime.toFixed(2)),
          duration: Number.isFinite(laughVideo.duration)
            ? Number(laughVideo.duration.toFixed(2))
            : null,
          muted: laughVideo.muted,
        },
        fall: {
          readyState: fallVideo.readyState,
          paused: fallVideo.paused,
          time: Number(fallVideo.currentTime.toFixed(2)),
          duration: Number.isFinite(fallVideo.duration)
            ? Number(fallVideo.duration.toFixed(2))
            : null,
          muted: fallVideo.muted,
        },
      }),
      openMenu: () => showMenu(24, 24),
      closeMenu: () => closeMenu(),
    };
  }

  function applySettings() {
    const silent = settings.muted || smoke;
    [laughVideo, fallVideo, fallbackAudio].forEach((el) => {
      el.muted = silent;
      el.volume = 0.95;
    });
    document.querySelectorAll('[data-val="muted"]').forEach((el) => {
      el.textContent = settings.muted ? '关' : '开';
    });
    document.querySelectorAll('[data-val="alwaysOnTop"]').forEach((el) => {
      el.textContent = settings.alwaysOnTop ? '开' : '关';
    });
    document.querySelectorAll('#scaleSeg button').forEach((btn) => {
      btn.classList.toggle('on', Number(btn.dataset.scale) === settings.scale);
    });
  }

  // —— 点击 / 拖动 ——
  function bindPetPointer() {
    pet.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      closeMenu();
      hideHint();
      if (mode === 'falling') return;
      drag = {
        startX: event.screenX,
        startY: event.screenY,
        moved: false,
        pointerId: event.pointerId,
      };
      try {
        pet.setPointerCapture(event.pointerId);
      } catch {
        /* 忽略 */
      }
    });

    pet.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.screenX - drag.startX;
      const dy = event.screenY - drag.startY;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 5) {
        drag.moved = true;
        document.body.classList.add('dragging');
        window.petAPI.dragStart({ x: drag.startX, y: drag.startY });
      }
      if (drag.moved) {
        window.petAPI.dragMove({ x: event.screenX, y: event.screenY });
      }
    });

    const finish = (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const wasDrag = drag.moved;
      drag = null;
      try {
        pet.releasePointerCapture(event.pointerId);
      } catch {
        /* 忽略 */
      }
      if (wasDrag) {
        document.body.classList.remove('dragging');
        window.petAPI.dragEnd();
      } else if (event.type === 'pointerup' && mode !== 'falling') {
        poke();
      }
    };

    pet.addEventListener('pointerup', finish);
    pet.addEventListener('pointercancel', finish);

    pet.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        poke();
      }
    });
  }

  function poke() {
    closeMenu();
    hideHint();
    if (mode === 'falling') return;

    if (mode === 'idle') {
      mode = 'laughing';
      clickCount = 1;
      document.body.classList.remove('falling');
      document.body.classList.add('laughing');
      wobble();
      playLaugh();
      spawnHaha(4);
      return;
    }

    clickCount += 1;
    if (clickCount >= 4) {
      playFall();
      return;
    }
    wobble();
    playLaugh();
    spawnHaha(2);
  }

  function playLaugh() {
    if (videoBroken) {
      playGif();
      return;
    }
    try {
      laughVideo.currentTime = 0;
    } catch {
      /* 元数据还没就绪时忽略 */
    }
    const promise = laughVideo.play();
    if (promise && promise.catch) {
      promise.catch(() => useGifFallback());
    }
  }

  function playGif() {
    document.body.classList.add('gif-mode');
    gifFallback.src = `../pet/laugh.gif?t=${Date.now()}`;
    fallbackAudio.currentTime = 0;
    const promise = fallbackAudio.play();
    if (promise && promise.catch) promise.catch(() => {});
    clearTimeout(gifTimer);
    gifTimer = setTimeout(() => {
      if (mode === 'laughing') returnToIdle();
    }, 4400);
  }

  function useGifFallback() {
    if (videoBroken) return;
    videoBroken = true;
    document.body.classList.add('gif-mode');
    console.warn('WebM 播放失败，切换到 GIF 备用动画');
    if (mode === 'laughing') playGif();
  }

  function playFall() {
    if (fallBroken) {
      // 倒地素材不可用时继续笑
      clickCount = 0;
      playLaugh();
      spawnHaha(3);
      return;
    }
    mode = 'falling';
    clickCount = 0;
    clearTimeout(gifTimer);
    document.body.classList.remove('laughing');
    document.body.classList.add('falling');
    try {
      laughVideo.pause();
    } catch {
      /* 忽略 */
    }
    try {
      fallVideo.currentTime = 0;
    } catch {
      /* 忽略 */
    }
    const promise = fallVideo.play();
    if (promise && promise.catch) {
      promise.catch(() => {
        fallBroken = true;
        returnToIdle();
      });
    }
    wobble();
    spawnHaha(6);
    spawnCaption('笑到倒地！');
  }

  function returnToIdle() {
    if (mode === 'idle') return;
    mode = 'idle';
    clickCount = 0;
    clearTimeout(gifTimer);
    clearTimeout(fallHoldTimer);
    document.body.classList.remove('laughing', 'falling');
    setTimeout(() => {
      if (mode !== 'idle') return;
      [laughVideo, fallVideo].forEach((video) => {
        try {
          video.pause();
          video.currentTime = 0;
        } catch {
          /* 忽略 */
        }
      });
      fallbackAudio.pause();
    }, 240);
  }

  function wobble() {
    wobbleEl.classList.remove('wobble-on');
    void wobbleEl.offsetWidth;
    wobbleEl.classList.add('wobble-on');
    setTimeout(() => wobbleEl.classList.remove('wobble-on'), 540);
  }

  function spawnHaha(count) {
    for (let i = 0; i < count; i += 1) {
      const node = document.createElement('span');
      node.className = 'haha';
      node.textContent = pick(words);
      node.style.left = `${20 + Math.random() * 60}%`;
      node.style.top = `${11 + Math.random() * 40}%`;
      node.style.fontSize = `${20 + Math.round(Math.random() * 13)}px`;
      node.style.color = pick(colors);
      node.style.setProperty('--r', `${(Math.random() * 24 - 12).toFixed(1)}deg`);
      node.style.animationDelay = `${(Math.random() * 0.13).toFixed(2)}s`;
      fx.appendChild(node);
      setTimeout(() => node.remove(), 1900);
    }
  }

  function spawnCaption(text) {
    const node = document.createElement('span');
    node.className = 'haha caption';
    node.textContent = text;
    node.style.setProperty('--r', '0deg');
    fx.appendChild(node);
    setTimeout(() => node.remove(), 2800);
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  // —— 右键菜单 ——
  function bindMenu() {
    document.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (menu.contains(event.target)) return;
      showMenu(event.clientX, event.clientY);
    });

    document.addEventListener(
      'pointerdown',
      (event) => {
        if (menuOpen && !menu.contains(event.target)) closeMenu();
      },
      true
    );

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });

    menu.addEventListener('click', async (event) => {
      const button = event.target.closest('button');
      if (!button) return;

      if (button.dataset.scale) {
        settings = {
          ...settings,
          ...(await window.petAPI.setScale(Number(button.dataset.scale))),
        };
        applySettings();
        closeMenu();
        return;
      }

      const action = button.dataset.act;
      if (action === 'muted' || action === 'alwaysOnTop') {
        settings = {
          ...settings,
          ...(await window.petAPI.setSetting(action, !settings[action])),
        };
        applySettings();
        setTimeout(closeMenu, 160);
      } else if (action === 'resetPosition') {
        await window.petAPI.resetPosition();
        closeMenu();
      } else if (action === 'quit') {
        window.petAPI.quit();
      }
    });
  }

  function showMenu(x, y) {
    hideHint();
    menu.hidden = false;
    menu.classList.add('open');
    menuOpen = true;
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    menu.classList.remove('open');
    setTimeout(() => {
      if (!menuOpen) menu.hidden = true;
    }, 130);
  }

  // —— 首次提示 ——
  function bindHint() {
    hint.addEventListener('pointerdown', (event) => event.stopPropagation());
  }

  function maybeShowHint() {
    if (!smoke && localStorage.getItem('naiwa-hint') === '1') return;
    setTimeout(() => {
      if (mode === 'idle' && !menuOpen) hint.hidden = false;
    }, 650);
    hintHideTimer = setTimeout(hideHint, 8200);
  }

  function hideHint() {
    clearTimeout(hintHideTimer);
    if (hint.hidden) return;
    hint.hidden = true;
    if (smoke) return;
    try {
      localStorage.setItem('naiwa-hint', '1');
    } catch {
      /* 忽略 */
    }
  }
})();
