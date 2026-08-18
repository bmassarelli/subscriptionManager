package com.subscriptionmanager.repository;

import com.subscriptionmanager.entity.Client;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClientRepository extends JpaRepository<Client, Long> {

    boolean existsByEmail(String email);

    boolean existsByMsisdn(String msisdn);
}
