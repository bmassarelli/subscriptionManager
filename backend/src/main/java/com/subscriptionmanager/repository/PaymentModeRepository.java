package com.subscriptionmanager.repository;

import com.subscriptionmanager.entity.PaymentMode;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentModeRepository extends JpaRepository<PaymentMode, Long> {
}
