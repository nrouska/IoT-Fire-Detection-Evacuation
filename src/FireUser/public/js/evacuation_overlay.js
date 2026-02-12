export function showPath(myAP) {
    console.log("Evacuation Overlay Service Loading...");

    let attempts = 0;
    let checkMapInterval = setInterval(() => {
        attempts++;
        if (window.map && typeof window.map.addLayer === 'function') {
            clearInterval(checkMapInterval);
            console.log("Leaflet Map Successfully Found! Starting Service...");
            startService(window.map, myAP);
        } else if (attempts > 20) {
            console.log("Still waiting for map.js to load...");
        }
    }, 500);

    function startService(evacMap, myAP) {
        let isEmergency = false;
        let fireCircle = null;
        let myPathLine = null;

        setInterval(async () => {
            try {
                const res = await fetch('/api/user/status');
                const data = await res.json();
                if (data.status === 'EMERGENCY') activateEmergency(data.fireLocation);
                else setNormal();
            } catch (e) { }
        }, 2000);

        async function activateEmergency(fireLoc) {
            if (isEmergency) return;
            isEmergency = true;
            console.log("EMERGENCY TRIGGERED");

            const header = document.querySelector('.alert');
            if (header) {
                header.classList.remove('hidden');
            }

            if (fireLoc) {
                if (fireCircle) evacMap.removeLayer(fireCircle);
                fireCircle = L.circle([fireLoc.lat, fireLoc.lng], {
                    color: 'orange', fillColor: '#f39c12', fillOpacity: 0.6, radius: 40
                }).addTo(evacMap);
                evacMap.setView([fireLoc.lat, fireLoc.lng], 16);
            }

            try {
                const res = await fetch('/api/user/get-path', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ap_id: myAP })
                });
                const data = await res.json();

                if (data.status === 'success') {
                    if (myPathLine) evacMap.removeLayer(myPathLine);
                    const latLngs = data.path.map(p => [p.lat, p.lng]);

                    myPathLine = L.polyline(latLngs, {
                        color: 'red', weight: 6, dashArray: '10, 10'
                    }).addTo(evacMap);

                    evacMap.fitBounds(myPathLine.getBounds(), { padding: [50, 50] });
                    console.log("Red Path Drawn!");
                }
            } catch(e) { console.error("Path Error:", e); }
        }

        function setNormal() {
            if (!isEmergency) return;
            isEmergency = false;
            const header = document.querySelector('.alert');
            if (header) {
                header.classList.add('hidden');
            }
            if (fireCircle) { evacMap.removeLayer(fireCircle); fireCircle = null; }
            if (myPathLine) { evacMap.removeLayer(myPathLine); myPathLine = null; }
        }
    }
};
