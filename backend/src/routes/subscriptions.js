const express = require('express');
const oracledb = require('oracledb');
const { getConnection } = require('../db');

const router = express.Router();

// GET /api/subscriptions
// Returns all subscriptions joined with client data
router.get('/', async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT
         s.ID,
         c.NAME || ' ' || c.LAST_NAME  AS CLIENT_NAME,
         c.EMAIL,
         c.MSISDN,
         s.PLATFORM,
         s.CONTRACT,
         s.STATUS,
         TO_CHAR(s.ENTRY_DATE, 'YYYY-MM-DD') AS ENTRY_DATE,
         s.AMOUNT
       FROM SUBSCRIBER_MANAGER.SUBSCRIPTIONS s
       JOIN SUBSCRIBER_MANAGER.CLIENT c ON s.CLIENT_ID = c.CLIENT_ID
       ORDER BY s.ENTRY_DATE DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const rows = result.rows.map(r => ({
      id:         r.ID,
      clientName: r.CLIENT_NAME,
      email:      r.EMAIL,
      msisdn:     r.MSISDN,
      platform:   r.PLATFORM,
      contract:   r.CONTRACT,
      status:     r.STATUS,
      entryDate:  r.ENTRY_DATE,
      amount:     r.AMOUNT,
    }));

    res.json(rows);
  } catch (err) {
    console.error('GET /subscriptions error:', err);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  } finally {
    if (conn) await conn.close();
  }
});

// PUT /api/subscriptions/:id/activate
// Sets STATUS = 'AC', ACTIVATE_DATE = SYSDATE, MODIFY_DATE = SYSDATE
router.put('/:id/activate', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid subscription id' });
  }

  let conn;
  try {
    conn = await getConnection();

    const result = await conn.execute(
      `UPDATE SUBSCRIBER_MANAGER.SUBSCRIPTIONS
          SET STATUS = 'AC',
              ACTIVATE_DATE = SYSDATE,
              MODIFY_DATE   = SYSDATE
        WHERE ID = :id
          AND STATUS != 'AC'`,
      { id },
      { autoCommit: true }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Subscription not found or already active' });
    }

    res.json({ id, status: 'AC' });
  } catch (err) {
    console.error(`PUT /subscriptions/${id}/activate error:`, err);
    res.status(500).json({ error: 'Failed to activate subscription' });
  } finally {
    if (conn) await conn.close();
  }
});

module.exports = router;
