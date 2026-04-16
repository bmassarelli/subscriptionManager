package com.subscriptionmanager.service;

import com.subscriptionmanager.dto.SubscriptionDTO;
import com.subscriptionmanager.entity.Subscription;
import com.subscriptionmanager.repository.SubscriptionRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class SubscriptionService {

    private final SubscriptionRepository repository;

    public SubscriptionService(SubscriptionRepository repository) {
        this.repository = repository;
    }

    public List<SubscriptionDTO> getAll() {
        return repository.findAllWithClient()
                .stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    private SubscriptionDTO toDTO(Subscription s) {
        String clientName = s.getClient().getName() + " " + s.getClient().getLastName();
        return new SubscriptionDTO(
                s.getId(),
                clientName,
                s.getClient().getEmail(),
                s.getClient().getMsisdn(),
                s.getPlatform(),
                s.getContract(),
                s.getStatus(),
                s.getEntryDate(),
                s.getAmount()
        );
    }
}
