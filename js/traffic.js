// traffic.js — TomTom traffic flow tile overlay
// Renders a colour-coded traffic speed overlay on the map.
// Requires a TomTom API key in OpsViewConfig.tomtomKey (config.js).
// Free tier: developer.tomtom.com — 2,500 map tile requests/day.
//
// Colour legend (relative to free-flow speed):
//   Green  — normal flow      Yellow — slow      Red — congested

(function(){

var layer    = null;
var visible  = false;

function getKey() {
  return (window.OpsViewConfig && window.OpsViewConfig.tomtomKey) || '';
}

function toggle() {
  var map = window.map;
  if (!map) return;

  var key = getKey();
  if (!key) {
    showKeyPrompt();
    return;
  }

  if (!layer) {
    // relative0 = colour relative to free-flow speed (green → yellow → red)
    layer = L.tileLayer(
      'https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png' +
      '?key=' + encodeURIComponent(key) + '&tileSize=256',
      { attribution: '\u00A9 TomTom Traffic', opacity: 0.65, maxZoom: 19 }
    );
  }

  if (visible) {
    map.removeLayer(layer);
    visible = false;
  } else {
    layer.addTo(map);
    visible = true;
  }

  _updateBtn();
}

function showKeyPrompt() {
  var note = document.getElementById('trafficKeyNote');
  if (note) {
    note.style.display = note.style.display === 'none' ? 'block' : 'none';
  }
}

function _updateBtn() {
  var btn = document.getElementById('trafficToggleBtn');
  if (btn) btn.classList.toggle('active', visible);
}

window.TrafficOverlay = {
  toggle:    toggle,
  isVisible: function() { return visible; }
};

})();
