package com.subscriptionmanager.service;

import com.subscriptionmanager.dto.ClientRequestDTO;
import com.subscriptionmanager.dto.ClientResponseDTO;
import com.subscriptionmanager.entity.Client;
import com.subscriptionmanager.repository.ClientRepository;
import com.subscriptionmanager.repository.SubscriptionRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class ClientService {

    private final ClientRepository repository;
    private final SubscriptionRepository subscriptionRepository;

    public ClientService(ClientRepository repository, SubscriptionRepository subscriptionRepository) {
        this.repository = repository;
        this.subscriptionRepository = subscriptionRepository;
    }

    public List<ClientResponseDTO> getAll() {
        return repository.findAll()
                .stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    public ClientResponseDTO create(ClientRequestDTO request) {
        if (repository.existsByEmail(request.getEmail())) {
            throw new DuplicateClientFieldException("email", "A client with this email already exists");
        }
        if (repository.existsByMsisdn(request.getMsisdn())) {
            throw new DuplicateClientFieldException("msisdn", "A client with this msisdn already exists");
        }

        Client client = new Client(null, request.getName(), request.getLastName(),
                request.getEmail(), request.getMsisdn());
        Client saved = repository.save(client);
        return toDTO(saved);
    }

    public ClientResponseDTO getById(Long id) {
        Client client = repository.findById(id)
                .orElseThrow(() -> new ClientNotFoundException("No client exists with id " + id));
        return toDTO(client);
    }

    public ClientResponseDTO update(Long id, ClientRequestDTO request) {
        Client client = repository.findById(id)
                .orElseThrow(() -> new ClientNotFoundException("No client exists with id " + id));

        if (repository.existsByEmailAndClientIdNot(request.getEmail(), id)) {
            throw new DuplicateClientFieldException("email", "A client with this email already exists");
        }
        if (repository.existsByMsisdnAndClientIdNot(request.getMsisdn(), id)) {
            throw new DuplicateClientFieldException("msisdn", "A client with this msisdn already exists");
        }

        client.setName(request.getName());
        client.setLastName(request.getLastName());
        client.setEmail(request.getEmail());
        client.setMsisdn(request.getMsisdn());

        Client saved = repository.save(client);
        return toDTO(saved);
    }

    public void delete(Long id) {
        Client client = repository.findById(id)
                .orElseThrow(() -> new ClientNotFoundException("No client exists with id " + id));

        long subscriptionCount = subscriptionRepository.countByClient_ClientId(id);
        if (subscriptionCount > 0) {
            throw new ClientHasSubscriptionsException(
                    "Cannot delete client " + id + ": " + subscriptionCount + " subscription(s) exist");
        }

        repository.delete(client);
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
