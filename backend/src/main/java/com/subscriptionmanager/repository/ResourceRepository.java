package com.subscriptionmanager.repository;

import com.subscriptionmanager.entity.Resource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ResourceRepository extends JpaRepository<Resource, Long> {
    List<Resource> findBySubscriptionIdOrderByIdAsc(Long subscriptionId);

    long deleteBySubscriptionId(Long subscriptionId);
}
