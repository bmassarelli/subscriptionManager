package com.subscriptionmanager.controller;

import com.subscriptionmanager.model.Subscription;
import com.subscriptionmanager.repository.SubscriptionRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/subscriptions")
public class SubscriptionController {

    private final SubscriptionRepository repository;

    public SubscriptionController(SubscriptionRepository repository) {
        this.repository = repository;
    }

    // GET /api/subscriptions
    @GetMapping
    public List<Subscription> getAll() {
        return repository.findAll();
    }

    // PUT /api/subscriptions/{id}/activate
    @PutMapping("/{id}/activate")
    public ResponseEntity<?> activate(@PathVariable Long id) {
        int updated = repository.activate(id);
        if (updated == 0) {
            return ResponseEntity.status(404)
                .body(Map.of("error", "Subscription not found or already active"));
        }
        return ResponseEntity.ok(Map.of("id", id, "status", "AC"));
    }

}
