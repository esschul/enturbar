const { menubar } = require('menubar');
const axios = require('axios');
const { Menu, app, ipcMain } = require('electron');
const Store = require('electron-store');
const path = require('path');

const store = new Store();

let shouldShowWindow = false;

const mb = menubar({
    browserWindow: {
        width: 400,
        height: 500,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    },
    preloadWindow: true,
    showDockIcon: false,
    showOnClick: false,
    icon: path.join(__dirname, 'assets/train.png')
});

process.on('uncaughtException', (err) => {
    console.error('❗ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❗ Unhandled Rejection:', reason);
});

app.on('before-quit', () => {
    console.log('🚪 App is about to quit!');
});

app.on('window-all-closed', () => {
    console.log('🚪 All windows closed! (Not quitting automatically)');
    // Prevent quitting!
});

mb.on('ready', () => {
    console.log('✅ Menubar app is ready');

    buildContextMenu();
    fetchNextTrain();
    setInterval(fetchNextTrain, 60000);

    mb.tray.on('click', () => {
        console.log('👈 Tray icon clicked: hiding window');
        mb.hideWindow();
    });

    mb.tray.on('right-click', () => {
        console.log('👉 Tray icon right-clicked: opening context menu');
        mb.tray.popUpContextMenu();
    });
});

mb.on('create-window', () => {
    console.log('⚠️ create-window triggered');

    if (!shouldShowWindow) {
        console.log('❌ create-window fired but we do not want to show the window. Hiding immediately.');
        mb.hideWindow();
    }

    shouldShowWindow = false; // Reset flag after window is created
});

mb.on('after-create-window', () => {
    console.log('✅ after-create-window');
});

function buildContextMenu() {
    if (!mb.tray) {
        console.warn('⚠️ Tray not ready. Skipping context menu build.');
        return;
    }

    const stopsArray = store.get('stopsArray') || [];
    console.log('🔨 Building context menu. Stops:', stopsArray);

    const routeItems = stopsArray.flatMap(pair => [
        {
            label: `${pair.from.name} → ${pair.to.name}`,
            type: 'radio',
            checked: store.get('activePairId') === pair.id,
            click: () => {
                console.log(`✅ Selected route: ${pair.from.name} → ${pair.to.name}`);
                store.set('activePairId', pair.id);
                fetchNextTrain();
            }
        },
        {
            label: `${pair.to.name} → ${pair.from.name}`,
            type: 'radio',
            checked: store.get('activePairId') === `flipped-${pair.id}`,
            click: () => {
                console.log(`✅ Selected route: ${pair.to.name} → ${pair.from.name}`);
                store.set('activePairId', `flipped-${pair.id}`);
                fetchNextTrain();
            }
        }
    ]);

    const menuTemplate = [
        { label: 'Velg rute', enabled: false },
        ...(routeItems.length > 0
                ? routeItems
                : [{ label: 'Ingen ruter lagret', enabled: false }]
        ),
        { type: 'separator' },
        {
            label: 'Legg til rute...',
            click: () => {
                console.log('🟢 Legg til rute clicked');
                shouldShowWindow = true;

                if (!mb.window) {
                    console.warn('⚠️ No browser window ready yet');
                    return;
                }

                mb.showWindow();
                mb.window.focus();
            }
        },
        {
            label: 'Fjern alle ruter',
            click: () => {
                console.log('🗑️ Fjern alle ruter clicked');
                clearAllRoutes();
            }
        },
        { type: 'separator' },
        {
            label: 'Avslutt',
            click: () => {
                console.log('🚪 Avslutter app');
                app.quit();
            }
        }
    ];

    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    mb.tray.setContextMenu(contextMenu);
}

function clearAllRoutes() {
    console.log('🗑️ Clearing all routes');
    store.delete('stopsArray');
    store.delete('activePairId');
    mb.tray?.setTitle('Ingen ruter');
    setImmediate(() => {
        buildContextMenu();
    });
}

ipcMain.on('add-stop-pair', (event, fromStop, toStop) => {
    try {
        console.log('📥 Received add-stop-pair event');
        console.log('From:', fromStop);
        console.log('To:', toStop);

        if (!fromStop || !toStop) {
            console.error('❌ Missing stop data');
            return;
        }

        const stopsArray = store.get('stopsArray') || [];
        console.log('🗃️ Current stops array:', stopsArray);

        const newPair = {
            id: `${fromStop.id}-${toStop.id}`,
            from: fromStop,
            to: toStop
        };

        stopsArray.push(newPair);
        store.set('stopsArray', stopsArray);

        console.log('✅ New route added:', newPair);

        if (!store.get('activePairId')) {
            store.set('activePairId', newPair.id);
            console.log('➡️ No active pair set, using new pair:', newPair.id);
            fetchNextTrain();
        }

        setImmediate(() => {
            buildContextMenu();
        });

    } catch (error) {
        console.error('❌ Exception in add-stop-pair:', error);
    }
});

async function fetchNextTrain() {
    const stopsArray = store.get('stopsArray');
    const activePairId = store.get('activePairId');

    if (!stopsArray || stopsArray.length === 0) {
        mb.tray?.setTitle('Ingen ruter lagret');
        return;
    }

    let activePair;
    let reversed = false;

    if (activePairId?.startsWith('flipped-')) {
        const originalId = activePairId.replace('flipped-', '');
        activePair = stopsArray.find(pair => pair.id === originalId);
        reversed = true;
    } else {
        activePair = stopsArray.find(pair => pair.id === activePairId);
    }

    if (!activePair) {
        mb.tray?.setTitle('Ingen valgt rute');
        return;
    }

    const fromId = reversed ? activePair.to.id : activePair.from.id;
    const toId = reversed ? activePair.from.id : activePair.to.id;

    console.log(`🚄 Fetching trip from ${fromId} to ${toId}`);

    const query = `
  {
    trip(
      from: { place: "${fromId}" },
      to: { place: "${toId}" }
    ) {
      tripPatterns {
        duration
        walkDistance
        legs {
          expectedStartTime
          expectedEndTime
          aimedStartTime
          distance
          mode
          line {
            id
            publicCode
          }
        }
      }
    }
  }
  `;

    const url = 'https://api.entur.io/journey-planner/v3/graphql';

    try {
        const response = await axios.post(url, { query }, {
            headers: {
                'Content-Type': 'application/json',
                'ET-Client-Name': 'esschul-enturbar'
            }
        });

        const json = response.data;
        const firstPattern = json?.data?.trip?.tripPatterns?.[0];
        const firstLeg = firstPattern?.legs?.[0];

        if (firstLeg) {
            const line = firstLeg.line.publicCode;
            const startTime = formatTime(firstLeg.expectedStartTime);
            const endTime = formatTime(firstLeg.expectedEndTime);

            const aimedStart = new Date(firstLeg.aimedStartTime);
            const expectedStart = new Date(firstLeg.expectedStartTime);

            const delayMs = expectedStart - aimedStart;
            const delayMinutes = Math.round(delayMs / 60000);

            const indicator = delayMinutes > 1 ? '🔥 ' : '';

            const displayText = `${indicator}${line} : ${startTime} - ${endTime}`;

            console.log(`🚉 Next train: ${displayText}`);

            mb.tray?.setTitle(displayText);
        } else {
            mb.tray?.setTitle('Ingen avganger');
        }

    } catch (error) {
        console.error('❌ Error fetching train data:', error);
        mb.tray?.setTitle('Feil ved henting');
    }
}

function formatTime(isoString) {
    const date = new Date(isoString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}
