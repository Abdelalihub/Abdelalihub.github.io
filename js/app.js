// Global objects

const api = new NRFCloudAPI(localStorage.getItem('apiKey'));
const leafletMap = L.map('leaflet-map').setView([63.4206897, 10.4372859], 15);
let counterInterval;
let requestInterval;
let flipped = false;

// Setup the map

leafletMap.addLayer(L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
	attribution: '',
	subdomains: 'abcd',
	maxZoom: 19,
}));

leafletMap.zoomControl.remove();

const locationMarker = L.marker([63.4206897, 10.4372859], {
	icon: L.icon({
		iconUrl: 'images/map_pin_icon.png',
		iconSize: [40, 41],
		iconAnchor: [20, 41]
	})
}).addTo(leafletMap);

// Load devices from nRFCloud api and populate list in settings view
function loadDeviceNames() {
	$('#device-list').empty().append('Refreshing device list...');
	api.devices().then(({ items }) => {
		if (items.length < 1) {
			throw new Error();
		}
		$('#device-list').empty();
		items.forEach(({ id, name }) => {
			const deviceItem = $(`<a class="list-group-item list-group-item-action">${name}</a>`);
			deviceItem.click(() => {
				$('#device-list').children().removeClass('active');
				deviceItem.addClass('active');
				localStorage.setItem('deviceId', id);
			});
			$('#device-list').append(deviceItem);
		});
	})
		.catch(() => $('#device-list').empty().append('No devices found.'));
}

// Show toast message
function showToast(title, subtitle, content, type, delay) {
	$.toast({ title, subtitle, content, type, delay });
}

// Simple NMEA GPGGA sentence decoder
function decodeGPS(data) {
	const [type, , lat, latHem, lon, lonHem] = data.split(',');
	if (type === '$GPGGA') {
		let la = Number(lat) / 100;
		let lo = Number(lon) / 100;
		la += -(la % 1) + (la % 1) / 60 * 100;
		lo += -(lo % 1) + (lo % 1) / 60 * 100;
		return {
			lat: la * (latHem === 'N' ? 1 : -1),
			lon: lo * (lonHem === 'E' ? 1 : -1),
		}
	}
	return undefined;
}

// Collection of update functions for different message types of nRFCloud device messages
const updateFunc = {
	GROUND_FIX: data => {

		console.log("gps", data);

		const pos = {
			lat: data.lat,
			lon: data.lon
		};

		locationMarker.setLatLng(pos);
		// Pan to position and leave dots as a track
		leafletMap.panTo(pos).addLayer(L.circleMarker(pos, { radius: 4, color: '#00a9ce' }));
	},
	GPS: data => {
		const pos = decodeGPS(data);
		if (!pos) {
			return;
		}
		locationMarker.setLatLng(pos);
		// Pan to position and leave dots as a track
		leafletMap.panTo(pos).addLayer(L.circleMarker(pos, { radius: 4, color: '#00a9ce' }));
	},
	TEMP: data => {
		$('#temperature').text(data);
	},
	AIR_PRESS: data => {
		$('#air_pressure').text(data);
	},
	BATTERY: data => {
		$('#battery').text(data);
	},
	AIR_QUAL: data => {
		$('#air_quality').text(data);
	},
	HUMID: data => {
		$('#humidity').text(data);
	},
	RSRP: data => {
		$('#rsrp').text(data);
	}
}

function startDataSync() {
	// stop previous intervals if there was an order already
	clearInterval(requestInterval);

	// check nRFCloud messages from the device every 5 seconds
	requestInterval = setInterval(async () => {
		const { items } = await api.getMessages(localStorage.getItem('deviceId') || '');

		(items || [])
		.map(({ message }) => message)
		.forEach(({ appId, data }) => {
			if (!updateFunc[appId]) {
				console.log('unhandled appid', appId, data);
				return;
			}
			updateFunc[appId](data);
		});
	}, 5000);

	// change to track view
	$('#trackBtn').click();
}

// Main function
$(document).ready(() => {
	// Set initial values
	$('#api-key').val(localStorage.getItem('apiKey') || '');
	$('body').tooltip({ selector: '[data-toggle="tooltip"]' });

	// Tab bar view selector buttons:
	$('.view-btn').click(({ target }) => {
		const id = target.id.replace('Btn', '');

		['track', 'settings']
			.filter(key => key !== id)
			.forEach(key => {
				$(`#${key}View`).removeClass('d-flex').addClass('d-none');
				$(`#${key}Btn`).removeClass('text-white').addClass('nrf-light-blue');
			});

		$(`#${id}Btn`).removeClass('nrf-light-blue').addClass('text-white');
		$(`#${id}View`).removeClass('d-none').addClass('d-flex');

		if (id === 'settings') {
			loadDeviceNames();
		}
		if (id === 'track') {
			leafletMap.invalidateSize();
		}
	});

	// Settings view, api key change:
	$('#api-key').on('input', () => {
		api.accessToken = $('#api-key').val().trim();
		localStorage.setItem('apiKey', api.accessToken);
		loadDeviceNames();
	});

	startDataSync();
});
