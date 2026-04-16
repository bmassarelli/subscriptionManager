const oracledb = require('oracledb');

// Use Thin mode — no Oracle Client libraries required
oracledb.initOracleClient = undefined;

let pool;

async function initPool() {
  pool = await oracledb.createPool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE}`,
    poolMin: 1,
    poolMax: 5,
    poolIncrement: 1,
  });
  console.log('Oracle connection pool created');
}

async function getConnection() {
  return pool.getConnection();
}

module.exports = { initPool, getConnection };
