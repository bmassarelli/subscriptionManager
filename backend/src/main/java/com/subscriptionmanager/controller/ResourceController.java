package com.subscriptionmanager.controller;

import com.subscriptionmanager.dto.ResourceDTO;
import com.subscriptionmanager.dto.ResourceRequestDTO;
import com.subscriptionmanager.service.resource.ResourceService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class ResourceController {

    private final ResourceService service;

    public ResourceController(ResourceService service) {
        this.service = service;
    }

    @GetMapping("/subscriptions/{id}/resources")
    public List<ResourceDTO> getResources(@PathVariable Long id) {
        return service.getResources(id);
    }

    @PostMapping("/subscriptions/{id}/resources")
    public ResponseEntity<ResourceDTO> addResource(@PathVariable Long id,
                                                     @Valid @RequestBody ResourceRequestDTO request) {
        ResourceDTO created = service.addResource(id, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @DeleteMapping("/subscriptions/{id}/resources/{resourceId}")
    public ResponseEntity<Void> deleteResource(@PathVariable Long id, @PathVariable Long resourceId) {
        service.deleteResource(id, resourceId);
        return ResponseEntity.noContent().build();
    }
}
