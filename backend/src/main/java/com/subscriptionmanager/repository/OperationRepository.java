package com.subscriptionmanager.repository;

import com.subscriptionmanager.entity.Operation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OperationRepository extends JpaRepository<Operation, Long> {

    List<Operation> findBySubscriptionIdOrderByCreatedDateDesc(Long subscriptionId);
}
