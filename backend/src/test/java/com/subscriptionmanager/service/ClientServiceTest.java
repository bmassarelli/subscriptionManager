package com.subscriptionmanager.service;

import com.subscriptionmanager.dto.ClientRequestDTO;
import com.subscriptionmanager.dto.ClientResponseDTO;
import com.subscriptionmanager.entity.Client;
import com.subscriptionmanager.repository.ClientRepository;
import com.subscriptionmanager.repository.SubscriptionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ClientServiceTest {

    @Mock private ClientRepository repository;
    @Mock private SubscriptionRepository subscriptionRepository;

    private ClientService service;

    @BeforeEach
    void setUp() {
        service = new ClientService(repository, subscriptionRepository);
        lenient().when(repository.existsByEmail(any())).thenReturn(false);
        lenient().when(repository.existsByMsisdn(any())).thenReturn(false);
        lenient().when(repository.existsByEmailAndClientIdNot(any(), any())).thenReturn(false);
        lenient().when(repository.existsByMsisdnAndClientIdNot(any(), any())).thenReturn(false);
        lenient().when(subscriptionRepository.countByClient_ClientId(any())).thenReturn(0L);
    }

    private ClientRequestDTO buildRequest() {
        ClientRequestDTO request = new ClientRequestDTO();
        request.setName("John");
        request.setLastName("Doe");
        request.setEmail("john@doe.com");
        request.setMsisdn("+11234567890");
        return request;
    }

    @Test
    void createsClientWhenEmailAndMsisdnAreUnique() {
        when(repository.save(any())).thenAnswer(inv -> {
            Client c = inv.getArgument(0);
            c.setClientId(1L);
            return c;
        });

        ClientResponseDTO result = service.create(buildRequest());

        assertEquals(1L, result.getClientId());
        assertEquals("John", result.getName());
        assertEquals("john@doe.com", result.getEmail());
    }

    @Test
    void rejectsDuplicateEmail() {
        when(repository.existsByEmail("john@doe.com")).thenReturn(true);

        assertThrows(DuplicateClientFieldException.class, () -> service.create(buildRequest()));
        verify(repository, never()).save(any());
    }

    @Test
    void rejectsDuplicateMsisdn() {
        when(repository.existsByMsisdn("+11234567890")).thenReturn(true);

        assertThrows(DuplicateClientFieldException.class, () -> service.create(buildRequest()));
        verify(repository, never()).save(any());
    }

    @Test
    void listsAllClients() {
        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        when(repository.findAll()).thenReturn(List.of(client));

        List<ClientResponseDTO> result = service.getAll();

        assertEquals(1, result.size());
        assertEquals("John", result.get(0).getName());
    }

    @Test
    void getsClientById() {
        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        when(repository.findById(1L)).thenReturn(Optional.of(client));

        ClientResponseDTO result = service.getById(1L);

        assertEquals("John", result.getName());
    }

    @Test
    void throwsNotFoundForNonExistentClientOnGetById() {
        when(repository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(ClientNotFoundException.class, () -> service.getById(999L));
    }

    @Test
    void updatesClientWhenEmailAndMsisdnAreUnique() {
        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        when(repository.findById(1L)).thenReturn(Optional.of(client));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ClientRequestDTO request = buildRequest();
        request.setName("Jane");
        ClientResponseDTO result = service.update(1L, request);

        assertEquals("Jane", result.getName());
    }

    @Test
    void throwsNotFoundForNonExistentClientOnUpdate() {
        when(repository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(ClientNotFoundException.class, () -> service.update(999L, buildRequest()));
    }

    @Test
    void updateAllowsKeepingOwnCurrentEmailAndMsisdn() {
        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        when(repository.findById(1L)).thenReturn(Optional.of(client));
        when(repository.existsByEmailAndClientIdNot("john@doe.com", 1L)).thenReturn(false);
        when(repository.existsByMsisdnAndClientIdNot("+11234567890", 1L)).thenReturn(false);
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ClientResponseDTO result = service.update(1L, buildRequest());

        assertEquals("john@doe.com", result.getEmail());
    }

    @Test
    void rejectsUpdateToAnotherClientsEmail() {
        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        when(repository.findById(1L)).thenReturn(Optional.of(client));
        when(repository.existsByEmailAndClientIdNot("john@doe.com", 1L)).thenReturn(true);

        assertThrows(DuplicateClientFieldException.class, () -> service.update(1L, buildRequest()));
        verify(repository, never()).save(any());
    }

    @Test
    void deletesClientWithNoSubscriptions() {
        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        when(repository.findById(1L)).thenReturn(Optional.of(client));
        when(subscriptionRepository.countByClient_ClientId(1L)).thenReturn(0L);

        service.delete(1L);

        verify(repository).delete(client);
    }

    @Test
    void rejectsDeleteWhenClientHasSubscriptions() {
        Client client = new Client(1L, "John", "Doe", "john@doe.com", "+11234567890");
        when(repository.findById(1L)).thenReturn(Optional.of(client));
        when(subscriptionRepository.countByClient_ClientId(1L)).thenReturn(2L);

        assertThrows(ClientHasSubscriptionsException.class, () -> service.delete(1L));
        verify(repository, never()).delete(any());
    }

    @Test
    void throwsNotFoundForNonExistentClientOnDelete() {
        when(repository.findById(999L)).thenReturn(Optional.empty());

        assertThrows(ClientNotFoundException.class, () -> service.delete(999L));
    }
}
