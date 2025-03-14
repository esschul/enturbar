const { ipcRenderer } = require('electron');
const axios = require('axios');

const addRouteButton = document.getElementById('add-route-btn');
const routeForm = document.getElementById('route-form');
const fromInput = document.getElementById('from-input');
const toInput = document.getElementById('to-input');
const fromSuggestions = document.getElementById('from-suggestions');
const toSuggestions = document.getElementById('to-suggestions');
const saveButton = document.getElementById('save-btn');
const messageDiv = document.getElementById('message');

let selectedFromStop = null;
let selectedToStop = null;

console.log('✅ Renderer loaded');

addRouteButton.addEventListener('click', () => {
  console.log('🟢 Legg til ny rute button clicked');
  routeForm.style.display = 'block';
  addRouteButton.style.display = 'none';
});

fromInput.addEventListener('input', () => {
  searchStops(fromInput.value, fromSuggestions, 'from');
});

toInput.addEventListener('input', () => {
  searchStops(toInput.value, toSuggestions, 'to');
});

async function searchStops(query, suggestionsContainer, type) {
  if (!query || query.length < 2) {
    suggestionsContainer.innerHTML = '';
    return;
  }

  console.log(`🔍 Searching stops for: ${query}`);

  try {
    const response = await axios.get('https://api.entur.io/geocoder/v1/autocomplete', {
      params: {
        text: query,
        lang: 'no',
        size: 5
      }
    });

    const features = response.data.features;
    suggestionsContainer.innerHTML = '';

    features.forEach(feature => {
      const listItem = document.createElement('li');

      const name = feature.properties.name;
      const locality = feature.properties.locality || '';
      const stopId = feature.properties.id;
      const coordinates = feature.geometry.coordinates;
      const categories = feature.properties.category || [];

      const isTrain = categories.includes('railStation');
      const isBus = categories.includes('onstreetBus');

      let typeLabel = '';
      if (isTrain && isBus) typeLabel = '🚆🚌';
      else if (isTrain) typeLabel = '🚆';
      else if (isBus) typeLabel = '🚌';

      listItem.textContent = `${typeLabel} ${name} (${locality})`;

      listItem.addEventListener('click', () => {
        const stopData = {
          id: stopId,
          name: name,
          lat: coordinates[1],
          lon: coordinates[0]
        };

        if (type === 'from') {
          selectedFromStop = stopData;
          fromInput.value = name;
          fromSuggestions.innerHTML = '';
        } else if (type === 'to') {
          selectedToStop = stopData;
          toInput.value = name;
          toSuggestions.innerHTML = '';
        }

        showMessage(`Valgt ${type === 'from' ? 'fra' : 'til'}: ${name}`);
      });

      suggestionsContainer.appendChild(listItem);
    });

  } catch (error) {
    console.error('❌ Error fetching suggestions:', error);
    showMessage('Kunne ikke hente forslag.', true);
  }
}

saveButton.addEventListener('click', () => {
  if (!selectedFromStop || !selectedToStop) {
    showMessage('Velg både FRA og TIL stopp!', true);
    return;
  }

  console.log('📤 Sending new route:', selectedFromStop, selectedToStop);
  ipcRenderer.send('add-stop-pair', selectedFromStop, selectedToStop);
  showMessage('Rute lagret!');

  selectedFromStop = null;
  selectedToStop = null;

  fromInput.value = '';
  toInput.value = '';
  fromSuggestions.innerHTML = '';
  toSuggestions.innerHTML = '';

  routeForm.style.display = 'none';
  addRouteButton.style.display = 'block';

  console.log('✅ Route form reset, closing window');
  setTimeout(() => {
    console.log('🪟 Closing window...');
    window.close();
  }, 1000);
});

function showMessage(text, isError = false) {
  messageDiv.textContent = text;
  messageDiv.className = isError ? 'error' : '';
  setTimeout(() => {
    messageDiv.textContent = '';
  }, 3000);
}
