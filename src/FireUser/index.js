import express from 'express';
import crypto from "crypto";
import 'dotenv/config';
import session from "express-session";
import MySQLStoreFactory from "express-mysql-session";
const MySQLStore = MySQLStoreFactory(session);
import { create } from 'express-handlebars';
import { basicInfo, getBuildingId } from "./helper.js"; // Importing your helper
const app = express();
const hbs = create({ extname: '.hbs', helpers: {} });

// --- DB & Session Setup (Untouched) ---
const dbOptions = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
};
const sessionStore = new MySQLStore(dbOptions);

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.use(express.static('public'));
app.use(express.json());

app.use(
    session({
        key: "SESID",
        secret: "ZsQt3hiXl4gWrecSh853CjDl5EesVq1Ru6F9l86685Ty7hsh8syYhmdctyBtstGhtHgaegk8N787976U435qM1J31fg0miIKo0O8L4P",
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24,
            httpOnly: true,
            secure: false,
            sameSite: "lax"
        }
    })
);

app.use((req, res, next) => {
    if (!req.session.userRandomId) {
        req.session.userRandomId = crypto.randomUUID();
    }
    next();
});


let SYSTEM_STATUS = "NORMAL";
let FIRE_LOCATION = null;
let BUILDING_PATHS = {};
let BUILDING_COUNTERS = {};



app.get('/', async (req, res) => {

    res.render("root", {
        stylesheets: ['/css/main.css', '/css/styles.css', '/leaflet/leaflet.css'], 
        scripts: [
            '/leaflet/leaflet.js', 
            '/js/map.js',               // Your existing Map
            '/js/msg.js',               // Your existing Ticker
            '/js/evacuation_overlay.js' // <--- THE NEW PART
        ], 
        basicInfo: basicInfo ? basicInfo() : {} 
    });
});

app.post('/', async (req, res) => {
    var building_id = await getBuildingId(req.body)
    console.log('=====================================');
    console.log(req.body);
    console.log(building_id);
    console.log('=====================================');
    res.json({
        apId: building_id
    })
})

app.get('/faker', async (req, res) => {
    res.render('faker', {stylesheets: ['/leaflet/leaflet.css'], scripts: ['/leaflet/leaflet.js', '/js/faker.js']});
})


app.post('/internal/sync-state', (req, res) => {
    const { status, fireLocation, paths } = req.body;
    SYSTEM_STATUS = status;
    FIRE_LOCATION = fireLocation;
    if (paths) {
        BUILDING_PATHS = paths;
        // Reset counters so distribution starts fresh
        Object.keys(BUILDING_PATHS).forEach(k => BUILDING_COUNTERS[k] = 0);
    }
    console.log(`State Synced: ${status}`);
    res.sendStatus(200);
});

app.get('/api/user/status', (req, res) => {
    res.json({ 
        status: SYSTEM_STATUS, 
        fireLocation: FIRE_LOCATION 
    });
});

app.post('/api/user/get-path', (req, res) => {
    const { ap_id } = req.body;
    
    const buildingName = ap_id ? ap_id.split('_').slice(0, 2).join('_') : "UNKNOWN";
    const paths = BUILDING_PATHS[buildingName];
    
    console.log("------------------------------------------------");
    console.log(` DEBUG PATH REQUEST:`);
    console.log(` User asking for Building: "${buildingName}"`);
    console.log(` Server has paths for:    ${JSON.stringify(Object.keys(BUILDING_PATHS))}`);
    
    if (!paths || paths.length === 0) {
        console.log(" RESULT: No match found. Sending 'no_path'.");
        console.log(" FIX: Rename your building in Admin Topology to match the User ID.");
        return res.json({ status: "no_path" });
    }

    console.log(" RESULT: Match found! Sending path.");
   

    if (req.session.evacPathIndex === undefined || req.session.evacBuilding !== buildingName) {
        const counter = BUILDING_COUNTERS[buildingName] || 0;
        req.session.evacPathIndex = counter;
        req.session.evacBuilding = buildingName;
        BUILDING_COUNTERS[buildingName] = (counter + 1) % paths.length; 
    }

    res.json({ status: "success", path: paths[req.session.evacPathIndex] });
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});