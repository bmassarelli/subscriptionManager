package com.subscriptionmanager.repository;

import com.subscriptionmanager.entity.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {

    @Query("SELECT s FROM Subscription s JOIN FETCH s.client")
    List<Subscription> findAllWithClient();

    @Query("SELECT s.status, COUNT(s) FROM Subscription s GROUP BY s.status")
    List<Object[]> countByStatus();

    long countByClient_ClientId(Long clientId);
}
