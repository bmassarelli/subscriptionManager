package com.subscriptionmanager.controller;

import com.subscriptionmanager.dto.SubscriptionDTO;
import com.subscriptionmanager.service.SubscriptionService;
import org.springframework.web.bind.annotation.GetMapping;
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
}
