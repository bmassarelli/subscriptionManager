package com.subscriptionmanager.controller;

import com.subscriptionmanager.dto.SubscriptionDTO;
import com.subscriptionmanager.dto.SubscriptionDetailDTO;
import com.subscriptionmanager.dto.SubscriptionRequestDTO;
import com.subscriptionmanager.service.SubscriptionService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class SubscriptionController {

    private final SubscriptionService service;

    public SubscriptionController(SubscriptionService service) {
        this.service = service;
    }

    @GetMapping("/subscriptions")
    public List<SubscriptionDTO> getAll() {
        return service.getAll();
    }

    @GetMapping("/subscriptions/{id}")
    public SubscriptionDetailDTO getById(@PathVariable Long id) {
        return service.getById(id);
    }

    @PostMapping("/subscriptions")
    public ResponseEntity<SubscriptionDTO> create(@Valid @RequestBody SubscriptionRequestDTO request) {
        SubscriptionDTO created = service.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
