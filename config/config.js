const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    host: process.env.HOST_DB,
    database: process.env.DATABASE_DB,
    user: process.env.USER_DB,
    password: process.env.PASSWORD_DB,
    port: process.env.PORT_DB,
    ssl: {
        rejectUnauthorized: false, 
    },
});

module.exports = pool;
