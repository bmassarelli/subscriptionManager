package com.subscriptionmanager.service;

import com.subscriptionmanager.dto.ClientRequestDTO;
import com.subscriptionmanager.dto.ClientResponseDTO;
import com.subscriptionmanager.entity.Client;
import com.subscriptionmanager.repository.ClientRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

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

    private ClientService service;

    @BeforeEach
    void setUp() {
        service = new ClientService(repository);
        lenient().when(repository.existsByEmail(any())).thenReturn(false);
        lenient().when(repository.existsByMsisdn(any())).thenReturn(false);
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
}
