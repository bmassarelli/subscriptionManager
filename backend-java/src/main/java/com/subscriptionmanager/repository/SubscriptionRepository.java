package com.subscriptionmanager.repository;

import com.subscriptionmanager.model.Subscription;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class SubscriptionRepository {

    private final JdbcTemplate jdbc;

    public SubscriptionRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private final RowMapper<Subscription> rowMapper = (rs, rowNum) -> new Subscription(
        rs.getLong("ID"),
        rs.getString("CLIENT_NAME"),
        rs.getString("EMAIL"),
        rs.getString("MSISDN"),
        rs.getString("PLATFORM"),
        rs.getString("CONTRACT"),
        rs.getString("STATUS"),
        rs.getString("ENTRY_DATE"),
        rs.getDouble("AMOUNT")
    );

    public List<Subscription> findAll() {
        return jdbc.query("""
            SELECT
              s.ID,
              c.NAME || ' ' || c.LAST_NAME AS CLIENT_NAME,
              c.EMAIL,
              c.MSISDN,
              s.PLATFORM,
              s.CONTRACT,
              s.STATUS,
              TO_CHAR(s.ENTRY_DATE, 'YYYY-MM-DD') AS ENTRY_DATE,
              s.AMOUNT
            FROM SUBSCRIBER_MANAGER.SUBSCRIPTIONS s
            JOIN SUBSCRIBER_MANAGER.CLIENT c ON s.CLIENT_ID = c.CLIENT_ID
            ORDER BY s.ENTRY_DATE DESC
            """,
            rowMapper
        );
    }

    public int activate(Long id) {
        return jdbc.update("""
            UPDATE SUBSCRIBER_MANAGER.SUBSCRIPTIONS
               SET STATUS        = 'A',
                   ACTIVATE_DATE = SYSDATE,
                   MODIFY_DATE   = SYSDATE
             WHERE ID     = ?
               AND STATUS != 'A'
            """,
            id
        );
    }
}
