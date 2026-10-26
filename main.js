const { app, BrowserWindow, ipcMain, Menu, Tray, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_NAME = '奶蛙';
const BASE_W = 340;
const BASE_H = 500;
const SCALES = [0.85, 1, 1.18];
const EDGE_MARGIN = 28;

app.setName(APP_NAME);
app.setAppUserModelId('com.naiwa.desktoppet');

// 点击后立刻播放声音，不受浏览器自动播放策略影响
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let win = null;
let tray = null;
let state = {
  x: null,
  y: null,
  scale: 1,
  muted: false,
  alwaysOnTop: true,
};
let dragGrab = null;
let smokeRun = false;

function statePath() {
  return path.join(app.getPath('userData'), 'pet-state.json');
}

function loadState() {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    state = { ...state, ...raw };
    if (!SCALES.includes(state.scale)) state.scale = 1;
  } catch {
    /* 首次运行没有存档 */
  }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('save state failed:', err.message);
  }
}

function windowSize(scale = state.scale) {
  return {
    width: Math.round(BASE_W * scale),
    height: Math.round(BASE_H * scale),
  };
}

function clampToScreen(x, y, width, height) {
  const point = { x: x + width / 2, y: y + height / 2 };
  const { workArea } = screen.getDisplayNearestPoint(point);
  const minVisible = 90;
  const cx = Math.min(
    Math.max(x, workArea.x - width + minVisible),
    workArea.x + workArea.width - minVisible
  );
  const cy = Math.min(
    Math.max(y, workArea.y - height + minVisible),
    workArea.y + workArea.height - minVisible
  );
  return { x: Math.round(cx), y: Math.round(cy) };
}

function defaultPosition(width, height) {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - width - EDGE_MARGIN,
    y: workArea.y + workArea.height - height - 12,
  };
}

function createWindow() {
  const { width, height } = windowSize();
  const fallback = defaultPosition(width, height);
  let x = Number.isFinite(state.x) ? state.x : fallback.x;
  let y = Number.isFinite(state.y) ? state.y : fallback.y;
  ({ x, y } = clampToScreen(x, y, width, height));

  win = new BrowserWindow({
    width,
    height,
    x,
    y,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: state.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.setAlwaysOnTop(state.alwaysOnTop, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: smokeRun ? { smoke: '1' } : {},
  });

  win.once('ready-to-show', () => {
    win.show();
    if (smokeRun) runSmokeTest();
  });

  win.on('closed', () => {
    win = null;
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('console-message', (details) => {
    const level = details && details.level;
    if (level === 'error' || level === 'warning') {
      console.log(
        `[renderer:${level}] ${details.message} (${details.sourceId}:${details.lineNumber})`
      );
    }
  });

  ipcMain.on('pet:drag-start', (_event, point) => {
    if (!win) return;
    const bounds = win.getBounds();
    dragGrab = { x: point.x - bounds.x, y: point.y - bounds.y };
  });

  ipcMain.on('pet:drag-move', (_event, point) => {
    if (!win || !dragGrab) return;
    const bounds = win.getBounds();
    const next = clampToScreen(
      point.x - dragGrab.x,
      point.y - dragGrab.y,
      bounds.width,
      bounds.height
    );
    win.setPosition(next.x, next.y, false);
  });

  ipcMain.on('pet:drag-end', () => {
    dragGrab = null;
    if (!win) return;
    const { x: wx, y: wy } = win.getBounds();
    state.x = wx;
    state.y = wy;
    saveState();
  });

  ipcMain.handle('pet:get-settings', () => ({
    muted: state.muted,
    alwaysOnTop: state.alwaysOnTop,
    scale: state.scale,
    scales: SCALES,
    appVersion: app.getVersion(),
    smoke: smokeRun,
  }));

  ipcMain.handle('pet:set-setting', (_event, key, value) => {
    if (key === 'muted') state.muted = !!value;
    if (key === 'alwaysOnTop') {
      state.alwaysOnTop = !!value;
      if (win) win.setAlwaysOnTop(state.alwaysOnTop, 'floating');
    }
    saveState();
    syncUi();
    return publicSettings();
  });

  ipcMain.handle('pet:set-scale', (_event, scale) => {
    if (!win || !SCALES.includes(scale)) return publicSettings();
    const bounds = win.getBounds();
    const { width, height } = windowSize(scale);
    const centerX = bounds.x + bounds.width / 2;
    const bottom = bounds.y + bounds.height;
    const pos = clampToScreen(
      Math.round(centerX - width / 2),
      Math.round(bottom - height),
      width,
      height
    );
    state.scale = scale;
    state.x = pos.x;
    state.y = pos.y;
    win.setBounds({ x: pos.x, y: pos.y, width, height }, true);
    saveState();
    syncUi();
    return publicSettings();
  });

  ipcMain.handle('pet:reset-position', () => {
    if (!win) return;
    const bounds = win.getBounds();
    const pos = defaultPosition(bounds.width, bounds.height);
    win.setPosition(pos.x, pos.y, true);
    state.x = pos.x;
    state.y = pos.y;
    saveState();
    return true;
  });

  ipcMain.on('pet:quit', () => app.quit());
  ipcMain.on('pet:hide', () => win && win.hide());
}

function publicSettings() {
  return {
    muted: state.muted,
    alwaysOnTop: state.alwaysOnTop,
    scale: state.scale,
    scales: SCALES,
  };
}

function syncUi() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('pet:state', publicSettings());
  }
  refreshTray();
}

function showWindow() {
  if (!win) {
    createWindow();
    return;
  }
  if (!win.isVisible()) win.show();
  win.moveTop();
}

function buildTray() {
  const iconPath = path.join(__dirname, 'pet', 'icon.ico');
  try {
    tray = new Tray(iconPath);
  } catch (err) {
    console.warn('tray icon failed:', err.message);
    return;
  }
  tray.setToolTip('奶蛙 · 戳一下会狂笑');
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
  refreshTray();
}

function refreshTray() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: '戳一下',
      click: () => {
        showWindow();
        win.webContents.send('pet:poke');
      },
    },
    {
      label: win && win.isVisible() ? '隐藏奶蛙' : '显示奶蛙',
      click: () => {
        if (!win) return createWindow();
        if (win.isVisible()) win.hide();
        else showWindow();
        refreshTray();
      },
    },
    { type: 'separator' },
    {
      label: '静音',
      type: 'checkbox',
      checked: state.muted,
      click: () => {
        state.muted = !state.muted;
        saveState();
        syncUi();
      },
    },
    {
      label: '总在最前',
      type: 'checkbox',
      checked: state.alwaysOnTop,
      click: () => {
        state.alwaysOnTop = !state.alwaysOnTop;
        if (win) win.setAlwaysOnTop(state.alwaysOnTop, 'floating');
        saveState();
        syncUi();
      },
    },
    { type: 'separator' },
    { label: '退出奶蛙', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

// —— 冒烟测试：截图并检查播放状态，不影响正常使用 ——
async function runSmokeTest() {
  const outDir = app.isPackaged
    ? path.join(app.getPath('temp'), 'naiwa-smoke')
    : path.join(__dirname, 'smoke');
  fs.mkdirSync(outDir, { recursive: true });
  console.log('SMOKE_DIR', outDir);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, name), image.toPNG());
  };
  try {
    await sleep(900);
    await shot('shot-idle.png');
    const idleStatus = await win.webContents.executeJavaScript(
      'window.__petTest && window.__petTest.status()'
    );

    // 真实右键事件 → 菜单
    await win.webContents.executeJavaScript(
      `document.dispatchEvent(new MouseEvent('contextmenu', {clientX: 96, clientY: 128, bubbles: true}))`
    );
    await sleep(280);
    await shot('shot-menu.png');
    const menuShown = await win.webContents.executeJavaScript(
      `!document.querySelector('#menu').hidden && document.querySelector('#menu').classList.contains('open')`
    );
    await win.webContents.executeJavaScript('window.__petTest.closeMenu()');
    await sleep(160);

    await win.webContents.executeJavaScript('window.__petTest.poke()');
    await sleep(420);
    await shot('shot-laugh-early.png');
    await sleep(1100);
    await shot('shot-laugh.png');
    const laughStatus = await win.webContents.executeJavaScript(
      'window.__petTest && window.__petTest.status()'
    );
    await sleep(3200);
    await shot('shot-after.png');
    const afterStatus = await win.webContents.executeJavaScript(
      'window.__petTest && window.__petTest.status()'
    );
    for (let i = 0; i < 4; i += 1) {
      await win.webContents.executeJavaScript('window.__petTest.poke()');
      await sleep(90);
    }
    await sleep(1600);
    await shot('shot-fall.png');
    const fallStatus = await win.webContents.executeJavaScript(
      'window.__petTest && window.__petTest.status()'
    );

    // 拖拽链路
    const beforeDrag = win.getBounds();
    await win.webContents.executeJavaScript(
      `window.petAPI.dragStart({x: ${beforeDrag.x + 120}, y: ${beforeDrag.y + 120}})`
    );
    await win.webContents.executeJavaScript(
      `window.petAPI.dragMove({x: ${beforeDrag.x + 60}, y: ${beforeDrag.y + 70}})`
    );
    await sleep(220);
    const afterDrag = win.getBounds();
    await win.webContents.executeJavaScript('window.petAPI.dragEnd()');
    const dragDelta = {
      dx: beforeDrag.x - afterDrag.x,
      dy: beforeDrag.y - afterDrag.y,
      expected: { dx: 60, dy: 50 },
    };
    await win.webContents.executeJavaScript('window.petAPI.resetPosition()');

    // 缩放链路
    const beforeScale = win.getBounds();
    await win.webContents.executeJavaScript('window.petAPI.setScale(1.18)');
    await sleep(320);
    const bigScale = win.getBounds();
    await win.webContents.executeJavaScript('window.petAPI.setScale(1)');
    await sleep(220);
    const backScale = win.getBounds();

    const result = {
      packaged: app.isPackaged,
      trayOk: !!tray,
      idleStatus,
      laughStatus,
      afterStatus,
      fallStatus,
      menuShown,
      dragDelta,
      scale: {
        before: { w: beforeScale.width, h: beforeScale.height },
        big: { w: bigScale.width, h: bigScale.height },
        back: { w: backScale.width, h: backScale.height },
      },
    };
    fs.writeFileSync(
      path.join(outDir, 'result.json'),
      JSON.stringify(result, null, 2)
    );
    console.log('SMOKE_RESULT', JSON.stringify(result));
  } catch (err) {
    fs.writeFileSync(path.join(outDir, 'error.txt'), String(err.stack || err));
    console.error('SMOKE_ERROR', err.stack || err.message);
  } finally {
    setTimeout(() => app.quit(), 400);
  }
}

app.whenReady().then(() => {
  smokeRun = process.argv.includes('--smoke');
  loadState();
  createWindow();
  buildTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

app.on('second-instance', () => {
  showWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
