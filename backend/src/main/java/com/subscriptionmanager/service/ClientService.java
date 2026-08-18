package com.subscriptionmanager.service;

import com.subscriptionmanager.dto.ClientRequestDTO;
import com.subscriptionmanager.dto.ClientResponseDTO;
import com.subscriptionmanager.entity.Client;
import com.subscriptionmanager.repository.ClientRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class ClientService {

    private final ClientRepository repository;

    public ClientService(ClientRepository repository) {
        this.repository = repository;
    }

    public List<ClientResponseDTO> getAll() {
        return repository.findAll()
                .stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    public ClientResponseDTO create(ClientRequestDTO request) {
        Client client = new Client(null, request.getName(), request.getLastName(),
                request.getEmail(), request.getMsisdn());
        Client saved = repository.save(client);
        return toDTO(saved);
    }

    private ClientResponseDTO toDTO(Client client) {
        return new ClientResponseDTO(
                client.getClientId(),
                client.getName(),
                client.getLastName(),
                client.getEmail(),
                client.getMsisdn()
        );
    }
}
