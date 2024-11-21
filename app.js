const map = L.map('map').setView([53.5461, -113.4938], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let neighbourhoodsLayer, fireStationsLayer, csvData = [];
const districts = {};
const colors = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"];

// Hardcoded GeoJSON files
const geoJSONFile = 'geojson/neighbourhoods.geojson';
const fireStationsGeoJSONFile = 'geojson/fire_stations.geojson';

// Fire station icon setup
const fireStationIcon = (stationNumber) =>
  L.divIcon({
    className: 'fire-station-icon',
    html: `<div style="background-color:#7a0901; color:#FFFFFF; border-radius:50%; padding:10px; text-align:center; width:20px; height:20px; line-height:20px;">${stationNumber}</div>`,
    iconSize: [20, 20],
    iconAnchor: [15, 15],
  });

document.getElementById('csvInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        csvData = results.data;
        processCSVData(csvData);
      }
    });
  }
});

function processCSVData(data) {
  const groupedData = data.reduce((acc, row) => {
    const key = row['NEIGHBOURHOOD_NUMBER'];
    if (!acc[key]) acc[key] = { name: row['NEIGHBOURHOOD_NAME'], 2023: 0, 2024: 0, district: row['District'] };
    acc[key][row.year] += parseInt(row.EventCount, 10) || 0;
    return acc;
  }, {});
  csvData = Object.entries(groupedData).map(([number, values]) => ({
    ...values,
    NEIGHBOURHOOD_NUMBER: number,
  }));
  loadGeoJSON();
}

function loadGeoJSON() {
  fetch(geoJSONFile)
    .then(response => response.json())
    .then(geojson => {
      const joinedGeoJSON = joinCSVToGeoJSON(geojson, csvData);
      renderMap(joinedGeoJSON);
      loadFireStations();
    });
}

function joinCSVToGeoJSON(geojson, csv) {
  return geojson.features.map(feature => {
    const match = csv.find(row => row['NEIGHBOURHOOD_NUMBER'] == feature.properties['NEIGHBOURHOOD_NUMBER']);
    if (match) {
      feature.properties = { ...feature.properties, ...match };
      const district = match.district || 1;
      feature.properties.district = district;
      if (!districts[district]) districts[district] = [];
      districts[district].push(feature);
    }
    return feature;
  });
}

function renderMap(joinedGeoJSON) {
  if (neighbourhoodsLayer) map.removeLayer(neighbourhoodsLayer);

  neighbourhoodsLayer = L.geoJSON(joinedGeoJSON, {
    style: feature => ({
      color: colors[feature.properties.district - 1] || "#000000",
      weight: 1,
      fillOpacity: 0.5,
    }),
    onEachFeature: (feature, layer) => {
      layer.bindTooltip(`
        <strong>${feature.properties['NEIGHBOURHOOD_NAME']}</strong><br>
        Neighbourhood #: ${feature.properties['NEIGHBOURHOOD_NUMBER']}<br>
        2023 Events: ${feature.properties[2023]}<br>
        2024 Events: ${feature.properties[2024]}<br>
        District: ${feature.properties.district}
      `);
      layer.on('contextmenu', () => changeDistrict(feature, layer));
    }
  }).addTo(map);
  updateLegend();
}

function changeDistrict(feature, layer) {
  const newDistrict = prompt("Enter new district (1-6):");
  if (newDistrict >= 1 && newDistrict <= 6) {
    // Update district assignment
    const currentDistrict = feature.properties.district;
    feature.properties.district = parseInt(newDistrict, 10);

    // Remove feature from current district
    districts[currentDistrict] = districts[currentDistrict].filter(
      (f) => f.properties['NEIGHBOURHOOD_NUMBER'] !== feature.properties['NEIGHBOURHOOD_NUMBER']
    );

    // Add feature to new district
    if (!districts[newDistrict]) districts[newDistrict] = [];
    districts[newDistrict].push(feature);

    // Re-render the map and legend
    renderMap({ features: neighbourhoodsLayer.toGeoJSON().features });
  }
}

function updateLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = "<h3>Legend</h3>";

  const districtSums = {};

  // Calculate event counts for each district
  Object.keys(districts).forEach((d) => {
    const total2023 = districts[d].reduce(
      (sum, f) => sum + (parseInt(f.properties[2023]) || 0),
      0
    );
    const total2024 = districts[d].reduce(
      (sum, f) => sum + (parseInt(f.properties[2024]) || 0),
      0
    );
    districtSums[d] = { total2023, total2024 };
  });

  // Update legend with district totals
  Object.entries(districtSums).forEach(([district, totals]) => {
    legend.innerHTML += `<div>
      <span style="background:${colors[district - 1]}; padding:5px;"></span> 
      District ${district}: ${totals.total2023} (2023), ${totals.total2024} (2024) events
    </div>`;
  });
}



function loadFireStations() {
  fetch(fireStationsGeoJSONFile)
    .then(response => response.json())
    .then(geojson => {
      fireStationsLayer = L.geoJSON(geojson, {
        pointToLayer: (feature, latlng) => {
          return L.marker(latlng, { icon: fireStationIcon(feature.properties['Station Number']) });
        }
      }).addTo(map);
    });
}

document.getElementById('exportBtn').addEventListener('click', () => {
  const updatedCSV = csvData.map(row => ({
    ...row,
    District: neighbourhoodsLayer.toGeoJSON().features.find(
      f => f.properties['NEIGHBOURHOOD_NUMBER'] == row['NEIGHBOURHOOD_NUMBER']
    )?.properties.district
  }));
  const csv = Papa.unparse(updatedCSV);
  downloadCSV(csv, "updated_neighbourhoods.csv");
});

function downloadCSV(data, filename) {
  const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
