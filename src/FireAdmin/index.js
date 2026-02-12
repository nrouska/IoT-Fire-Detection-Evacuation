import 'dotenv/config'
import pool from './db.js';
import express from 'express';
import { create } from 'express-handlebars';
import { basicAuth, basicInfo, deviceInformation, isCamera } from "./helper.js";
import {startMqttListener} from './services/mqttService.js';
import session from 'express-session'
import MySQLStoreFactory from 'express-mysql-session'
import cors from 'cors';

const app = express();
const hbs = create({ extname: '.hbs',
    helpers:{
        isCamera: isCamera,
    }
});
const MySQLStore = MySQLStoreFactory(session)

const sessionStore = new MySQLStore(
    {
        table: 'sessions',
        clearExpired: true,
        expiration: 1000 * 60 * 60 * 24, // 1 day
    },
    pool
)

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.use(express.static('public'))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use('/hls', express.static('streams'));

app.use(
    session({
        store: sessionStore,
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false, // true αν HTTPS
            httpOnly: true,
            maxAge: 1000 * 60 * 60 * 24,
        },
    })
)

let SENSOR_DATA = [];

import api from './routes/api.js'
import user from './routes/user.js'

app.use(api)
app.use(user)

startMqttListener();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});