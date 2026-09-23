package com.subscriptionmanager.repository;

import com.subscriptionmanager.entity.ProductOffering;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProductOfferingRepository extends JpaRepository<ProductOffering, Long> {

    Optional<ProductOffering> findByName(String name);
}
