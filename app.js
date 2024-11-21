const map = L.map('map').setView([53.5461, -113.4938], 12); // Adjust coordinates as needed
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

let neighbourhoodsLayer, csvData = [];
const districts = {};
const colors = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"];

// Hardcoded GeoJSON file
const geoJSONFile = 'geojson/neighbourhoods.geojson';

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
  // Transform data to split event counts by year
  const groupedData = data.reduce((acc, row) => {
    const key = row['NEIGHBOURHOOD_NUMBER'];
    if (!acc[key]) acc[key] = { name: row['NEIGHBOURHOOD_NAME'], 2023: 0, 2024: 0, district: null };
    acc[key][row.year] += parseInt(row.EventCount, 10) || 0;
    acc[key].district = row.district || null;
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
    });
}

function joinCSVToGeoJSON(geojson, csv) {
  return geojson.features.map(feature => {
    const match = csv.find(row => row['NEIGHBOURHOOD_NUMBER'] == feature.properties['NEIGHBOURHOOD_NUMBER']);
    if (match) {
      feature.properties = { ...feature.properties, ...match };
      const district = match.district || 1; // Default district to 1 if not provided
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
        2024 Events: ${feature.properties[2024]}
      `);
      layer.on('contextmenu', () => changeDistrict(feature, layer));
    }
  }).addTo(map);
  updateLegend();
}

function changeDistrict(feature, layer) {
  const newDistrict = prompt("Enter new district (1-6):");
  if (newDistrict >= 1 && newDistrict <= 6) {
    feature.properties.district = newDistrict;
    renderMap({ features: neighbourhoodsLayer.toGeoJSON().features });
  }
}

function updateLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = "<h3>Districts</h3>";
  const districtSums = {};

  Object.keys(districts).forEach(d => {
    const total2023 = districts[d].reduce((sum, f) => sum + (parseInt(f.properties[2023]) || 0), 0);
    const total2024 = districts[d].reduce((sum, f) => sum + (parseInt(f.properties[2024]) || 0), 0);
    districtSums[d] = { total2023, total2024 };
  });

  Object.entries(districtSums).forEach(([district, totals]) => {
    legend.innerHTML += `<div>
      <span style="background:${colors[district - 1]}; padding:5px;"></span> 
      District ${district}: ${totals.total2023} (2023), ${totals.total2024} (2024) events
    </div>`;
  });
}

document.getElementById('exportBtn').addEventListener('click', () => {
  const updatedCSV = csvData.map(row => ({
    ...row,
    district: neighbourhoodsLayer.toGeoJSON().features.find(
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
