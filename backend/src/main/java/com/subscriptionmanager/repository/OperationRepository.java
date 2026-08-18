package com.subscriptionmanager.repository;

import com.subscriptionmanager.entity.Operation;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface OperationRepository extends JpaRepository<Operation, Long> {

    List<Operation> findBySubscriptionIdOrderByCreatedDateDesc(Long subscriptionId);

    List<Operation> findAllByOrderByCreatedDateDesc();

    List<Operation> findAllByOrderByCreatedDateDesc(Pageable pageable);

    @Query("SELECT o.operationType, COUNT(o) FROM Operation o GROUP BY o.operationType")
    List<Object[]> countByOperationType();
}
