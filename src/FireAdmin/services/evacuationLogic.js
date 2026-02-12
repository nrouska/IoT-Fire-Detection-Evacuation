import fetch from "node-fetch";

export async function calculateAndPushPlan(fireLoc) {
    try {
        console.log("Triggering Evacuation Calculation...");

        // const pyRes = await fetch('http://127.0.0.1:5000/calculate-global-evacuation', {
        const pyRes = await fetch('http://evacuationserver:5000/calculate-global-evacuation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fire_location: fireLoc
            })
        });
        
        const plan = await pyRes.json();

        if (plan.status === 'success') {
            console.log("Pushing Plan to User Server (Port 3001)...");
            // await fetch('http://localhost:3001/internal/sync-state', {
            await fetch('http://fireuser:3001/internal/sync-state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: "EMERGENCY",
                    fireLocation: fireLoc,
                    paths: plan.results
                })
            });
        }
    } catch (e) {
        console.error("Admin Calculation Error:", e);
    }
}