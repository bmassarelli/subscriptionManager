package com.subscriptionmanager.controller;

import com.subscriptionmanager.dto.LifecycleActionRequestDTO;
import com.subscriptionmanager.dto.LifecycleActionResultDTO;
import com.subscriptionmanager.dto.OperationDTO;
import com.subscriptionmanager.service.lifecycle.LifecycleActionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class SubscriptionLifecycleController {

    private final LifecycleActionService service;

    public SubscriptionLifecycleController(LifecycleActionService service) {
        this.service = service;
    }

    @PostMapping("/subscriptions/{id}/product-actions")
    public LifecycleActionResultDTO executeProductAction(@PathVariable Long id, @RequestBody LifecycleActionRequestDTO request) {
        return service.executeProductAction(id, request.getType(), request.getData());
    }

    @PostMapping("/subscriptions/{id}/service-actions")
    public LifecycleActionResultDTO executeServiceAction(@PathVariable Long id, @RequestBody LifecycleActionRequestDTO request) {
        return service.executeServiceAction(id, request.getType(), request.getData());
    }

    @GetMapping("/subscriptions/{id}/operations")
    public List<OperationDTO> getOperations(@PathVariable Long id) {
        return service.getOperations(id);
    }

    @GetMapping("/operations")
    public List<OperationDTO> getAllOperations() {
        return service.getAllOperations();
    }
}
