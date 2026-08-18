package com.subscriptionmanager.controller;

import com.subscriptionmanager.dto.ClientRequestDTO;
import com.subscriptionmanager.dto.ClientResponseDTO;
import com.subscriptionmanager.service.ClientService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class ClientController {

    private final ClientService service;

    public ClientController(ClientService service) {
        this.service = service;
    }

    @GetMapping("/clients")
    public List<ClientResponseDTO> getAll() {
        return service.getAll();
    }

    @PostMapping("/clients")
    public ResponseEntity<ClientResponseDTO> create(@Valid @RequestBody ClientRequestDTO request) {
        ClientResponseDTO created = service.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
